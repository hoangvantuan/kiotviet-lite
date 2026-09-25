import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

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
import { ApiClientError } from '@/lib/api-client'
import { showSuccess } from '@/lib/toast'

import {
  confirmStockImportApi,
  previewStockImportApi,
  type StockImportPreview,
} from './stock-checks-api'

interface StockCheckImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const errorMessage = (cause: unknown, fallback: string) =>
  cause instanceof ApiClientError ? cause.message : fallback

/** GL-02: nhập tồn đầu kỳ từ tệp thành phiếu kiểm nháp; tồn chỉ đổi khi xác nhận từng phiếu. */
export function StockCheckImportDialog({ open, onOpenChange }: StockCheckImportDialogProps) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<StockImportPreview | null>(null)
  const [approved, setApproved] = useState(false)
  const [error, setError] = useState('')

  const previewMutation = useMutation({ mutationFn: previewStockImportApi })
  const confirmMutation = useMutation({
    mutationFn: (input: { file: File; digest: string; approved: boolean }) =>
      confirmStockImportApi(input.file, input.digest, input.approved),
  })

  const reset = () => {
    setFile(null)
    setPreview(null)
    setApproved(false)
    setError('')
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const choose = async (next: File | null) => {
    reset()
    if (!next) return
    setFile(next)
    try {
      setPreview(await previewMutation.mutateAsync(next))
    } catch (cause) {
      setError(errorMessage(cause, 'Không đọc được tệp'))
    }
  }

  const confirm = async () => {
    if (!file || !preview) return
    try {
      const result = await confirmMutation.mutateAsync({ file, digest: preview.digest, approved })
      await queryClient.invalidateQueries({ queryKey: ['stock-checks'] })
      showSuccess(
        `Đã tạo ${result.ids.length} phiếu kiểm nháp với ${result.items} dòng. Xem lại rồi xác nhận từng phiếu để cập nhật tồn.`,
      )
      handleOpenChange(false)
    } catch (cause) {
      setError(errorMessage(cause, 'Không tạo được phiếu kiểm'))
    }
  }

  const blocked =
    !preview ||
    preview.errors.length > 0 ||
    preview.items === 0 ||
    (preview.requiresApproval && !approved) ||
    confirmMutation.isPending

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nhập tồn đầu kỳ từ Excel</DialogTitle>
          <DialogDescription>
            Dùng tệp xuất danh sách hàng từ KiotViet, hoặc tệp có cột Mã hàng và Số lượng thực tế.
            Hệ thống tạo phiếu kiểm nháp (tối đa 1000 dòng mỗi phiếu); tồn chỉ đổi khi bạn xác nhận
            từng phiếu.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="stock-import-file">Tệp XLSX</Label>
            <Input
              id="stock-import-file"
              type="file"
              accept=".xlsx"
              onChange={(event) => void choose(event.target.files?.[0] ?? null)}
            />
          </div>
          {previewMutation.isPending && (
            <p className="text-sm text-muted-foreground">Đang đọc tệp...</p>
          )}
          {preview && (
            <div className="space-y-3 text-sm">
              <p>
                {preview.totalRows} dòng trong tệp, <strong>{preview.items}</strong> dòng lệch tồn
                sẽ vào <strong>{preview.checks}</strong> phiếu kiểm nháp (tăng{' '}
                {preview.totalDiffPositive}, giảm {Math.abs(preview.totalDiffNegative)}).
              </p>
              {preview.errors.length > 0 && (
                <section className="space-y-1 rounded-md border border-destructive/40 p-3">
                  <h3 className="font-medium text-destructive">
                    {preview.errors.length} dòng lỗi, sửa tệp rồi tải lại
                  </h3>
                  <ul className="max-h-40 space-y-1 overflow-y-auto" aria-label="Dòng lỗi">
                    {preview.errors.slice(0, 50).map((item, index) => (
                      <li key={index}>
                        Dòng {item.row}, cột {item.column}: {item.message}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {preview.conversions.length > 0 && (
                <section className="space-y-2 rounded-md border p-3">
                  <h3 className="font-medium">Thay đổi tự động</h3>
                  <ul className="max-h-56 space-y-1 overflow-y-auto" aria-label="Thay đổi tự động">
                    {preview.conversions.map((item) => (
                      <li key={item.code}>
                        {item.message}
                        <span className="text-muted-foreground">
                          {' '}
                          ({item.count} dòng
                          {item.rows.length > 0 &&
                            `: ${item.rows.join(', ')}${item.count > item.rows.length ? '…' : ''}`}
                          )
                        </span>
                      </li>
                    ))}
                  </ul>
                  {preview.requiresApproval && (
                    <label className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-amber-950">
                      <input
                        type="checkbox"
                        checked={approved}
                        onChange={(event) => setApproved(event.target.checked)}
                        className="mt-1 accent-primary"
                      />
                      Tôi đã xem và đồng ý các thay đổi tự động trên.
                    </label>
                  )}
                </section>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
            Huỷ
          </Button>
          <Button type="button" onClick={() => void confirm()} disabled={blocked}>
            {confirmMutation.isPending ? 'Đang tạo phiếu...' : 'Tạo phiếu kiểm nháp'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
