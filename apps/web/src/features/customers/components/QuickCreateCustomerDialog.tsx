import type { CustomerDetail } from '@kiotviet-lite/shared'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { QuickCustomerForm } from './QuickCustomerForm'

interface QuickCreateCustomerDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCustomerCreated?: (customer: CustomerDetail) => void
}

export function QuickCreateCustomerDialog({
  open,
  onOpenChange,
  onCustomerCreated,
}: QuickCreateCustomerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tạo nhanh khách hàng</DialogTitle>
          <DialogDescription>Chỉ cần tên và số điện thoại.</DialogDescription>
        </DialogHeader>
        <QuickCustomerForm
          autoFocus
          onCancel={() => onOpenChange(false)}
          onCreated={(customer) => {
            onOpenChange(false)
            onCustomerCreated?.(customer)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
