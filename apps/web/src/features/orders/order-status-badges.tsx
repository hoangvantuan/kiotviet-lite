import { Badge } from '@/components/ui/badge'

const STATUS_LABELS: Record<string, string> = {
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  partial_return: 'Đã trả 1 phần',
  full_return: 'Đã trả toàn bộ',
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: 'Đã thanh toán',
  partial: 'Thanh toán một phần',
  unpaid: 'Chưa thanh toán',
}

export function OrderStatusBadge({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200" variant="outline">
        {STATUS_LABELS[status] ?? status}
      </Badge>
    )
  }
  if (status === 'cancelled') {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200" variant="outline">
        {STATUS_LABELS[status] ?? status}
      </Badge>
    )
  }
  if (status === 'partial_return') {
    return (
      <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200" variant="outline">
        {STATUS_LABELS[status] ?? status}
      </Badge>
    )
  }
  if (status === 'full_return') {
    return (
      <Badge className="bg-gray-100 text-gray-600 border-gray-200" variant="outline">
        {STATUS_LABELS[status] ?? status}
      </Badge>
    )
  }
  return <Badge variant="outline">{STATUS_LABELS[status] ?? status}</Badge>
}

export function PaymentStatusBadge({ status }: { status: string }) {
  if (status === 'paid') {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200" variant="outline">
        {PAYMENT_STATUS_LABELS[status] ?? status}
      </Badge>
    )
  }
  if (status === 'partial') {
    return (
      <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200" variant="outline">
        {PAYMENT_STATUS_LABELS[status] ?? status}
      </Badge>
    )
  }
  return (
    <Badge className="bg-red-100 text-red-700 border-red-200" variant="outline">
      {PAYMENT_STATUS_LABELS[status] ?? status}
    </Badge>
  )
}
