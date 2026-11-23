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
