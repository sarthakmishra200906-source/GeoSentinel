import 'dotenv/config'

const DEFAULT_MODEL = 'llama3.1:8b'
const DEFAULT_TIMEOUT_MS = 120000

function safeNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function safeText(value, fallback = '') {
  if (typeof value !== 'string') return fallback
  return value.replace(/[<>\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
}

// Only whitelisted rehearsal facts reach the model. No citizen reports, phone
// numbers, addresses or live telemetry are included in this prompt.
export function buildBriefFacts(payload = {}) {
  const resources = payload.resources || {}
  const districts = Array.isArray(payload.topDistricts) ? payload.topDistricts.slice(0, 3) : []
  return {
    scenarioName: safeText(payload.scenarioName, 'Cyclone rehearsal'),
    hours: Math.max(1, Math.min(48, Math.round(safeNumber(payload.hours, 24)))),
    startLatitude: safeNumber(payload.startLatitude),
    startLongitude: safeNumber(payload.startLongitude),
    headingDeg: safeNumber(payload.headingDeg),
    windSpeedKmh: safeNumber(payload.windSpeedKmh),
    peakHour: Math.max(0, Math.round(safeNumber(payload.peakHour))),
    peakRiskTier: safeText(payload.peakRiskTier, 'UNAVAILABLE'),
    peakRiskScore: Math.max(0, Math.min(1, safeNumber(payload.peakRiskScore))),
    peakRainMm: safeNumber(payload.peakRainMm),
    peakRiverM3s: safeNumber(payload.peakRiverM3s),
    viewedHour: Math.max(0, Math.round(safeNumber(payload.viewedHour))),
    resourceTeams: Math.max(0, Math.round(safeNumber(resources.rescueTeams))),
    resourceBoats: Math.max(0, Math.round(safeNumber(resources.boats))),
    resourceParamedics: Math.max(0, Math.round(safeNumber(resources.paramedics))),
    landfallHour: payload.landfallHour === null || payload.landfallHour === undefined
      ? null
      : Math.max(0, Math.round(safeNumber(payload.landfallHour))),
    trackModel: safeText(payload.trackModel, 'forward_forecast'),
    topDistricts: districts.map((district) =>
      `${safeText(district.name, 'District')} (${safeText(district.riskTier, 'risk unknown')})`,
    ),
  }
}

export function deterministicBrief(facts) {
  const landfall = facts.landfallHour === null
    ? 'No landfall hour was projected for this track.'
    : `The projected first landfall is near hour ${facts.landfallHour}.`
  return {
    userHelp: `This isolated rehearsal created no public SOS, help request or dispatch. Before live use, connect and test a separate incident inbox so real citizen reports are visible to operators.`,
    aiInsight: `Peak synthetic risk is ${facts.peakRiskTier} at hour ${facts.peakHour} (${Math.round(facts.peakRiskScore * 100)}%), with peak rain ${facts.peakRainMm.toFixed(1)} mm/h and a river proxy of ${facts.peakRiverM3s.toFixed(1)} m3/s. ${landfall} These are rule-matrix projections, not official forecasts.`,
    finalReview: `Validate the track and rainfall against gauges and verified incident data before operational use. Also confirm resource reservations and keep every generated report signed and archived.`,
  }
}

function parseBrief(answer) {
  const section = (label) => {
    const match = answer.match(new RegExp(`^${label}:\\s*(.+)$`, 'im'))
    return match ? match[1].trim().slice(0, 700) : ''
  }
  return {
    userHelp: section('USER HELP'),
    aiInsight: section('AI INSIGHT'),
    finalReview: section('FINAL REVIEW'),
  }
}

export async function generateSimulationBrief(payload) {
  const facts = buildBriefFacts(payload)
  const fallback = deterministicBrief(facts)
  const baseUrl = String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '')
  const model = String(process.env.OLLAMA_MODEL || DEFAULT_MODEL).trim()
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.OLLAMA_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  )
  const prompt = `You are writing a compact decision brief for an admin disaster-management dashboard. Use only the synthetic rehearsal facts below. Never invent real incidents, official orders, emergency phone numbers, shelter capacity or live conditions. Write exactly three plain-text sections, each one or two sentences, each on its own line starting with the exact prefix shown:
USER HELP: explain that this isolated rehearsal created no public SOS or help report, and name one thing operators must test before live use.
AI INSIGHT: explain the peak synthetic risk hour and the dominant rain or river signal from these facts.
FINAL REVIEW: give the two most important validation steps before operational use.
No Markdown, no bullets, no asterisks, no headings beyond the three prefixes. At most 10 lines total.

Rehearsal facts:
${JSON.stringify(facts, null, 2)}`

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        keep_alive: '10m',
        options: { temperature: 0, seed: 42, num_ctx: 4096, num_predict: 500 },
      }),
    })
    if (!response.ok) {
      return { ...fallback, provider: 'ollama', model, source: 'fallback', warning: `Ollama returned HTTP ${response.status}.` }
    }
    const body = await response.json()
    const parsed = parseBrief(typeof body.response === 'string' ? body.response : '')
    if (!parsed.userHelp || !parsed.aiInsight || !parsed.finalReview) {
      return { ...fallback, provider: 'ollama', model: body.model || model, source: 'fallback', warning: 'Ollama response did not contain all three sections.' }
    }
    return { ...parsed, provider: 'ollama', model: body.model || model, source: 'ollama', warning: null }
  } catch (error) {
    return {
      ...fallback,
      provider: 'ollama',
      model,
      source: 'fallback',
      warning: error.name === 'AbortError' ? 'Ollama brief generation timed out.' : `Ollama brief generation unavailable: ${error.message}`,
    }
  } finally {
    clearTimeout(timeout)
  }
}
