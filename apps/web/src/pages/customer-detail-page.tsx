import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CustomerDebtsTab } from '@/features/customers/components/CustomerDebtsTab'
import { CustomerDetailHeader } from '@/features/customers/components/CustomerDetailHeader'
import { CustomerFormDialog } from '@/features/customers/components/CustomerForm'
import { CustomerOrdersTab } from '@/features/customers/components/CustomerOrdersTab'
import { CustomerStatsTab } from '@/features/customers/components/CustomerStatsTab'
import { useCustomerDetail } from '@/features/customers/hooks/use-customer-detail'
import { useCustomerGroupsQuery } from '@/features/customers/use-customers'

export function CustomerDetailPage() {
  const { customerId } = useParams({
    from: '/_authenticated/_app-layout/customers/$customerId',
  })
  const detailQuery = useCustomerDetail(customerId)
  const groupsQuery = useCustomerGroupsQuery()
  const groups = groupsQuery.data ?? []
  const [editOpen, setEditOpen] = useState(false)

  if (detailQuery.isLoading) {
    return (
      <div className="container mx-auto space-y-3 p-4 md:p-6">
        <div className="h-8 w-1/3 rounded-md bg-muted animate-pulse" />
        <div className="h-32 rounded-md bg-muted animate-pulse" />
        <div className="h-64 rounded-md bg-muted animate-pulse" />
      </div>
    )
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <p className="text-sm text-destructive">Không tải được khách hàng. Thử lại sau.</p>
        <Button asChild variant="outline" className="mt-3">
          <Link to="/customers">
            <ChevronLeft className="size-4 mr-1" />
            Về danh sách
          </Link>
        </Button>
      </div>
    )
  }

  const customer = detailQuery.data

  return (
    <div className="container mx-auto space-y-4 p-4 md:p-6">
      <CustomerDetailHeader customer={customer} onEdit={() => setEditOpen(true)} />

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Đơn hàng</TabsTrigger>
          <TabsTrigger value="debts">Công nợ</TabsTrigger>
          <TabsTrigger value="stats">Thống kê</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="mt-4">
          <CustomerOrdersTab customerId={customer.id} />
        </TabsContent>
        <TabsContent value="debts" className="mt-4">
          <CustomerDebtsTab customerId={customer.id} />
        </TabsContent>
        <TabsContent value="stats" className="mt-4">
          <CustomerStatsTab customerId={customer.id} />
        </TabsContent>
      </Tabs>

      <CustomerFormDialog
        key={customer.id}
        mode="edit"
        open={editOpen}
        onOpenChange={setEditOpen}
        customer={customer}
        groups={groups}
      />
    </div>
  )
}
