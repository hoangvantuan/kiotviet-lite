import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { useAllPriceListsQuery } from '../use-price-lists'
import { ComparePriceListsView } from './ComparePriceListsView'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialAId?: string
  initialBId?: string
}

function methodLabel(method: 'direct' | 'formula' | 'chain'): string {
  switch (method) {
    case 'direct':
      return 'Trực tiếp'
    case 'formula':
      return 'Công thức'
    case 'chain':
      return 'Nối chuỗi'
  }
}

export function ComparePriceListsDialog({ open, onOpenChange, initialAId, initialBId }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [listAId, setListAId] = useState<string | null>(initialAId ?? null)
  const [listBId, setListBId] = useState<string | null>(initialBId ?? null)

  const listsQuery = useAllPriceListsQuery({ enabled: open })

  // Reset state khi đóng dialog
  useEffect(() => {
    if (!open) {
      setStep(1)
      setListAId(initialAId ?? null)
      setListBId(initialBId ?? null)
    }
  }, [open, initialAId, initialBId])

  const items = listsQuery.data?.data ?? []
  const canCompare = Boolean(listAId && listBId && listAId !== listBId)

  const handleSwap = () => {
    setListAId(listBId)
    setListBId(listAId)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle>So sánh bảng giá</DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Chọn 2 bảng giá để xem chênh lệch, margin và cảnh báo dưới vốn.'
              : 'Đối chiếu giá giữa 2 bảng. Lọc, tìm kiếm và xuất CSV nếu cần.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto p-4">
          {step === 1 ? (
            <div className="space-y-4 max-w-2xl">
              {listsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Đang tải danh sách bảng giá…</p>
              ) : listsQuery.isError ? (
                <p className="text-sm text-destructive">Không tải được danh sách bảng giá.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Bảng giá A</label>
                      <Select value={listAId ?? ''} onValueChange={(v) => setListAId(v || null)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn bảng giá" />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((p) => (
                            <SelectItem key={p.id} value={p.id} disabled={p.id === listBId}>
                              {p.name} ({methodLabel(p.method)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Bảng giá B</label>
                      <Select value={listBId ?? ''} onValueChange={(v) => setListBId(v || null)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn bảng giá" />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((p) => (
                            <SelectItem key={p.id} value={p.id} disabled={p.id === listAId}>
                              {p.name} ({methodLabel(p.method)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                      Đóng
                    </Button>
                    <Button disabled={!canCompare} onClick={() => setStep(2)}>
                      So sánh
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            listAId &&
            listBId && (
              <ComparePriceListsView
                listAId={listAId}
                listBId={listBId}
                onSwap={handleSwap}
                onBack={() => setStep(1)}
              />
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
