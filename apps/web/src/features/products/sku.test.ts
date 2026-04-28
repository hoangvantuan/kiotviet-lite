import { describe, expect, it } from 'vitest'

import { generateRandomSku } from './sku.js'

describe('generateRandomSku', () => {
  it('format đúng SP-NNNNNN (6 chữ số)', () => {
    for (let i = 0; i < 50; i++) {
      const sku = generateRandomSku()
      expect(sku).toMatch(/^SP-\d{6}$/)
      expect(sku).toHaveLength(9)
    }
  })
})
