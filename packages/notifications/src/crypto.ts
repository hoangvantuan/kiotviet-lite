import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function parseKey(key: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('Invalid hex in encryption key: must be exactly 64 hex characters (32 bytes)')
  }
  return Buffer.from(key, 'hex')
}

export function encrypt(plaintext: string, key: string): string {
  const keyBuf = parseKey(key)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, keyBuf, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, encrypted, authTag]).toString('base64')
}

export function decrypt(ciphertext: string, key: string): Record<string, unknown> {
  const keyBuf = parseKey(key)
  const buf = Buffer.from(ciphertext, 'base64')

  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid ciphertext: too short')
  }

  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(-AUTH_TAG_LENGTH)
  const data = buf.subarray(IV_LENGTH, -AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, keyBuf, iv)
  decipher.setAuthTag(authTag)

  const decrypted = decipher.update(data, undefined, 'utf8') + decipher.final('utf8')
  const parsed: unknown = JSON.parse(decrypted)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Decrypted config must be a JSON object')
  }
  return parsed as Record<string, unknown>
}
