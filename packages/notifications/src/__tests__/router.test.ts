import { describe, expect, it } from 'vitest'

import { isSeverityGte } from '../router.js'

describe('isSeverityGte', () => {
  it('info >= info', () => {
    expect(isSeverityGte('info', 'info')).toBe(true)
  })

  it('error >= info', () => {
    expect(isSeverityGte('error', 'info')).toBe(true)
  })

  it('critical >= error', () => {
    expect(isSeverityGte('critical', 'error')).toBe(true)
  })

  it('info < error', () => {
    expect(isSeverityGte('info', 'error')).toBe(false)
  })

  it('warn < critical', () => {
    expect(isSeverityGte('warn', 'critical')).toBe(false)
  })

  it('warn >= warn', () => {
    expect(isSeverityGte('warn', 'warn')).toBe(true)
  })
})
