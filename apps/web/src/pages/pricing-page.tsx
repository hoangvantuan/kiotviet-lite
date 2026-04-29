import { PriceListsManager } from '@/features/pricing/components/PriceListsManager'
import { PricingTabsHeader } from '@/features/pricing/components/PricingTabsHeader'

export function PricingPage() {
  return (
    <div className="container mx-auto space-y-4 p-4 md:p-6">
      <PricingTabsHeader />
      <PriceListsManager />
    </div>
  )
}
