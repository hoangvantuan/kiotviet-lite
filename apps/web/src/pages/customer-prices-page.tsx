import { CustomerPricesManager } from '@/features/pricing/components/CustomerPricesManager'
import { PricingTabsHeader } from '@/features/pricing/components/PricingTabsHeader'

export function CustomerPricesPage() {
  return (
    <div className="container mx-auto space-y-4 p-4 md:p-6">
      <PricingTabsHeader />
      <CustomerPricesManager />
    </div>
  )
}
