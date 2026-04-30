import { useLocation, useNavigate } from '@tanstack/react-router'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type TabValue = 'price-lists' | 'customer-prices' | 'volume-prices' | 'category-discounts'

function detectActive(pathname: string): TabValue {
  if (pathname.startsWith('/pricing/customer-prices')) return 'customer-prices'
  if (pathname.startsWith('/pricing/volume-prices')) return 'volume-prices'
  if (pathname.startsWith('/pricing/category-discounts')) return 'category-discounts'
  return 'price-lists'
}

export function PricingTabsHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const active = detectActive(location.pathname)

  const handleChange = (value: string) => {
    if (value === 'customer-prices') {
      void navigate({ to: '/pricing/customer-prices' })
    } else if (value === 'volume-prices') {
      void navigate({ to: '/pricing/volume-prices' })
    } else if (value === 'category-discounts') {
      void navigate({ to: '/pricing/category-discounts' })
    } else {
      void navigate({ to: '/pricing' })
    }
  }

  return (
    <Tabs value={active} onValueChange={handleChange} className="w-full">
      <TabsList className="grid w-full grid-cols-2 md:inline-flex md:w-auto md:grid-cols-4">
        <TabsTrigger value="price-lists">Bảng giá</TabsTrigger>
        <TabsTrigger value="customer-prices">Giá riêng KH</TabsTrigger>
        <TabsTrigger value="volume-prices">Giá theo SL</TabsTrigger>
        <TabsTrigger value="category-discounts">Chiết khấu danh mục</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
