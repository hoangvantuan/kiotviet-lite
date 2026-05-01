import { useParams } from '@tanstack/react-router'

import { OrderDetailView } from '@/features/orders/order-detail-view'

export function OrderDetailPage() {
  const { orderId } = useParams({
    from: '/_authenticated/_app-layout/orders/$orderId',
  })
  return <OrderDetailView orderId={orderId} />
}
