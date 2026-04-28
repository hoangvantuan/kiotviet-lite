import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  type CreateCustomerInput,
  createCustomerSchema,
  type CustomerDetail,
  type CustomerGroupItem,
  type UpdateCustomerInput,
  updateCustomerSchema,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError } from '@/lib/api-client'
import { showError, showSuccess } from '@/lib/toast'

import { useCreateCustomerMutation, useUpdateCustomerMutation } from '../use-customers'

const NO_GROUP_VALUE = '__NO_GROUP__'

const KNOWN_FIELDS = ['name', 'phone', 'email', 'address', 'taxId', 'notes', 'debtLimit', 'groupId']

interface CustomerFormDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  mode: 'create' | 'edit'
  customer?: CustomerDetail
  groups: CustomerGroupItem[]
}

export function CustomerFormDialog(props: CustomerFormDialogProps) {
  if (props.mode === 'create') {
    return <CreateCustomerDialog {...props} />
  }
  if (!props.customer) return null
  return <EditCustomerDialog {...props} customer={props.customer} />
}

function CreateCustomerDialog({ open, onOpenChange, groups }: CustomerFormDialogProps) {
  const mutation = useCreateCustomerMutation()
  const form = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    mode: 'onTouched',
    defaultValues: {
      name: '',
      phone: '',
      email: null,
      address: null,
      taxId: null,
      notes: null,
      debtLimit: null,
      groupId: null,
    },
  })
  const [debtLimitText, setDebtLimitText] = useState('')

  useEffect(() => {
    if (open) {
      form.reset({
        name: '',
        phone: '',
        email: null,
        address: null,
        taxId: null,
        notes: null,
        debtLimit: null,
        groupId: null,
      })
      setDebtLimitText('')
    }
  }, [open, form])

  const submit = form.handleSubmit(async (values) => {
    const payload: CreateCustomerInput = {
      name: values.name,
      phone: values.phone,
      email: values.email?.trim() ? values.email.trim() : null,
      address: values.address?.trim() ? values.address.trim() : null,
      taxId: values.taxId?.trim() ? values.taxId.trim() : null,
      notes: values.notes?.trim() ? values.notes.trim() : null,
      debtLimit: values.debtLimit ?? null,
      groupId: values.groupId ?? null,
    }
    try {
      await mutation.mutateAsync(payload)
      showSuccess('Đã tạo khách hàng')
      onOpenChange(false)
    } catch (err) {
      handleApiError(err, asFormSetError(form), KNOWN_FIELDS)
    }
  })

  const groupValue = form.watch('groupId') ?? null
  const groupSelectValue = groupValue === null ? NO_GROUP_VALUE : groupValue

  const handleDebtLimitChange = (text: string) => {
    setDebtLimitText(text)
    if (text.trim() === '') {
      form.setValue('debtLimit', null, { shouldValidate: true })
      return
    }
    const num = Number(text.replace(/[^0-9]/g, ''))
    form.setValue('debtLimit', Number.isFinite(num) ? num : null, { shouldValidate: true })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Thêm khách hàng</DialogTitle>
          <DialogDescription>Nhập thông tin khách hàng mới.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <CustomerFields form={form} groups={groups} groupSelectValue={groupSelectValue} />
          <DebtLimitField
            id="cust-debt-limit"
            value={debtLimitText}
            onChange={handleDebtLimitChange}
            error={form.formState.errors.debtLimit?.message}
            groups={groups}
            groupId={form.watch('groupId') ?? null}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditCustomerDialog({
  open,
  onOpenChange,
  customer,
  groups,
}: CustomerFormDialogProps & { customer: CustomerDetail }) {
  const mutation = useUpdateCustomerMutation()
  const form = useForm<UpdateCustomerInput>({
    resolver: zodResolver(updateCustomerSchema),
    mode: 'onTouched',
  })
  const [debtLimitText, setDebtLimitText] = useState('')

  useEffect(() => {
    if (open && customer) {
      form.reset({
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        taxId: customer.taxId,
        notes: customer.notes,
        debtLimit: customer.debtLimit,
        groupId: customer.groupId,
      })
      setDebtLimitText(customer.debtLimit === null ? '' : String(customer.debtLimit))
    }
  }, [open, customer, form])

  const submit = form.handleSubmit(async (values) => {
    const payload: UpdateCustomerInput = {}
    if (values.name !== undefined && values.name !== customer.name) payload.name = values.name
    if (values.phone !== undefined && values.phone !== customer.phone) payload.phone = values.phone
    const normalizeOptional = (v: string | null | undefined) =>
      v === undefined ? undefined : v && v.trim() !== '' ? v.trim() : null
    const email = normalizeOptional(values.email)
    if (email !== undefined && email !== customer.email) payload.email = email
    const address = normalizeOptional(values.address)
    if (address !== undefined && address !== customer.address) payload.address = address
    const taxId = normalizeOptional(values.taxId)
    if (taxId !== undefined && taxId !== customer.taxId) payload.taxId = taxId
    const notes = normalizeOptional(values.notes)
    if (notes !== undefined && notes !== customer.notes) payload.notes = notes
    if (values.debtLimit !== undefined && values.debtLimit !== customer.debtLimit) {
      payload.debtLimit = values.debtLimit
    }
    if (values.groupId !== undefined && values.groupId !== customer.groupId) {
      payload.groupId = values.groupId
    }
    if (Object.keys(payload).length === 0) {
      onOpenChange(false)
      return
    }
    try {
      await mutation.mutateAsync({ id: customer.id, input: payload })
      showSuccess('Đã cập nhật khách hàng')
      onOpenChange(false)
    } catch (err) {
      handleApiError(err, asFormSetError(form), KNOWN_FIELDS)
    }
  })

  const groupValue = form.watch('groupId') ?? null
  const groupSelectValue = groupValue === null ? NO_GROUP_VALUE : groupValue

  const handleDebtLimitChange = (text: string) => {
    setDebtLimitText(text)
    if (text.trim() === '') {
      form.setValue('debtLimit', null, { shouldValidate: true })
      return
    }
    const num = Number(text.replace(/[^0-9]/g, ''))
    form.setValue('debtLimit', Number.isFinite(num) ? num : null, { shouldValidate: true })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sửa khách hàng</DialogTitle>
          <DialogDescription>Cập nhật thông tin khách hàng.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <CustomerFields form={form} groups={groups} groupSelectValue={groupSelectValue} />
          <DebtLimitField
            id="edit-cust-debt-limit"
            value={debtLimitText}
            onChange={handleDebtLimitChange}
            error={form.formState.errors.debtLimit?.message}
            groups={groups}
            groupId={form.watch('groupId') ?? null}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface CustomerFieldsProps {
  form:
    | ReturnType<typeof useForm<CreateCustomerInput>>
    | ReturnType<typeof useForm<UpdateCustomerInput>>
  groups: CustomerGroupItem[]
  groupSelectValue: string
}

function CustomerFields({ form, groups, groupSelectValue }: CustomerFieldsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="cust-name">Tên khách hàng</Label>
        <Input id="cust-name" autoFocus maxLength={100} {...form.register('name')} />
        {form.formState.errors.name && (
          <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="cust-phone">Số điện thoại</Label>
        <Input id="cust-phone" maxLength={15} {...form.register('phone')} />
        {form.formState.errors.phone && (
          <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="cust-email">Email</Label>
        <Input
          id="cust-email"
          type="email"
          maxLength={255}
          {...form.register('email', {
            setValueAs: (v) => (v === '' ? null : v),
          })}
        />
        {form.formState.errors.email && (
          <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
        )}
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="cust-address">Địa chỉ</Label>
        <Textarea
          id="cust-address"
          maxLength={500}
          rows={2}
          {...form.register('address', {
            setValueAs: (v) => (v === '' ? null : v),
          })}
        />
        {form.formState.errors.address && (
          <p className="text-sm text-destructive">{form.formState.errors.address.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="cust-tax-id">Mã số thuế</Label>
        <Input
          id="cust-tax-id"
          maxLength={32}
          placeholder="VD: 0123456789"
          {...form.register('taxId', {
            setValueAs: (v) => (v === '' ? null : v),
          })}
        />
        {form.formState.errors.taxId && (
          <p className="text-sm text-destructive">{form.formState.errors.taxId.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="cust-group">Nhóm khách hàng</Label>
        <Select
          value={groupSelectValue}
          onValueChange={(v) =>
            form.setValue('groupId', v === NO_GROUP_VALUE ? null : v, { shouldValidate: true })
          }
        >
          <SelectTrigger id="cust-group">
            <SelectValue placeholder="Chọn nhóm" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_GROUP_VALUE}>— Không thuộc nhóm —</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.groupId && (
          <p className="text-sm text-destructive">{form.formState.errors.groupId.message}</p>
        )}
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="cust-notes">Ghi chú</Label>
        <Input
          id="cust-notes"
          maxLength={1000}
          {...form.register('notes', {
            setValueAs: (v) => (v === '' ? null : v),
          })}
        />
        {form.formState.errors.notes && (
          <p className="text-sm text-destructive">{form.formState.errors.notes.message}</p>
        )}
      </div>
    </div>
  )
}

interface DebtLimitFieldProps {
  id: string
  value: string
  onChange: (v: string) => void
  error?: string
  groups: CustomerGroupItem[]
  groupId: string | null
}

function DebtLimitField({ id, value, onChange, error, groups, groupId }: DebtLimitFieldProps) {
  const selectedGroup = groupId ? groups.find((g) => g.id === groupId) : null
  const groupDebtLimit = selectedGroup?.debtLimit ?? null

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Hạn mức nợ riêng (VND)</Label>
      <Input
        id={id}
        inputMode="numeric"
        placeholder="Để trống = dùng hạn mức của nhóm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {selectedGroup && (
        <p className="text-xs text-muted-foreground">
          Nhóm "{selectedGroup.name}": hạn mức{' '}
          {groupDebtLimit !== null
            ? `${groupDebtLimit.toLocaleString('vi-VN')} ₫`
            : 'không giới hạn'}
        </p>
      )}
    </div>
  )
}

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
    if (err.code === 'CONFLICT') {
      const detail = err.details as { field?: string } | undefined
      if (detail?.field === 'phone' && knownFields.includes('phone')) {
        form.setError('phone', { message: err.message })
        showError(err.message)
        return
      }
    }
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
      for (const issue of err.details as Array<{ path: string; message: string }>) {
        if (knownFields.includes(issue.path)) {
          form.setError(issue.path, { message: issue.message })
        }
      }
    }
    showError(err.message)
    return
  }
  showError('Đã xảy ra lỗi không xác định')
}
