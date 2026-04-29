import { PricingTabsHeader } from '@/features/pricing/components/PricingTabsHeader'
import { VolumePricesManager } from '@/features/pricing/components/VolumePricesManager'

export function VolumePricesPage() {
  return (
    <div className="container mx-auto space-y-4 p-4 md:p-6">
      <PricingTabsHeader />
      <VolumePricesManager />
    </div>
  )
}
