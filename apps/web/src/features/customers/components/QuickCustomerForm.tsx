import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  type CustomerDetail,
  type QuickCreateCustomerInput,
  quickCreateCustomerSchema,
} from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiClientError } from '@/lib/api-client'
import { showError, showSuccess } from '@/lib/toast'

import { useQuickCreateCustomerMutation } from '../use-customers'

interface QuickCustomerFormProps {
  onCreated?: (customer: CustomerDetail) => void
  onCancel?: () => void
  autoFocus?: boolean
}

export function QuickCustomerForm({
  onCreated,
  onCancel,
  autoFocus = true,
}: QuickCustomerFormProps) {
  const mutation = useQuickCreateCustomerMutation()
  const form = useForm<QuickCreateCustomerInput>({
    resolver: zodResolver(quickCreateCustomerSchema),
    mode: 'onTouched',
    defaultValues: { name: '', phone: '' },
  })

  useEffect(() => {
    form.reset({ name: '', phone: '' })
  }, [form])

  const submit = form.handleSubmit(async (values) => {
    try {
      const result = await mutation.mutateAsync(values)
      showSuccess('Đã tạo khách hàng')
      form.reset({ name: '', phone: '' })
      onCreated?.(result.data)
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'CONFLICT') {
          const detail = err.details as { field?: string } | undefined
          if (detail?.field === 'phone') {
            form.setError('phone', { message: err.message })
          }
        }
        if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
          for (const issue of err.details as Array<{ path: string; message: string }>) {
            if (issue.path === 'name' || issue.path === 'phone') {
              form.setError(issue.path, { message: issue.message })
            }
          }
        }
        showError(err.message)
        return
      }
      showError('Đã xảy ra lỗi không xác định')
    }
  })

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="space-y-2">
        <Label htmlFor="quick-cust-name">Tên khách hàng</Label>
        <Input
          id="quick-cust-name"
          autoFocus={autoFocus}
          maxLength={100}
          placeholder="VD: Nguyễn Văn A"
          {...form.register('name')}
        />
        {form.formState.errors.name && (
          <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="quick-cust-phone">Số điện thoại</Label>
        <Input
          id="quick-cust-phone"
          maxLength={15}
          placeholder="VD: 0901234567"
          {...form.register('phone')}
        />
        {form.formState.errors.phone && (
          <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending}>
            Hủy
          </Button>
        )}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </div>
    </form>
  )
}
