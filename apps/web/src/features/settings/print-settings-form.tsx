import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ImagePlus, X } from 'lucide-react'

import {
  type UpdatePrintSettingsInput,
  updatePrintSettingsSchema,
} from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { formatVnd } from '@/lib/currency'
import { showError, showSuccess } from '@/lib/toast'

import {
  usePrintSettingsQuery,
  useUpdatePrintSettingsMutation,
} from './use-print-settings'

const MAX_LOGO_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png']

const PAPER_SIZE_OPTIONS = [
  { value: '58mm', label: 'Thermal 58mm' },
  { value: '80mm', label: 'Thermal 80mm' },
  { value: 'a4', label: 'A4' },
  { value: 'a5', label: 'A5' },
] as const

interface ToggleField {
  name: keyof UpdatePrintSettingsInput
  label: string
}

const TOGGLE_FIELDS: ToggleField[] = [
  { name: 'showCustomerName', label: 'Tên khách hàng' },
  { name: 'showCustomerPhone', label: 'SĐT khách hàng' },
  { name: 'showDiscount', label: 'Chiết khấu' },
  { name: 'showSku', label: 'Mã SKU' },
  { name: 'showOldDebt', label: 'Nợ cũ' },
  { name: 'showNewDebt', label: 'Nợ mới' },
  { name: 'showCostPrice', label: 'Giá vốn' },
  { name: 'showNotes', label: 'Ghi chú cuối hóa đơn' },
]

const SAMPLE_ITEMS = [
  { name: 'Sữa tươi Vinamilk 1L', qty: 2, price: 35000, discount: 0, total: 70000 },
  { name: 'Mì Hảo Hảo (thùng 30)', qty: 1, price: 95000, discount: 5000, total: 90000 },
  { name: 'Coca-Cola 330ml', qty: 3, price: 10000, discount: 0, total: 30000 },
]

export function PrintSettingsForm() {
  const settingsQuery = usePrintSettingsQuery()
  const updateMutation = useUpdatePrintSettingsMutation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [logoError, setLogoError] = useState<string | null>(null)

  const form = useForm<UpdatePrintSettingsInput>({
    resolver: zodResolver(updatePrintSettingsSchema),
    mode: 'onTouched',
    defaultValues: {
      logoUrl: null,
      slogan: null,
      defaultPaperSize: '58mm',
      showOldDebt: false,
      showNewDebt: true,
      showCostPrice: false,
      showDiscount: true,
      showNotes: true,
      showCustomerName: true,
      showCustomerPhone: true,
      showSku: false,
      footerText: 'Cảm ơn quý khách!',
    },
  })

  useEffect(() => {
    if (settingsQuery.data) {
      const d = settingsQuery.data
      form.reset({
        logoUrl: d.logoUrl,
        slogan: d.slogan,
        defaultPaperSize: d.defaultPaperSize,
        showOldDebt: d.showOldDebt,
        showNewDebt: d.showNewDebt,
        showCostPrice: d.showCostPrice,
        showDiscount: d.showDiscount,
        showNotes: d.showNotes,
        showCustomerName: d.showCustomerName,
        showCustomerPhone: d.showCustomerPhone,
        showSku: d.showSku,
        footerText: d.footerText,
      })
    }
  }, [settingsQuery.data, form])

  const watched = form.watch()

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
    form.setValue('logoUrl', null, { shouldValidate: true, shouldDirty: true })
    setLogoError(null)
  }

  const submit = form.handleSubmit(async (values) => {
    try {
      await updateMutation.mutateAsync(values)
      showSuccess('Đã lưu cài đặt mẫu in')
    } catch {
      showError('Không lưu được cài đặt mẫu in')
    }
  })

  if (settingsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải cài đặt mẫu in…</p>
  }
  if (settingsQuery.isError) {
    return <p className="text-sm text-destructive">Không tải được cài đặt mẫu in.</p>
  }

  const isPending = updateMutation.isPending

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {/* Form bên trái */}
      <form onSubmit={submit} className="space-y-6" noValidate>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Mẫu in hóa đơn</h2>
          <p className="text-sm text-muted-foreground">
            Tùy chỉnh logo, slogan và các trường hiển thị trên hóa đơn.
          </p>
        </div>

        {/* Logo */}
        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex items-start gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted">
              {watched.logoUrl ? (
                <img src={watched.logoUrl} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus className="h-6 w-6 text-muted-foreground" />
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
                {watched.logoUrl ? 'Đổi logo' : 'Tải lên logo'}
              </Button>
              {watched.logoUrl && (
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

        {/* Slogan */}
        <div className="space-y-2">
          <Label htmlFor="slogan">Slogan</Label>
          <Input
            id="slogan"
            placeholder="VD: Chất lượng là uy tín"
            {...form.register('slogan')}
          />
          {form.formState.errors.slogan && (
            <p className="text-sm text-destructive">{form.formState.errors.slogan.message}</p>
          )}
        </div>

        {/* Paper size */}
        <div className="space-y-2">
          <Label>Khổ giấy mặc định</Label>
          <Select
            value={watched.defaultPaperSize ?? '58mm'}
            onValueChange={(v) =>
              form.setValue('defaultPaperSize', v as UpdatePrintSettingsInput['defaultPaperSize'], {
                shouldDirty: true,
              })
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAPER_SIZE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Toggle fields */}
        <div className="space-y-2">
          <Label className="text-base">Hiển thị trên hóa đơn</Label>
          <div className="space-y-3">
            {TOGGLE_FIELDS.map((field) => (
              <div key={field.name} className="flex items-center justify-between">
                <Label htmlFor={field.name} className="font-normal">
                  {field.label}
                </Label>
                <Switch
                  id={field.name}
                  checked={!!watched[field.name]}
                  onCheckedChange={(checked) =>
                    form.setValue(field.name, checked, { shouldDirty: true })
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Footer text */}
        <div className="space-y-2">
          <Label htmlFor="footerText">Chú thích cuối hóa đơn</Label>
          <Input
            id="footerText"
            placeholder="VD: Cảm ơn quý khách!"
            {...form.register('footerText')}
          />
          {form.formState.errors.footerText && (
            <p className="text-sm text-destructive">
              {form.formState.errors.footerText.message}
            </p>
          )}
        </div>

        <Button type="submit" disabled={isPending || !form.formState.isDirty}>
          {isPending ? 'Đang lưu…' : 'Lưu cài đặt'}
        </Button>
      </form>

      {/* Preview bên phải */}
      <div className="space-y-2">
        <Label className="text-base">Xem trước</Label>
        <InvoicePreview settings={watched} />
      </div>
    </div>
  )
}

function InvoicePreview({ settings }: { settings: UpdatePrintSettingsInput }) {
  const paperSize = settings.defaultPaperSize ?? '58mm'
  const isThermal = paperSize === '58mm' || paperSize === '80mm'
  const maxW = isThermal
    ? paperSize === '58mm'
      ? 'max-w-[220px]'
      : 'max-w-[300px]'
    : 'max-w-md'

  return (
    <div
      className={`${maxW} rounded-md border bg-white p-4 text-xs text-black shadow-sm`}
    >
      {/* Header */}
      <div className="text-center space-y-0.5">
        {settings.logoUrl && (
          <img
            src={settings.logoUrl}
            alt="Logo"
            className="mx-auto mb-1 h-10 w-10 object-contain"
          />
        )}
        <p className="font-bold text-sm">Cửa hàng ABC</p>
        {settings.slogan && (
          <p className="text-[10px] text-gray-500">{settings.slogan}</p>
        )}
        <p className="text-[10px] text-gray-500">123 Nguyễn Huệ, Q.1, TP.HCM</p>
        <p className="text-[10px] text-gray-500">SĐT: 0901 234 567</p>
      </div>

      <DashedLine />

      {/* Order info */}
      <div className="space-y-0.5">
        <PreviewRow label="HĐ" value="HD-20260504-0001" />
        <PreviewRow label="Ngày" value="04/05/2026 10:30" />
        {settings.showCustomerName && <PreviewRow label="KH" value="Nguyễn Văn A" />}
        {settings.showCustomerPhone && <PreviewRow label="SĐT" value="0901 234 567" />}
      </div>

      <DashedLine />

      {/* Items */}
      <div className="space-y-1">
        {SAMPLE_ITEMS.map((item) => (
          <div key={item.name}>
            <p className="truncate">
              {settings.showSku && (
                <span className="text-gray-400 mr-1">SKU001</span>
              )}
              {item.name}
            </p>
            <div className="flex justify-between pl-2">
              <span>
                {item.qty} x {formatVnd(item.price)}
              </span>
              <span>{formatVnd(item.total)}</span>
            </div>
            {settings.showDiscount && item.discount > 0 && (
              <div className="flex justify-between pl-2 text-gray-500">
                <span>CK</span>
                <span>-{formatVnd(item.discount)}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <DashedLine />

      {/* Totals */}
      <div className="space-y-0.5">
        <PreviewRow label="Tạm tính" value={formatVnd(190000)} />
        {settings.showDiscount && <PreviewRow label="Chiết khấu" value={`-${formatVnd(5000)}`} />}
        <PreviewRow label="TỔNG" value={formatVnd(185000)} bold />
        <PreviewRow label="Tiền mặt" value={formatVnd(200000)} />
        <PreviewRow label="Tiền thừa" value={formatVnd(15000)} />
      </div>

      {(settings.showOldDebt || settings.showNewDebt) && (
        <>
          <DashedLine />
          <div className="space-y-0.5">
            {settings.showOldDebt && <PreviewRow label="Nợ cũ" value={formatVnd(500000)} />}
            {settings.showNewDebt && <PreviewRow label="Nợ mới" value={formatVnd(0)} />}
          </div>
        </>
      )}

      {settings.showCostPrice && (
        <>
          <DashedLine />
          <PreviewRow label="Giá vốn" value={formatVnd(120000)} />
        </>
      )}

      <DashedLine />

      {settings.showNotes && (
        <p className="text-center text-[10px] text-gray-400 italic">
          Ghi chú: Giao trước 5h chiều
        </p>
      )}

      <p className="text-center mt-1">{settings.footerText || 'Cảm ơn quý khách!'}</p>
    </div>
  )
}

function DashedLine() {
  return <div className="my-1 border-t border-dashed border-gray-300" />
}

function PreviewRow({
  label,
  value,
  bold,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
