import { useParams } from '@tanstack/react-router'

import { StockCheckDetailView } from '@/features/stock-checks/stock-check-detail-view'

export function StockCheckDetailPage() {
  const { id } = useParams({ from: '/_authenticated/_app-layout/inventory/stock-checks/$id' })
  return <StockCheckDetailView stockCheckId={id} />
}
