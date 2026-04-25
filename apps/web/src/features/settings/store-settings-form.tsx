import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ImagePlus, X } from 'lucide-react'

import { type UpdateStoreInput, updateStoreSchema } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiClientError } from '@/lib/api-client'
import { showError, showSuccess } from '@/lib/toast'

import { useStoreQuery, useUpdateStoreMutation } from './use-store-settings'

const MAX_LOGO_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png']

export function StoreSettingsForm() {
  const storeQuery = useStoreQuery()
  const updateMutation = useUpdateStoreMutation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [logoError, setLogoError] = useState<string | null>(null)

  const form = useForm<UpdateStoreInput>({
    resolver: zodResolver(updateStoreSchema),
    mode: 'onTouched',
    defaultValues: {
      name: '',
      address: '',
      phone: '',
      logoUrl: '',
    },
  })

  useEffect(() => {
    if (storeQuery.data) {
      form.reset({
        name: storeQuery.data.name ?? '',
        address: storeQuery.data.address ?? '',
        phone: storeQuery.data.phone ?? '',
        logoUrl: storeQuery.data.logoUrl ?? '',
      })
    }
  }, [storeQuery.data, form])

  const logoUrl = form.watch('logoUrl')

  const onLogoSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLogoError(null)
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!ALLOWED_TYPES.includes(file.type)) {
      setLogoError('Chỉ chấp nhận ảnh JPG hoặc PNG')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError('Kích thước ảnh tối đa 2MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') {
        form.setValue('logoUrl', result, { shouldValidate: true, shouldDirty: true })
      }
    }
    reader.onerror = () => setLogoError('Không đọc được ảnh, vui lòng thử lại')
    reader.readAsDataURL(file)
  }

  const removeLogo = () => {
    form.setValue('logoUrl', '', { shouldValidate: true, shouldDirty: true })
    setLogoError(null)
  }

  const submit = form.handleSubmit(async (values) => {
    try {
      const payload: UpdateStoreInput = {
        name: values.name,
        address: values.address?.trim() ? values.address : null,
        phone: values.phone?.trim() ? values.phone : null,
        logoUrl: values.logoUrl ? values.logoUrl : null,
      }
      await updateMutation.mutateAsync(payload)
      showSuccess('Đã cập nhật cửa hàng')
    } catch (err) {
      handleApiError(err, form)
    }
  })

  if (storeQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải thông tin cửa hàng…</p>
  }
  if (storeQuery.isError) {
    return <p className="text-sm text-destructive">Không tải được thông tin cửa hàng.</p>
  }

  const isPending = updateMutation.isPending

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-6" noValidate>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Thông tin cửa hàng</h2>
        <p className="text-sm text-muted-foreground">
          Cập nhật tên, địa chỉ, liên hệ và logo của cửa hàng.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="store-name">Tên cửa hàng</Label>
        <Input id="store-name" {...form.register('name')} />
        {form.formState.errors.name && (
          <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="store-address">Địa chỉ</Label>
        <Input id="store-address" {...form.register('address')} />
        {form.formState.errors.address && (
          <p className="text-sm text-destructive">{form.formState.errors.address.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="store-phone">Số điện thoại</Label>
        <Input id="store-phone" inputMode="tel" {...form.register('phone')} />
        {form.formState.errors.phone && (
          <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Logo cửa hàng</Label>
        <div className="flex items-start gap-4">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo cửa hàng" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={onLogoSelected}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              {logoUrl ? 'Đổi logo' : 'Tải lên logo'}
            </Button>
            {logoUrl && (
              <Button type="button" variant="ghost" size="sm" onClick={removeLogo}>
                <X className="h-4 w-4" />
                <span>Xoá logo</span>
              </Button>
            )}
            <p className="text-xs text-muted-foreground">JPG hoặc PNG, tối đa 2MB.</p>
            {logoError && <p className="text-sm text-destructive">{logoError}</p>}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || !form.formState.isDirty}>
          {isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
        </Button>
      </div>
    </form>
  )
}

function handleApiError(err: unknown, form: ReturnType<typeof useForm<UpdateStoreInput>>) {
  if (err instanceof ApiClientError) {
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
      for (const issue of err.details as Array<{ path: string; message: string }>) {
        if (['name', 'address', 'phone', 'logoUrl'].includes(issue.path)) {
          form.setError(issue.path as keyof UpdateStoreInput, { message: issue.message })
        }
      }
    }
    showError(err.message)
    return
  }
  showError('Đã xảy ra lỗi không xác định')
}
