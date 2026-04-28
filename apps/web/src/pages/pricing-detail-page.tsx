import { useParams } from '@tanstack/react-router'

import { PriceListDetail } from '@/features/pricing/components/PriceListDetail'

export function PricingDetailPage() {
  const { id } = useParams({ from: '/_authenticated/_app-layout/pricing/$id' })
  return (
    <div className="container mx-auto p-4 md:p-6">
      <PriceListDetail priceListId={id} />
    </div>
  )
}
