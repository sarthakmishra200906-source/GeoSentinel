import test from 'node:test'
import assert from 'node:assert/strict'
import { getCachedFaqAnswer } from '../services/faqCache.js'

test('FAQ cache answers common safety questions without provider work', () => {
  const answer = getCachedFaqAnswer('What should I do during FLOODING?')
  assert.equal(answer?.source.documentId, 'builtin-basic-safety-faq')
  assert.match(answer.answer, /floodwater/i)
  assert.match(getCachedFaqAnswer('hii').answer, /Resq-AI Disaster Assistance Guide/)
})

test('FAQ cache uses word boundaries instead of substring matches', () => {
  assert.equal(getCachedFaqAnswer('Please recall the report'), null)
  assert.ok(getCachedFaqAnswer('Where is the nearest shelter?'))
})

test('FAQ cache handles punctuation and invalid input safely', () => {
  assert.ok(getCachedFaqAnswer('  HEATWAVE!!!  '))
  assert.equal(getCachedFaqAnswer(null), null)
  assert.equal(getCachedFaqAnswer(''), null)
})
