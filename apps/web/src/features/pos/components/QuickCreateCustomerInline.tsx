import { QuickCreateCustomerDialog } from '@/features/customers/components/QuickCreateCustomerDialog'

interface QuickCreateCustomerInlineProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (customer: {
    id: string
    name: string
    groupId: string | null
    groupName: string | null
  }) => void
}

export function QuickCreateCustomerInline({
  open,
  onOpenChange,
  onCreated,
}: QuickCreateCustomerInlineProps) {
  return (
    <QuickCreateCustomerDialog
      open={open}
      onOpenChange={onOpenChange}
      onCustomerCreated={(customer) => {
        onCreated({
          id: customer.id,
          name: customer.name,
          groupId: customer.groupId,
          groupName: customer.group?.name ?? null,
        })
      }}
    />
  )
}
