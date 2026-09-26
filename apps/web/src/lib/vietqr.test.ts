import { describe, expect, it } from 'vitest'

import {
  buildVietQrPayload,
  crc16Ccitt,
  isBankConfigured,
  normalizeTransferNote,
  posTransferNote,
} from './vietqr'

/** Tách chuỗi EMVCo thành các cặp ID, giá trị để kiểm cấu trúc */
function parseTlv(payload: string): Record<string, string> {
  const out: Record<string, string> = {}
  let i = 0
  while (i < payload.length) {
    const id = payload.slice(i, i + 2)
    const len = Number(payload.slice(i + 2, i + 4))
    out[id] = payload.slice(i + 4, i + 4 + len)
    i += 4 + len
  }
  return out
}

describe('POS-07: VietQR sinh trên máy', () => {
  it('CRC16-CCITT-FALSE đúng vector chuẩn "123456789" = 29B1', () => {
    expect(crc16Ccitt('123456789')).toBe('29B1')
  })

  it('CRC khớp mã VietQR thật đã công bố (vector ngoài, CRC 5859)', () => {
    const published =
      '00020101021238590010A0000007270141000697044101156607040600001290208QRIBFTTA5204581253037045405500005802VN5901_6011HO CHI MINH99210010A0000007270203abc63045859'
    const body = published.slice(0, -4)
    expect(crc16Ccitt(body)).toBe(published.slice(-4))
  })

  it('mã động có số tiền và nội dung theo đúng cấu trúc NAPAS (vector vietqr-pro)', () => {
    const payload = buildVietQrPayload({
      bankBin: '970423',
      accountNumber: '20058999999',
      amount: 350_000,
      note: 'ORDER123',
    })
    expect(payload).toBe(
      '00020101021238550010A000000727012500069704230111200589999990208QRIBFTTA530370454063500005802VN62120808ORDER1236304C137',
    )
    const tlv = parseTlv(payload)
    expect(tlv['01']).toBe('12')
    expect(parseTlv(tlv['38']!)).toEqual({
      '00': 'A000000727',
      '01': '0006970423011120058999999',
      '02': 'QRIBFTTA',
    })
    expect(tlv['54']).toBe('350000')
    expect(parseTlv(tlv['62']!)['08']).toBe('ORDER123')
    expect(tlv['63']).toBe(crc16Ccitt(payload.slice(0, -4)))
  })

  it('không có số tiền thì là mã tĩnh, không có trường 54', () => {
    const payload = buildVietQrPayload({ bankBin: '970436', accountNumber: '0012345678' })
    expect(payload).toBe(
      '00020101021138540010A00000072701240006970436011000123456780208QRIBFTTA53037045802VN63046FD0',
    )
    expect(parseTlv(payload)['54']).toBeUndefined()
  })

  it('nội dung bỏ dấu, bỏ ký tự đặc biệt, tối đa 25 ký tự', () => {
    expect(normalizeTransferNote('Thanh toán đơn #HD-001')).toBe('THANH TOAN DON HD 001')
    expect(normalizeTransferNote('Đặng Thị Ánh Tuyết mua hàng ngày 26')).toHaveLength(25)
    expect(posTransferNote('0192c3a4-5b6c-7d8e-9f00-112233445566')).toBe('TT 0192C3A4')
  })

  it('từ chối cấu hình sai thay vì sinh mã chuyển nhầm tài khoản', () => {
    expect(() => buildVietQrPayload({ bankBin: '97042', accountNumber: '123456' })).toThrow()
    expect(() => buildVietQrPayload({ bankBin: '970423', accountNumber: '12a456' })).toThrow()
    expect(() =>
      buildVietQrPayload({ bankBin: '970423', accountNumber: '123456', amount: 10.5 }),
    ).toThrow()
  })

  it('nhận biết cửa hàng đã cấu hình tài khoản nhận tiền', () => {
    expect(isBankConfigured(null)).toBe(false)
    expect(isBankConfigured({ bankBin: '970423', bankAccountNumber: null })).toBe(false)
    expect(
      isBankConfigured({
        bankBin: '970423',
        bankAccountNumber: '20058999999',
        bankAccountName: null,
      }),
    ).toBe(true)
  })
})
