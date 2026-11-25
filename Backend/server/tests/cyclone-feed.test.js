import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createCycloneFeed,
  mergeStormTracks,
  parseAtcfText,
  parseNhcCurrent,
} from '../services/cycloneFeed.js'

const NOW = Date.parse('2026-11-15T00:00:00.000Z')

function providerResponse(features) {
  return { ok: true, json: async () => ({ features }) }
}

function currentEvent(overrides = {}) {
  return {
    geometry: { type: 'LineString', coordinates: [[86, 19], [87, 20]] },
    properties: {
      eventid: 42,
      name: 'Test Cyclone',
      country: 'Bay of Bengal',
      fromdate: '2026-11-14T00:00:00.000Z',
      todate: '2026-11-16T00:00:00.000Z',
      ...overrides,
    },
  }
}

test('cyclone feed distinguishes an available empty result from provider failure', async () => {
  let calls = 0
  const feed = createCycloneFeed({
    now: () => NOW,
    fetchImpl: async (url) => {
      if (String(url).includes('gdacs')) calls += 1
      return providerResponse([])
    },
  })

  const result = await feed.getCurrentEvents()
  const cached = await feed.getCurrentEvents()
  assert.equal(result.available, true)
  assert.equal(result.live, false)
  assert.equal(result.status, 'no_current_events')
  assert.deepEqual(result.tracks, [])
  assert.equal(calls, 1)
  assert.deepEqual(cached, result)
})

test('cyclone feed returns current India-region tracks and preserves line geometry', async () => {
  const feed = createCycloneFeed({
    now: () => NOW,
    fetchImpl: async () => providerResponse([currentEvent()]),
  })

  const result = await feed.getCurrentEvents()
  assert.equal(result.available, true)
  assert.equal(result.live, true)
  assert.equal(result.tracks[0].status, 'ACTIVE_LIVE_GDACS')
  assert.deepEqual(result.tracks[0].coordinates, [[19, 86], [20, 87]])
  assert.equal(result.tracks[0].locationType, 'LineString')
})

test('cyclone feed retains recent ended events with an explicit historical status', async () => {
  const recentEvent = currentEvent({
    fromdate: '2026-11-01T00:00:00',
    todate: '2026-11-03T06:00:00',
  })
  recentEvent.geometry = { type: 'Point', coordinates: [80.2, 15.8] }
  const feed = createCycloneFeed({
    now: () => NOW,
    fetchImpl: async () => providerResponse([
      recentEvent,
      currentEvent({
        eventid: 41,
        fromdate: '2026-10-01T00:00:00',
        todate: '2026-10-03T06:00:00',
      }),
    ]),
  })

  const result = await feed.getCurrentEvents()
  assert.equal(result.available, true)
  assert.equal(result.live, false)
  assert.equal(result.status, 'recent_events')
  assert.equal(result.recentCount, 1)
  assert.equal(result.tracks[0].status, 'RECENT_GDACS')
  assert.equal(result.tracks[0].validUntil, '2026-11-03T06:00:00')
  assert.equal(result.tracks[0].locationType, 'Point')
  assert.deepEqual(result.tracks[0].coordinates, [[15.8, 80.2]])
})

test('cyclone feed marks future regional events as upcoming rather than active', async () => {
  const feed = createCycloneFeed({
    now: () => NOW,
    fetchImpl: async () => providerResponse([
      currentEvent({
        fromdate: '2026-11-16T00:00:00',
        todate: '2026-11-18T00:00:00',
      }),
    ]),
  })

  const result = await feed.getCurrentEvents()
  assert.equal(result.live, false)
  assert.equal(result.status, 'upcoming_events')
  assert.equal(result.upcomingCount, 1)
  assert.equal(result.tracks[0].status, 'UPCOMING_GDACS')
})

test('cyclone feed reports provider failure and deduplicates concurrent requests', async () => {
  let calls = 0
  const releases = []
  const fetchImpl = (url) => {
    if (String(url).includes('gdacs')) calls += 1
    return new Promise((resolve) => {
      releases.push(() => resolve(providerResponse([currentEvent()])))
    })
  }
  const feed = createCycloneFeed({ now: () => NOW, fetchImpl })
  const firstRequest = feed.getCurrentEvents()
  const secondRequest = feed.getCurrentEvents()
  releases.forEach((release) => release())

  const [first, second] = await Promise.all([firstRequest, secondRequest])
  assert.equal(calls, 1)
  assert.equal(first.available, true)
  assert.deepEqual(second, first)

  const failingFeed = createCycloneFeed({
    now: () => NOW,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  })
  const unavailable = await failingFeed.getCurrentEvents()
  assert.equal(unavailable.available, false)
  assert.equal(unavailable.status, 'unavailable')
  assert.deepEqual(unavailable.tracks, [])
})

const ATCF_LINES = [
  'WP, 90, 2026111500, 00, BEST, 0, 145N, 1450E, 20, 1004, DB, 90W',
  'WP, 90, 2026111500, 12, FWFM, 0, 160N, 1435E, 30, 998, TS, 90W',
  'IO, 91, 2026111500, 00, BEST, 0, 120N, 0885E, 25, 1000, TD, 91A',
].join('\n')

function multiSourceFetch(atcfText = ATCF_LINES, features = []) {
  return async (url) => {
    const target = String(url)
    if (target.includes('gdacs')) return providerResponse(features)
    if (target.includes('nhc.noaa')) {
      return { ok: true, json: async () => ({ activeStorms: [] }) }
    }
    return { ok: true, text: async () => atcfText }
  }
}

test('ATCF parser reads invests, forecast points and intensities', () => {
  const storms = parseAtcfText(ATCF_LINES, { id: 'JTWC-WP', basin: 'Western Pacific' }, NOW)
  const invest = storms.find((storm) => storm.id.includes('WP90'))

  assert.equal(storms.length, 2)
  assert.equal(invest.status, 'FORMING_INVEST')
  assert.match(invest.name, /Invest 90W/)
  assert.deepEqual(invest.coordinates, [[14.5, 145]])
  assert.equal(invest.maxWindKmh, 37)
  assert.deepEqual(invest.forecastTrack, [[16, 143.5, 12]])
})

test('NHC current-storm JSON is normalized into active tracks', () => {
  const tracks = parseNhcCurrent({
    activeStorms: [{ id: 'AL092026', name: 'Nina', classification: 'TS', latitude: 25.4, longitude: -70.2 }],
  }, NOW)
  assert.equal(tracks[0].status, 'ACTIVE_ATCF')
  assert.equal(tracks[0].category, 'Tropical Storm')
  assert.deepEqual(tracks[0].coordinates, [[25.4, -70.2]])
})

test('storms are deduplicated by name and source list is preserved', () => {
  const merged = mergeStormTracks([
    { id: 'gdacs-1', name: '🌀 Nina', status: 'ACTIVE_LIVE_GDACS', coordinates: [[19, 87]], sources: ['GDACS'] },
    { id: 'nhc-1', name: '🌀 Nina', status: 'ACTIVE_ATCF', coordinates: [[25, -70]], sources: ['NHC'], forecastTrack: [[26, -71, 12]] },
  ])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].status, 'ACTIVE_LIVE_GDACS')
  assert.deepEqual(merged[0].sources.sort(), ['GDACS', 'NHC'])
  assert.equal(merged[0].forecastTrack.length, 1)
})

test('global scope includes worldwide invests while India scope filters them out', async () => {
  const feed = createCycloneFeed({ now: () => NOW, fetchImpl: multiSourceFetch() })
  const global = await feed.getCurrentEvents({ scope: 'global' })
  const india = await feed.getCurrentEvents({ scope: 'india' })

  assert.equal(global.available, true)
  assert.equal(global.tracks.length, 2)
  assert.equal(global.formingCount, 2)
  assert.ok(global.tracks.some((track) => track.id.includes('WP90')))
  assert.equal(india.tracks.length, 1)
  assert.ok(india.tracks[0].id.includes('IO91'))
  assert.equal(india.scope, 'india')
})
