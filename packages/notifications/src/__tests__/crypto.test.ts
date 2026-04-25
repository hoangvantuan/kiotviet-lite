import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { decrypt, encrypt } from '../crypto.js'

const validKey = randomBytes(32).toString('hex')

describe('encrypt/decrypt', () => {
  it('round-trip with JSON object', () => {
    const original = { botToken: 'abc123', chatId: '-100' }
    const ciphertext = encrypt(JSON.stringify(original), validKey)
    const result = decrypt(ciphertext, validKey)
    expect(result).toEqual(original)
  })

  it('fails with wrong key', () => {
    const otherKey = randomBytes(32).toString('hex')
    const ciphertext = encrypt(JSON.stringify({ test: true }), validKey)
    expect(() => decrypt(ciphertext, otherKey)).toThrow()
  })

  it('fails with tampered ciphertext', () => {
    const ciphertext = encrypt(JSON.stringify({ test: true }), validKey)
    const buf = Buffer.from(ciphertext, 'base64')
    buf[buf.length - 1]! ^= 0xff
    const tampered = buf.toString('base64')
    expect(() => decrypt(tampered, validKey)).toThrow()
  })

  it('throws on invalid key length', () => {
    expect(() => encrypt('test', 'shortkey')).toThrow(/32 bytes/)
  })

  it('throws on empty/too-short ciphertext', () => {
    expect(() => decrypt('', validKey)).toThrow()
    expect(() => decrypt(Buffer.alloc(10).toString('base64'), validKey)).toThrow()
  })
})
