import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useStoreQuery, useUpdateStoreMutation } from '@/features/settings/use-store-settings'
import { showError, showSuccess } from '@/lib/toast'

const formSchema = z.object({
  debtWarningPercent: z.coerce
    .number()
    .int('Phải là số nguyên')
    .min(1, 'Tối thiểu 1%')
    .max(100, 'Tối đa 100%'),
  overdueDay1: z.coerce.number().int().min(1, 'Tối thiểu 1 ngày').max(999),
  overdueDay2: z.coerce.number().int().min(1, 'Tối thiểu 1 ngày').max(999),
  overdueDay3: z.coerce.number().int().min(1, 'Tối thiểu 1 ngày').max(999),
})

type FormValues = z.infer<typeof formSchema>

export function SettingsDebtPage() {
  const storeQuery = useStoreQuery()
  const updateMutation = useUpdateStoreMutation()
  const store = storeQuery.data

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { debtWarningPercent: 80, overdueDay1: 30, overdueDay2: 60, overdueDay3: 90 },
    mode: 'onTouched',
  })

  useEffect(() => {
    if (!store) return
    const days = store.debtOverdueDays.split(',').map(Number)
    form.reset({
      debtWarningPercent: store.debtWarningPercent,
      overdueDay1: days[0] ?? 30,
      overdueDay2: days[1] ?? 60,
      overdueDay3: days[2] ?? 90,
    })
  }, [store, form])

  async function onSubmit(values: FormValues) {
    const days = [values.overdueDay1, values.overdueDay2, values.overdueDay3].sort((a, b) => a - b)
    try {
      await updateMutation.mutateAsync({
        debtWarningPercent: values.debtWarningPercent,
        debtOverdueDays: days.join(','),
      })
      showSuccess('Đã cập nhật cài đặt công nợ')
    } catch {
      showError('Không thể cập nhật cài đặt')
    }
  }

  if (storeQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>
  }

  const warningValue = form.watch('debtWarningPercent')

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-lg space-y-6">
      <div className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
        <div>
          <h3 className="text-sm font-medium text-foreground">Ngưỡng cảnh báo hạn mức</h3>
          <p className="text-xs text-muted-foreground">
            Khách hàng nợ {'>'}= {warningValue || 80}% hạn mức sẽ hiển thị cảnh báo vàng
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="debtWarningPercent">Cảnh báo khi nợ đạt (%) hạn mức</Label>
          <div className="flex items-center gap-2">
            <Input
              id="debtWarningPercent"
              type="number"
              min={1}
              max={100}
              className="w-24"
              {...form.register('debtWarningPercent', { valueAsNumber: true })}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          {form.formState.errors.debtWarningPercent && (
            <p className="text-xs text-destructive">
              {form.formState.errors.debtWarningPercent.message}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Ví dụ: Hạn mức 1.000.000₫, cảnh báo khi nợ {'>'}{' '}
            {Math.round(10000 * (warningValue || 80)).toLocaleString('vi-VN')}₫
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
        <div>
          <h3 className="text-sm font-medium text-foreground">Mốc cảnh báo quá hạn</h3>
          <p className="text-xs text-muted-foreground">
            Khoản nợ quá hạn sẽ hiển thị badge theo các mốc này
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="overdueDay1">Mốc 1 (ngày)</Label>
            <Input
              id="overdueDay1"
              type="number"
              min={1}
              max={999}
              className="w-20"
              {...form.register('overdueDay1', { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="overdueDay2">Mốc 2 (ngày)</Label>
            <Input
              id="overdueDay2"
              type="number"
              min={1}
              max={999}
              className="w-20"
              {...form.register('overdueDay2', { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="overdueDay3">Mốc 3 (ngày)</Label>
            <Input
              id="overdueDay3"
              type="number"
              min={1}
              max={999}
              className="w-20"
              {...form.register('overdueDay3', { valueAsNumber: true })}
            />
          </div>
        </div>
        {(form.formState.errors.overdueDay1 ||
          form.formState.errors.overdueDay2 ||
          form.formState.errors.overdueDay3) && (
          <p className="text-xs text-destructive">Giá trị mốc phải từ 1 đến 999</p>
        )}
      </div>

      <Button
        type="submit"
        disabled={!form.formState.isDirty || updateMutation.isPending}
      >
        {updateMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
      </Button>
    </form>
  )
}
