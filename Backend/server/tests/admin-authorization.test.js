import test from 'node:test'
import assert from 'node:assert/strict'
import { requireRoles } from '../middleware/roles.js'
import { assertExpectedVersion } from '../services/rescueCenterConcurrency.js'

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
    },
  }
}

test('admin role guard rejects unauthenticated requests', () => {
  const response = responseRecorder()
  let called = false
  requireRoles('admin')({ user: null }, response, () => { called = true })
  assert.equal(response.statusCode, 403)
  assert.deepEqual(response.body, { error: 'Insufficient permissions' })
  assert.equal(called, false)
})

test('admin role guard rejects ordinary users', () => {
  const response = responseRecorder()
  let called = false
  requireRoles('admin')({ user: { role: 'user' } }, response, () => { called = true })
  assert.equal(response.statusCode, 403)
  assert.equal(called, false)
})

test('admin role guard allows admins', () => {
  const response = responseRecorder()
  let called = false
  requireRoles('admin')({ user: { role: 'admin' } }, response, () => { called = true })
  assert.equal(response.statusCode, null)
  assert.equal(called, true)
})

test('rescue-center concurrency rejects a missing version', () => {
  assert.throws(
    () => assertExpectedVersion(undefined, 2),
    (error) => error.statusCode === 428,
  )
})

test('rescue-center concurrency rejects stale versions', () => {
  assert.throws(
    () => assertExpectedVersion(1, 2),
    (error) => error.statusCode === 409,
  )
})

test('rescue-center concurrency accepts the current version', () => {
  assert.doesNotThrow(() => assertExpectedVersion(2, 2))
})
