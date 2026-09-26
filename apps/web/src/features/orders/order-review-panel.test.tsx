// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OrderReviewPanel } from './order-review-panel'

vi.mock('./use-orders', () => ({
  useReviewOrderMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/stores/use-auth-store', () => ({
  useAuthStore: (select: (s: { user: { role: string } }) => unknown) =>
    select({ user: { role: 'owner' } }),
}))

afterEach(() => cleanup())

// POS-13: đơn ngoại tuyến bán vượt tồn khi cửa hàng không cho bán âm hiện rõ trên khung chờ duyệt
describe('OrderReviewPanel', () => {
  it('hiện vi phạm negative_stock_policy và cho chủ duyệt', () => {
    render(
      <OrderReviewPanel
        orderId="o1"
        reviewStatus="pending_review"
        violations={[
          {
            code: 'negative_stock_policy',
            message:
              'Bán vượt tồn kho khi cửa hàng không cho bán âm: Nước suối còn 1 chai, bán 3 chai',
            requiredPermissions: [],
          },
        ]}
      />,
    )
    expect(screen.getByText('Đơn ngoại tuyến vi phạm chính sách, đang chờ chủ duyệt')).toBeTruthy()
    expect(
      screen.getByText(
        'Bán vượt tồn kho khi cửa hàng không cho bán âm: Nước suối còn 1 chai, bán 3 chai',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /Duyệt/ })).toBeTruthy()
  })
})
