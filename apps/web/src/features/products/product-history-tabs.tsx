import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { InventoryHistoryTable } from './inventory-history-table'
import { ProductPurchaseHistory } from './product-purchase-history'
import { ProductStockCheckHistory } from './product-stock-check-history'

interface ProductHistoryTabsProps {
  productId: string
}

export function ProductHistoryTabs({ productId }: ProductHistoryTabsProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Lịch sử kho</h3>
      <Tabs defaultValue="movements" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="movements">Biến động kho</TabsTrigger>
          <TabsTrigger value="purchases">Lịch sử nhập</TabsTrigger>
          <TabsTrigger value="stock-checks">Lịch sử kiểm</TabsTrigger>
        </TabsList>
        <TabsContent value="movements" className="mt-3">
          <InventoryHistoryTable productId={productId} />
        </TabsContent>
        <TabsContent value="purchases" className="mt-3">
          <ProductPurchaseHistory productId={productId} />
        </TabsContent>
        <TabsContent value="stock-checks" className="mt-3">
          <ProductStockCheckHistory productId={productId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
