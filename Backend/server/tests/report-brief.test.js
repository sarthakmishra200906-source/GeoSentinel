import test from 'node:test'
import assert from 'node:assert/strict'
import { generateSimulationBrief } from '../services/reportBriefService.js'

const facts = {
  scenarioName: 'Bay of Bengal forward forecast',
  hours: 24,
  peakHour: 12,
  peakRiskTier: 'HIGH',
  peakRiskScore: 0.82,
  peakRainMm: 140.5,
  peakRiverM3s: 3100,
  viewedHour: 12,
  resources: { rescueTeams: 8, boats: 4, paramedics: 6 },
  landfallHour: 19,
}

test('report brief uses deterministic fallback when Ollama is unavailable', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 500 })
  try {
    const brief = await generateSimulationBrief(facts)
    assert.equal(brief.source, 'fallback')
    assert.match(brief.warning, /HTTP 500/)
    assert.match(brief.userHelp, /no public SOS/i)
    assert.match(brief.aiInsight, /hour 12/)
    assert.match(brief.finalReview, /Validate/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('report brief parses the three Ollama dashboard sections', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body)
    assert.equal(body.options.temperature, 0)
    assert.equal(body.stream, false)
    return {
      ok: true,
      json: async () => ({
        model: 'llama3.1:8b',
        response: [
          'USER HELP: No public SOS was created by this isolated rehearsal; test the incident inbox before live use.',
          'AI INSIGHT: Peak synthetic risk is HIGH at hour 12 with 140.5 mm/h rain; it is not an official forecast.',
          'FINAL REVIEW: Validate against gauges, then confirm reservations and signed report archiving.',
        ].join('\n'),
      }),
    }
  }
  try {
    const brief = await generateSimulationBrief(facts)
    assert.equal(brief.source, 'ollama')
    assert.equal(brief.model, 'llama3.1:8b')
    assert.match(brief.userHelp, /incident inbox/)
    assert.match(brief.aiInsight, /hour 12/)
    assert.match(brief.finalReview, /gauges/)
    assert.equal(brief.warning, null)
  } finally {
    globalThis.fetch = originalFetch
  }
})
