import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeReportCursor, encodeReportCursor } from '../services/reportCursor.js'

test('report cursor round-trips the created time and identifier', () => {
  const report = {
    _id: '507f1f77bcf86cd799439011',
    createdAt: new Date('2026-11-15T00:00:00.000Z'),
  }

  assert.deepEqual(decodeReportCursor(encodeReportCursor(report)), {
    id: report._id,
    createdAt: report.createdAt,
  })
})

test('report cursor rejects invalid ids and malformed payloads', () => {
  const invalidId = Buffer.from(JSON.stringify({
    createdAt: '2026-11-15T00:00:00.000Z',
    id: 'not-an-object-id',
  }), 'utf8').toString('base64url')

  assert.equal(decodeReportCursor(invalidId), null)
  assert.equal(decodeReportCursor('not-base64-json'), null)
})
