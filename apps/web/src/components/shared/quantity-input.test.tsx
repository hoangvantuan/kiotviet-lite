// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { QuantityInput } from './quantity-input'

afterEach(() => cleanup())

function setup(props: { allowDecimal?: boolean; live?: boolean; value?: number }) {
  const onCommit = vi.fn()
  render(
    <QuantityInput
      aria-label="Số lượng"
      value={props.value ?? 1}
      allowDecimal={props.allowDecimal}
      live={props.live}
      onCommit={onCommit}
    />,
  )
  return { input: screen.getByLabelText('Số lượng') as HTMLInputElement, onCommit }
}

describe('QuantityInput (GL-07, POS-09)', () => {
  it('hàng bán số lẻ nhận "1,255" kiểu Việt Nam, ghi khi rời ô', () => {
    const { input, onCommit } = setup({ allowDecimal: true })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '1,255' } })
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith(1.255)
    // Ô theo giá trị của cha: cha chưa nhận số mới (mock) thì hiển thị lại số cũ
    expect(input.value).toBe('1')
  })

  it('hàng không bật cờ gõ số lẻ thì trả về số cũ, không ghi', () => {
    const { input, onCommit } = setup({ allowDecimal: false, value: 2 })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '1,5' } })
    fireEvent.blur(input)
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('2')
  })

  it('chế độ live ghi ngay mỗi lần gõ ra số hợp lệ', () => {
    const { input, onCommit } = setup({ allowDecimal: true, live: true })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '0,5' } })
    expect(onCommit).toHaveBeenLastCalledWith(0.5)
    fireEvent.change(input, { target: { value: '0,5a' } })
    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})
