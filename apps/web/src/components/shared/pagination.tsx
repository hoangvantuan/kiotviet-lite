import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface PaginationProps {
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
  unitLabel?: string
}

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  unitLabel = 'mục',
}: PaginationProps) {
  const [jumpInput, setJumpInput] = useState<string>(String(page))

  useEffect(() => {
    setJumpInput(String(page))
  }, [page])

  if (total === 0) return null

  const fromIdx = (page - 1) * pageSize + 1
  const toIdx = Math.min(page * pageSize, total)

  const handleJump = () => {
    const n = Number(jumpInput)
    if (!Number.isInteger(n) || n < 1 || n > totalPages) {
      setJumpInput(String(page))
      return
    }
    if (n !== page) onPageChange(n)
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-3 md:flex-row md:items-center md:justify-between">
      <div className="text-sm text-muted-foreground">
        Hiển thị {fromIdx}-{toIdx} / {total} {unitLabel}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Trước</span>
        </Button>
        <span className="hidden text-sm md:inline">
          Trang
          <Input
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            onBlur={handleJump}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            className="mx-2 inline-block h-8 w-14 px-2 text-center"
            inputMode="numeric"
          />
          / {totalPages}
        </span>
        <span className="text-sm md:hidden">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <span className="hidden sm:inline">Sau</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
