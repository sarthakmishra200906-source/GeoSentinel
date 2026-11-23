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
  ]
  const originalProviderValues = Object.fromEntries(providerKeys.map((key) => [key, process.env[key]]))
  providerKeys.forEach((key) => { delete process.env[key] })
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
