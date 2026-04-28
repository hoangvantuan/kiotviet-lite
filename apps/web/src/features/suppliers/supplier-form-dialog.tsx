import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  type CreateSupplierInput,
  createSupplierSchema,
  type SupplierDetail,
  type UpdateSupplierInput,
  updateSupplierSchema,
} from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError } from '@/lib/api-client'
import { formatVnd } from '@/lib/currency'
import { showError, showSuccess } from '@/lib/toast'

import { useCreateSupplierMutation, useUpdateSupplierMutation } from './use-suppliers'

const KNOWN_FIELDS = ['name', 'phone', 'email', 'address', 'taxId', 'notes']

interface FormSetError {
  setError: (name: string, error: { message: string }) => void
}

function asFormSetError(form: { setError: (...args: never[]) => void }): FormSetError {
  return {
    setError: (name, error) => {
      ;(form.setError as unknown as (n: string, e: { message: string }) => void)(name, error)
    },
  }
}

function handleApiError(err: unknown, form: FormSetError, knownFields: string[]) {
  if (err instanceof ApiClientError) {
    if (err.code === 'CONFLICT' && err.details && typeof err.details === 'object') {
      const field = (err.details as { field?: string }).field
      if (field && knownFields.includes(field)) {
        form.setError(field, { message: err.message })
        return
      }
    }
    showError(err.message)
    return
  }
  showError('Đã có lỗi xảy ra, vui lòng thử lại')
}

interface SupplierFormDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  mode: 'create' | 'edit'
  supplier?: SupplierDetail
  onSupplierCreated?: (s: SupplierDetail) => void
}

export function SupplierFormDialog(props: SupplierFormDialogProps) {
  if (props.mode === 'create') {
    return <CreateSupplierDialog {...props} />
  }
  if (!props.supplier) return null
  return <EditSupplierDialog {...props} supplier={props.supplier} />
}

function emptyCreateValues(): CreateSupplierInput {
  return {
    name: '',
    phone: null,
    email: null,
    address: null,
    taxId: null,
    notes: null,
  }
}

function CreateSupplierDialog({ open, onOpenChange, onSupplierCreated }: SupplierFormDialogProps) {
  const mutation = useCreateSupplierMutation()
  const form = useForm<CreateSupplierInput>({
    resolver: zodResolver(createSupplierSchema),
    mode: 'onTouched',
    defaultValues: emptyCreateValues(),
  })

  useEffect(() => {
    if (open) {
      form.reset(emptyCreateValues())
    }
  }, [open, form])

  const submit = form.handleSubmit(async (values) => {
    const payload: CreateSupplierInput = {
      name: values.name,
      phone: values.phone?.toString().trim() ? values.phone.toString().trim() : null,
      email: values.email?.toString().trim() ? values.email.toString().trim() : null,
      address: values.address?.toString().trim() ? values.address.toString().trim() : null,
      taxId: values.taxId?.toString().trim() ? values.taxId.toString().trim() : null,
      notes: values.notes?.toString().trim() ? values.notes.toString().trim() : null,
    }
    try {
      const result = await mutation.mutateAsync(payload)
      showSuccess('Đã tạo nhà cung cấp')
      onOpenChange(false)
      onSupplierCreated?.(result.data)
    } catch (err) {
      handleApiError(err, asFormSetError(form), KNOWN_FIELDS)
    }
  })

  const isPending = mutation.isPending
  const disabled = !form.formState.isValid || isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm nhà cung cấp</DialogTitle>
          <DialogDescription>
            Tạo NCC mới để phục vụ phiếu nhập kho và theo dõi công nợ phải trả.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <FormFields form={form as unknown as FormShape} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={disabled}>
              {isPending ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditSupplierDialog({
  open,
  onOpenChange,
  supplier,
}: SupplierFormDialogProps & { supplier: SupplierDetail }) {
  const mutation = useUpdateSupplierMutation()
  const form = useForm<UpdateSupplierInput>({
    resolver: zodResolver(updateSupplierSchema),
    mode: 'onTouched',
    defaultValues: {
      name: supplier.name,
      phone: supplier.phone ?? null,
      email: supplier.email ?? null,
      address: supplier.address ?? null,
      taxId: supplier.taxId ?? null,
      notes: supplier.notes ?? null,
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        name: supplier.name,
        phone: supplier.phone ?? null,
        email: supplier.email ?? null,
        address: supplier.address ?? null,
        taxId: supplier.taxId ?? null,
        notes: supplier.notes ?? null,
      })
    }
  }, [open, supplier, form])

  const submit = form.handleSubmit(async (values) => {
    const payload: UpdateSupplierInput = {}
    if (values.name !== undefined && values.name !== supplier.name) payload.name = values.name
    const phoneVal = values.phone === null ? null : values.phone?.toString().trim() || null
    if (phoneVal !== supplier.phone) payload.phone = phoneVal
    const emailVal = values.email === null ? null : values.email?.toString().trim() || null
    if (emailVal !== supplier.email) payload.email = emailVal
    const addressVal = values.address === null ? null : values.address?.toString().trim() || null
    if (addressVal !== supplier.address) payload.address = addressVal
    const taxIdVal = values.taxId === null ? null : values.taxId?.toString().trim() || null
    if (taxIdVal !== supplier.taxId) payload.taxId = taxIdVal
    const notesVal = values.notes === null ? null : values.notes?.toString().trim() || null
    if (notesVal !== supplier.notes) payload.notes = notesVal

    if (Object.keys(payload).length === 0) {
      onOpenChange(false)
      return
    }

    try {
      await mutation.mutateAsync({ id: supplier.id, input: payload })
      showSuccess('Đã cập nhật nhà cung cấp')
      onOpenChange(false)
    } catch (err) {
      handleApiError(err, asFormSetError(form), KNOWN_FIELDS)
    }
  })

  const isPending = mutation.isPending
  const disabled = !form.formState.isValid || isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sửa nhà cung cấp</DialogTitle>
          <DialogDescription>Cập nhật thông tin liên hệ và ghi chú.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <FormFields form={form as unknown as FormShape} />
          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Công nợ NCC</span>
              <span className="font-medium">{formatVnd(supplier.currentDebt)} đ</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Số phiếu nhập</span>
              <span className="font-medium">{supplier.purchaseCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tổng đã nhập</span>
              <span className="font-medium">{formatVnd(supplier.totalPurchased)} đ</span>
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              Các trường trên tự cập nhật từ phiếu nhập, không sửa được trực tiếp.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={disabled}>
              {isPending ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface FormShape {
  register: (name: string) => Record<string, unknown>
  formState: { errors: Record<string, { message?: string } | undefined> }
}

function FormFields({ form }: { form: FormShape }) {
  const errors = form.formState.errors
  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="supplier-name">
          Tên NCC <span className="text-destructive">*</span>
        </Label>
        <Input id="supplier-name" autoFocus {...form.register('name')} />
        {errors.name?.message && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="supplier-phone">Số điện thoại</Label>
          <Input id="supplier-phone" inputMode="tel" {...form.register('phone')} />
          {errors.phone?.message && (
            <p className="text-xs text-destructive">{errors.phone.message}</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="supplier-email">Email</Label>
          <Input id="supplier-email" inputMode="email" {...form.register('email')} />
          {errors.email?.message && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="supplier-address">Địa chỉ</Label>
        <Textarea id="supplier-address" rows={2} {...form.register('address')} />
        {errors.address?.message && (
          <p className="text-xs text-destructive">{errors.address.message}</p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="supplier-tax-id">Mã số thuế</Label>
        <Input id="supplier-tax-id" {...form.register('taxId')} />
        {errors.taxId?.message && (
          <p className="text-xs text-destructive">{errors.taxId.message}</p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="supplier-notes">Ghi chú</Label>
        <Textarea id="supplier-notes" rows={2} {...form.register('notes')} />
        {errors.notes?.message && (
          <p className="text-xs text-destructive">{errors.notes.message}</p>
        )}
      </div>
    </div>
  )
}
