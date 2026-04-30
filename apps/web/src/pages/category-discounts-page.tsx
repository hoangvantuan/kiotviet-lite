import { CategoryDiscountsManager } from '@/features/pricing/components/CategoryDiscountsManager'
import { PricingTabsHeader } from '@/features/pricing/components/PricingTabsHeader'

export function CategoryDiscountsPage() {
  return (
    <div className="container mx-auto space-y-4 p-4 md:p-6">
      <PricingTabsHeader />
      <CategoryDiscountsManager />
    </div>
  )
}
