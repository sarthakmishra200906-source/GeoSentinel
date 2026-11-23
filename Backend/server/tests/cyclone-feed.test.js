import test from 'node:test'
import assert from 'node:assert/strict'
import { createCycloneFeed } from '../services/cycloneFeed.js'

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
    fetchImpl: async () => {
      calls += 1
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
  let release
  const fetchImpl = () => {
    calls += 1
    return new Promise((resolve) => {
      release = () => resolve(providerResponse([currentEvent()]))
    })
  }
  const feed = createCycloneFeed({ now: () => NOW, fetchImpl })
  const firstRequest = feed.getCurrentEvents()
  const secondRequest = feed.getCurrentEvents()
  release()

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
