import test from 'node:test'
import assert from 'node:assert/strict'
import { generateGroundedAnswer, getLlmProviderStatus } from '../services/groundedChat.js'

const providerKeys = [
  'LLM_API_URL',
  'LLM_API_KEY',
  'GOOGLE_GEMINI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GEMINI_MODEL',
  'OLLAMA_FALLBACK_ENABLED',
  'OLLAMA_BASE_URL',
  'OLLAMA_MODEL',
  'OLLAMA_TIMEOUT_MS',
]

function saveProviderConfig() {
  return Object.fromEntries(providerKeys.map((key) => [key, process.env[key]]))
}

function restoreProviderConfig(original) {
  for (const key of providerKeys) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
}

test('configured Gemini key receives general questions without requiring an RAG match', async () => {
  const originalConfig = saveProviderConfig()
  const originalFetch = globalThis.fetch
  let requestBody
  process.env.GOOGLE_GEMINI_API_KEY = 'test-gemini-key'
  process.env.GOOGLE_GEMINI_MODEL = 'test-model'
  delete process.env.LLM_API_URL
  delete process.env.LLM_API_KEY
  delete process.env.GEMINI_API_KEY
  delete process.env.GOOGLE_API_KEY
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body)
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Keep an emergency kit ready.' }] } }] }),
    }
  }

  try {
    const result = await generateGroundedAnswer({ question: 'What should I pack?', matches: [] })
    assert.equal(result.status, 'GENERAL_AI')
    assert.equal(result.answer, 'Keep an emergency kit ready.')
    assert.equal(getLlmProviderStatus(), 'gemini')
    assert.match(requestBody.contents[0].parts[0].text, /Do not invent evacuation orders/)
  } finally {
    globalThis.fetch = originalFetch
    restoreProviderConfig(originalConfig)
  }
})

test('placeholder API keys are reported as unconfigured', async () => {
  const originalConfig = saveProviderConfig()
  process.env.LLM_API_KEY = 'replace-with-your-llm-api-key'
  process.env.OLLAMA_FALLBACK_ENABLED = 'false'
  for (const key of ['LLM_API_URL', 'GOOGLE_GEMINI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY']) {
    delete process.env[key]
  }

  try {
    const result = await generateGroundedAnswer({ question: 'How do I stay safe?', matches: [] })
    assert.equal(result.status, 'PROVIDER_UNAVAILABLE')
    assert.equal(getLlmProviderStatus(), 'offline')
  } finally {
    restoreProviderConfig(originalConfig)
  }
})

function mockOllamaFallback(originalFetch, remoteShouldFail) {
  let ollamaBody
  globalThis.fetch = async (url, options) => {
    const target = String(url)
    if (target.includes('generativelanguage.googleapis.com')) {
      if (!remoteShouldFail) {
        return {
          ok: true,
          json: async () => ({ candidates: [{ content: { parts: [{ text: 'Remote answer.' }] } }] }),
        }
      }
      return {
        ok: false,
        status: 404,
        text: async () => '{"error":{"code":404,"message":"model unavailable"}}',
      }
    }
    if (target.includes('/api/generate')) {
      ollamaBody = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => ({ response: 'Use the listed safe shelters and evacuation routes [1].', model: 'llama3.1:8b' }),
      }
    }
    throw new Error(`Unexpected fetch URL: ${target}`)
  }
  return () => ollamaBody
}

const groundedMatches = [{
  document: { title: 'Approved plan', issuingAuthority: 'Government' },
  chunk: { text: 'Identify safe shelters and safe routes for evacuation.', page: 4 },
}]

test('local Ollama answers with approved context when Gemini fails', async () => {
  const originalConfig = saveProviderConfig()
  const originalFetch = globalThis.fetch
  process.env.GOOGLE_GEMINI_API_KEY = 'test-gemini-key'
  process.env.GOOGLE_GEMINI_MODEL = 'test-model'
  process.env.OLLAMA_FALLBACK_ENABLED = 'true'
  process.env.OLLAMA_MODEL = 'llama3.1:8b'
  process.env.OLLAMA_TIMEOUT_MS = '1000'
  delete process.env.LLM_API_URL
  delete process.env.LLM_API_KEY
  delete process.env.GEMINI_API_KEY
  delete process.env.GOOGLE_API_KEY
  const getOllamaBody = mockOllamaFallback(originalFetch, true)

  try {
    const result = await generateGroundedAnswer({ question: 'Where should people go?', matches: groundedMatches })
    assert.equal(result.status, 'GROUNDED')
    assert.equal(result.provider, 'ollama')
    assert.equal(result.model, 'llama3.1:8b')
    assert.equal(result.answer, 'Use the listed safe shelters and evacuation routes [1].')
    assert.match(result.warning, /Primary provider failed; local Ollama fallback answered/)
    assert.equal(result.diagnostics.primaryFailure.httpStatus, 404)
    const body = getOllamaBody()
    assert.equal(body.model, 'llama3.1:8b')
    assert.equal(body.options.temperature, 0)
    assert.equal(body.options.num_ctx, 8192)
    assert.match(body.prompt, /\[1\] Source: Approved plan, page 4/)
  } finally {
    globalThis.fetch = originalFetch
    restoreProviderConfig(originalConfig)
  }
})

test('local Ollama answers when no remote provider is configured', async () => {
  const originalConfig = saveProviderConfig()
  const originalFetch = globalThis.fetch
  process.env.OLLAMA_FALLBACK_ENABLED = 'true'
  process.env.OLLAMA_MODEL = 'llama3.1:8b'
  process.env.OLLAMA_TIMEOUT_MS = '1000'
  for (const key of ['LLM_API_URL', 'LLM_API_KEY', 'GOOGLE_GEMINI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY']) {
    delete process.env[key]
  }
  mockOllamaFallback(originalFetch, false)

  try {
    const result = await generateGroundedAnswer({ question: 'Where should people go?', matches: groundedMatches })
    assert.equal(result.status, 'GROUNDED')
    assert.equal(result.provider, 'ollama')
    assert.match(result.warning, /no remote language-model provider is configured/)
  } finally {
    globalThis.fetch = originalFetch
    restoreProviderConfig(originalConfig)
  }
})
