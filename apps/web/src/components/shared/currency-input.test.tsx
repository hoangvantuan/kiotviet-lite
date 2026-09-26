// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { CurrencyInput } from './currency-input'

// POS-20: ô tiền (ví dụ "Tiền khách đưa") hiện phân cách nghìn ngay khi gõ

function Harness({ onValue }: { onValue: (v: number | null) => void }) {
  const [value, setValue] = useState<number | null>(null)
  return (
    <CurrencyInput
      aria-label="Tiền"
      value={value}
      onChange={(v) => {
        setValue(v)
        onValue(v)
      }}
    />
  )
}

afterEach(() => cleanup())

describe('CurrencyInput', () => {
  it('gõ 500000 thấy 500.000 ngay trong lúc gõ, giá trị là số', async () => {
    const values: Array<number | null> = []
    render(<Harness onValue={(v) => values.push(v)} />)
    const input = screen.getByLabelText('Tiền') as HTMLInputElement
    await userEvent.type(input, '500000')
    expect(input.value).toBe('500.000')
    expect(values.at(-1)).toBe(500_000)
  })

  it('sửa chữ số ở giữa giữ con trỏ đúng chỗ', async () => {
    render(<Harness onValue={() => {}} />)
    const input = screen.getByLabelText('Tiền') as HTMLInputElement
    await userEvent.type(input, '12345')
    expect(input.value).toBe('12.345')
    // Đặt con trỏ sau "12." rồi gõ 9: 129.345, con trỏ vẫn đứng trước "345"
    input.setSelectionRange(3, 3)
    await userEvent.type(input, '9', { initialSelectionStart: 3, initialSelectionEnd: 3 })
    expect(input.value).toBe('129.345')
    expect(input.selectionStart).toBe(4)
  })

  it('xóa hết thì giá trị rỗng', async () => {
    const values: Array<number | null> = []
    render(<Harness onValue={(v) => values.push(v)} />)
    const input = screen.getByLabelText('Tiền') as HTMLInputElement
    await userEvent.type(input, '1000')
    await userEvent.clear(input)
    expect(input.value).toBe('')
    expect(values.at(-1)).toBeNull()
  })
})
