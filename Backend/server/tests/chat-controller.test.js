import test from 'node:test'
import assert from 'node:assert/strict'
import GuidelineDocument from '../models/GuidelineDocument.js'
import { handleUserChat } from '../controllers/chatController.js'

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

test('guest chat answers cached safety questions without an account', async () => {
  const response = responseRecorder()
  await handleUserChat({ body: { message: 'What should I do during a flood?' } }, response, (error) => { throw error })

  assert.equal(response.statusCode, 200)
  assert.match(response.body.data.answer, /floodwater/i)
  assert.equal(response.body.data.currentMemorySummary, 'No signed-in chat history.')
})

test('guest chat explains when no provider is configured for an unsupported question', async () => {
  const originalFind = GuidelineDocument.find
  const providerKeys = [
    'LLM_API_URL',
    'LLM_API_KEY',
    'GOOGLE_GEMINI_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'OLLAMA_FALLBACK_ENABLED',
  ]
  const originalProviderValues = Object.fromEntries(providerKeys.map((key) => [key, process.env[key]]))
  providerKeys.forEach((key) => { delete process.env[key] })
  process.env.OLLAMA_FALLBACK_ENABLED = 'false'
  GuidelineDocument.find = () => ({
    select: () => ({ lean: async () => [] }),
  })
  try {
    const response = responseRecorder()
    await handleUserChat({ body: { message: 'What is the exact water level at my street?' } }, response, (error) => { throw error })

    assert.equal(response.statusCode, 200)
    assert.equal(response.body.data.status, 'PROVIDER_UNAVAILABLE')
    assert.match(response.body.data.answer, /AI provider is not configured/i)
    assert.match(response.body.data.warnings[0], /GOOGLE_GEMINI_API_KEY/)
    assert.equal(response.body.data.currentMemorySummary, 'No signed-in chat history.')
  } finally {
    GuidelineDocument.find = originalFind
    for (const key of providerKeys) {
      if (originalProviderValues[key] === undefined) delete process.env[key]
      else process.env[key] = originalProviderValues[key]
    }
  }
})

test('chat caps grounded answers to 10 plain lines and returns compact sources', async () => {
  const originalFind = GuidelineDocument.find
  const originalFetch = globalThis.fetch
  const keys = [
    'LLM_API_URL',
    'LLM_API_KEY',
    'GOOGLE_GEMINI_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'OLLAMA_FALLBACK_ENABLED',
  ]
  const originalValues = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  for (const key of keys) delete process.env[key]
  process.env.GOOGLE_GEMINI_API_KEY = 'test-gemini-key'
  process.env.OLLAMA_FALLBACK_ENABLED = 'false'

  GuidelineDocument.find = () => ({
    select: () => ({
      lean: async () => [{
        _id: 'approved-doc',
        title: 'Approved mapping plan',
        issuingAuthority: 'Government of Odisha',
        officialUrl: 'https://example.gov.in/plan.pdf',
        chunks: Array.from({ length: 5 }, (_, index) => ({
          text: `Mapping activity ${index + 1} forPreparedness safety.`,
          page: index + 1,
          section: 'Preparedness',
        })),
      }],
    }),
  })
  const rawAnswer = Array.from(
    { length: 15 },
    (_, index) => `**Point ${index + 1}:** Identify mapping resources [1].`,
  ).join('\n')
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: rawAnswer }] } }] }),
  })

  try {
    const response = responseRecorder()
    await handleUserChat(
      { body: { message: 'What mapping activities are described in the approved plan?' } },
      response,
      (error) => { throw error },
    )

    const lines = response.body.data.answer.split('\n').filter(Boolean)
    assert.equal(lines.length, 10)
    assert.ok(lines.every((line) => !line.includes('*')))
    assert.equal(response.body.data.status, 'GROUNDED')
    assert.equal(response.body.data.sources.length, 3)
    assert.ok(response.body.data.sources.every((source) => !Object.hasOwn(source, 'context')))
    assert.match(response.body.data.sources[0].label, /^Approved mapping plan, p\. \d+$/)
  } finally {
    GuidelineDocument.find = originalFind
    globalThis.fetch = originalFetch
    for (const key of keys) {
      if (originalValues[key] === undefined) delete process.env[key]
      else process.env[key] = originalValues[key]
    }
  }
})
