import { useEffect, useState } from 'react'

import type { StoreSettings } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { COMMON_BANK_BINS } from '@/features/pos/bank-bins'
import { VietQrPanel } from '@/features/pos/components/VietQrPanel'
import { handleApiError } from '@/lib/api-error'
import { showError, showSuccess } from '@/lib/toast'

import { useUpdateStoreMutation } from './use-store-settings'

interface BankForm {
  bankBin: string
  bankAccountNumber: string
  bankAccountName: string
}

function toForm(store: StoreSettings): BankForm {
  return {
    bankBin: store.bankBin ?? '',
    bankAccountNumber: store.bankAccountNumber ?? '',
    bankAccountName: store.bankAccountName ?? '',
  }
}

/**
 * POS-06: bật hay tắt ca bán hàng. POS-07: tài khoản nhận chuyển khoản để POS sinh mã VietQR.
 * Máy chủ kiểm định dạng BIN (6 chữ số) và số tài khoản (6 tới 19 chữ số).
 */
export function CashSettingsSection({ store }: { store: StoreSettings }) {
  const updateMutation = useUpdateStoreMutation()
  const [bank, setBank] = useState<BankForm>(() => toForm(store))
  const [errors, setErrors] = useState<Partial<Record<keyof BankForm, string>>>({})

  useEffect(() => {
    setBank(toForm(store))
  }, [store])

  const saved = toForm(store)
  const dirty =
    bank.bankBin !== saved.bankBin ||
    bank.bankAccountNumber !== saved.bankAccountNumber ||
    bank.bankAccountName !== saved.bankAccountName
  const isPending = updateMutation.isPending

  const saveBank = async () => {
    setErrors({})
    const bin = bank.bankBin.trim()
    const account = bank.bankAccountNumber.trim()
    const name = bank.bankAccountName.trim()
    try {
      await updateMutation.mutateAsync({
        bankBin: bin || null,
        bankAccountNumber: account || null,
        bankAccountName: name || null,
      })
      showSuccess('Đã lưu tài khoản nhận tiền')
    } catch (err) {
      handleApiError(
        err,
        {
          setError: (field: string, error: { message: string }) =>
            setErrors((prev) => ({ ...prev, [field]: error.message })),
        },
        ['bankBin', 'bankAccountNumber', 'bankAccountName'],
      )
    }
  }

  const previewBank = {
    bankBin: bank.bankBin.trim() || null,
    bankAccountNumber: bank.bankAccountNumber.trim() || null,
    bankAccountName: bank.bankAccountName.trim() || null,
  }

  return (
    <>
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold text-foreground">Ca bán hàng</h2>
        <div className="flex items-center gap-3">
          <Switch
            id="shifts-enabled"
            checked={store.shiftsEnabled}
            disabled={isPending}
            onCheckedChange={async (enabled) => {
              try {
                await updateMutation.mutateAsync({ shiftsEnabled: enabled })
                showSuccess(enabled ? 'Đã bật ca bán hàng' : 'Đã tắt ca bán hàng')
              } catch {
                showError('Không thể thay đổi cài đặt ca bán hàng')
              }
            }}
          />
          <Label htmlFor="shifts-enabled">
            {store.shiftsEnabled ? 'Đang dùng ca bán hàng' : 'Không dùng ca bán hàng'}
          </Label>
        </div>
        <p className="text-sm text-muted-foreground">
          Khi bật, người bán phải mở ca với tiền quỹ đầu ca trước khi bán, cuối ca đếm tiền và đóng
          ca để thấy chênh lệch. Khi tắt, vẫn đối soát tiền mặt cuối ngày trong báo cáo dòng tiền.
        </p>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Tài khoản nhận chuyển khoản</h2>
          <p className="text-sm text-muted-foreground">
            Dùng để tạo mã VietQR khi khách thanh toán chuyển khoản hoặc QR tại quầy. Mã tạo ngay
            trên máy, vẫn dùng được khi mất mạng.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bank-bin">Ngân hàng (mã BIN)</Label>
            <Input
              id="bank-bin"
              inputMode="numeric"
              maxLength={6}
              placeholder="VD: 970436"
              list="bank-bin-options"
              value={bank.bankBin}
              onChange={(e) => setBank((b) => ({ ...b, bankBin: e.target.value }))}
            />
            <datalist id="bank-bin-options">
              {COMMON_BANK_BINS.map((b) => (
                <option key={b.bin} value={b.bin}>
                  {b.name}
                </option>
              ))}
            </datalist>
            {errors.bankBin && <p className="text-sm text-destructive">{errors.bankBin}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank-account-number">Số tài khoản</Label>
            <Input
              id="bank-account-number"
              inputMode="numeric"
              maxLength={19}
              value={bank.bankAccountNumber}
              onChange={(e) => setBank((b) => ({ ...b, bankAccountNumber: e.target.value }))}
            />
            {errors.bankAccountNumber && (
              <p className="text-sm text-destructive">{errors.bankAccountNumber}</p>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="bank-account-name">Tên chủ tài khoản</Label>
            <Input
              id="bank-account-name"
              maxLength={50}
              placeholder="VD: NGUYEN VAN A"
              value={bank.bankAccountName}
              onChange={(e) => setBank((b) => ({ ...b, bankAccountName: e.target.value }))}
            />
            {errors.bankAccountName && (
              <p className="text-sm text-destructive">{errors.bankAccountName}</p>
            )}
          </div>
        </div>

        {dirty && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Mã thử 10.000 đ: quét bằng ứng dụng ngân hàng để kiểm tra đúng tài khoản trước khi
              lưu.
            </p>
            <VietQrPanel bank={previewBank} amount={10_000} note="KIEM TRA" />
          </div>
        )}

        <div className="flex justify-end">
          <Button type="button" onClick={saveBank} disabled={isPending || !dirty}>
            {isPending ? 'Đang lưu…' : 'Lưu tài khoản'}
          </Button>
        </div>
      </section>
    </>
  )
}
