import test from 'node:test'
import assert from 'node:assert/strict'
import { getCachedFaqAnswer, getSafeGeneralSafetyFallback } from '../services/faqCache.js'

test('FAQ cache answers common safety questions without provider work', () => {
  const answer = getCachedFaqAnswer('What should I do during FLOODING?')
  assert.equal(answer?.source.documentId, 'builtin-basic-safety-faq')
  assert.match(answer.answer, /floodwater/i)
  assert.match(getCachedFaqAnswer('hii').answer, /I’m Resq-AI/)
})

test('greetings identify Resq-AI without requiring voice input or an LLM', () => {
  for (const greeting of ['hi', 'hii', 'hiiii', 'hi there', 'hey!', 'howdy']) {
    assert.match(getCachedFaqAnswer(greeting)?.answer || '', /I’m Resq-AI/)
  }
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

test('FAQ answers cover natural disaster questions with a traceable general source', () => {
  const cases = [
    ['What should I do before a cyclone?', /cyclone shelter/i],
    ['How do I stay safe during flooding?', /floodwater/i],
    ['Where is safe during a thunderstorm?', /thunder/i],
    ['Which emergency helpline should I call in India?', /112/],
    ['What should I pack in an emergency go-bag?', /go-bag/i],
  ]
  for (const [question, expected] of cases) {
    const answer = getCachedFaqAnswer(question)
    assert.ok(answer, `Expected an FAQ answer for: ${question}`)
    assert.match(answer.answer, expected)
    assert.equal(answer.source.officialUrl, 'https://ndma.gov.in')
    assert.equal(answer.source.scope, 'general')
  }
})

test('FAQ fallback stays relevant for longer questions without matching unrelated topics', () => {
  const fallback = getSafeGeneralSafetyFallback('Can you explain what I should do if an earthquake starts while I am indoors?')
  assert.match(fallback.answer, /Drop to your hands and knees/i)
  assert.equal(getSafeGeneralSafetyFallback('Please summarise the quarterly financial report'), null)
})
