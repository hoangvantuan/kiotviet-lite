// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { agingQueries } = vi.hoisted(() => ({ agingQueries: [] as unknown[] }))

vi.mock('@/features/reports/components/DebtAgingReport', () => ({
  DebtAgingReport: ({ query }: { query: unknown }) => {
    agingQueries.push(query)
    return <div>aging</div>
  },
}))
vi.mock('@/features/reports/components/DebtSummaryReport', () => ({
  DebtSummaryReport: () => <div>summary</div>,
}))

import { ReportsPage } from './reports-page'

describe('ReportsPage (BC-04)', () => {
  afterEach(() => {
    cleanup()
    agingQueries.length = 0
  })

  it('tab Tuổi nợ mặc định lấy mọi khoản nợ còn lại, không cắt theo ngày phát sinh', () => {
    render(<ReportsPage />)
    expect(screen.getByText('aging')).toBeTruthy()
    const query = agingQueries.at(-1) as { from?: string }
    expect(query.from).toBeUndefined()
    // Bộ lọc khoảng thời gian chỉ dành cho tab Tổng hợp
    expect(screen.queryByText('Khoảng thời gian:')).toBeNull()
  })
})
