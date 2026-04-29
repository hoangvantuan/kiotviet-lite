import { useEffect } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'

import { StockCheckForm } from '@/features/stock-checks/stock-check-form'
import { useStockCheckQuery } from '@/features/stock-checks/use-stock-checks'
import { showError } from '@/lib/toast'

export function StockCheckEditPage() {
  const { id } = useParams({ from: '/_authenticated/_app-layout/inventory/stock-checks/$id/edit' })
  const navigate = useNavigate()
  const query = useStockCheckQuery(id)

  useEffect(() => {
    if (query.data && query.data.status === 'confirmed') {
      showError('Phiếu đã xác nhận, không thể chỉnh sửa.')
      navigate({ to: '/inventory/stock-checks/$id', params: { id } })
    }
  }, [query.data, navigate, id])

  if (query.isLoading) {
    return (
      <div className="space-y-3 p-4 md:p-6">
        <div className="h-8 w-1/3 rounded-md bg-muted animate-pulse" />
        <div className="h-64 rounded-md bg-muted animate-pulse" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-sm text-destructive">Không tải được phiếu kiểm kho.</p>
      </div>
    )
  }

  if (query.data.status !== 'draft') {
    return null
  }

  return <StockCheckForm key={id} mode="edit" initial={query.data} />
}
