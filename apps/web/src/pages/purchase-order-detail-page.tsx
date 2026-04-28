import { useParams } from '@tanstack/react-router'

import { PurchaseOrderDetailView } from '@/features/purchase-orders/purchase-order-detail-view'

export function PurchaseOrderDetailPage() {
  const { orderId } = useParams({
    from: '/_authenticated/_app-layout/inventory/purchase-orders/$orderId',
  })
  return <PurchaseOrderDetailView orderId={orderId} />
}
