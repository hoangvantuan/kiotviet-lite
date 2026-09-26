// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { REFUND_METHODS } from '@kiotviet-lite/shared'

import { MoneyMethodPicker } from '@/components/shared/money-method-picker'
import { ApiClientError } from '@/lib/api-client'

import { DocumentShiftSelect } from './document-shift-select'
import { useDocumentShiftChoice } from './use-document-shift-choice'

const shifts = [
  {
    id: '00000000-0000-4000-8000-0000000000a1',
    userId: '00000000-0000-4000-8000-0000000000b1',
    userName: 'Thu ngân A',
    openedAt: '2026-09-26T01:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a2',
    userId: '00000000-0000-4000-8000-0000000000b2',
    userName: 'Thu ngân B',
    openedAt: '2026-09-26T02:00:00.000Z',
  },
]

const choiceError = new ApiClientError(422, {
  code: 'BUSINESS_RULE_VIOLATION',
  message: 'Có nhiều ca đang mở',
  details: { reason: 'shift_choice_required', shifts },
})

afterEach(cleanup)

describe('useDocumentShiftChoice (POS-06)', () => {
  it('lỗi yêu cầu chọn ca: giữ danh sách ca, chặn gửi tới khi chọn', () => {
    const { result } = renderHook(() => useDocumentShiftChoice())
    let handled = false
    act(() => {
      handled = result.current.capture(choiceError)
    })
    expect(handled).toBe(true)
    expect(result.current.choices).toEqual(shifts)
    expect(result.current.pending).toBe(true)

    act(() => result.current.setShiftId(shifts[1]!.id))
    expect(result.current.shiftId).toBe(shifts[1]!.id)
    expect(result.current.pending).toBe(false)
  })

  it('ca đã chọn bị đóng: bỏ lựa chọn và để lỗi hiện như thường', () => {
    const { result } = renderHook(() => useDocumentShiftChoice())
    act(() => {
      result.current.capture(choiceError)
      result.current.setShiftId(shifts[0]!.id)
    })
    let handled = true
    act(() => {
      handled = result.current.capture(
        new ApiClientError(422, {
          code: 'BUSINESS_RULE_VIOLATION',
          message: 'Ca đã đóng',
          details: { reason: 'shift_not_open' },
        }),
      )
    })
    expect(handled).toBe(false)
    expect(result.current.choices).toBeNull()
    expect(result.current.shiftId).toBeNull()
  })

  it('lỗi khác không bị nuốt', () => {
    const { result } = renderHook(() => useDocumentShiftChoice())
    expect(result.current.capture(new Error('mạng'))).toBe(false)
    expect(result.current.choices).toBeNull()
  })
})

describe('DocumentShiftSelect', () => {
  it('hiện ô chọn ca kèm hướng dẫn', () => {
    render(<DocumentShiftSelect choices={shifts} value={null} onChange={() => {}} idPrefix="t" />)
    expect(screen.getByText(/Có nhiều ca đang mở/)).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Ca bán hàng' })).toBeTruthy()
  })
})

describe('MoneyMethodPicker cho hoàn tiền (TIEN-02)', () => {
  it('chỉ có tiền mặt và chuyển khoản, không có QR', () => {
    render(
      <MoneyMethodPicker
        value="cash"
        onChange={() => {}}
        ariaLabel="Phương thức hoàn tiền"
        methods={REFUND_METHODS}
      />,
    )
    const radios = screen.getAllByRole('radio').map((r) => r.textContent)
    expect(radios).toEqual(['Tiền mặt', 'Chuyển khoản'])
  })
})
