import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'

import { formatPhone } from '@kiotviet-lite/shared'

import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSupplierQuery, useSuppliersQuery } from '@/features/suppliers/use-suppliers'
import { useDebounced } from '@/hooks/use-debounced'
import { formatVndWithSuffix } from '@/lib/currency'
import { cn } from '@/lib/utils'

interface SupplierComboboxProps {
  disabled?: boolean
  value?: string
  onChange: (value: string | undefined) => void
  placeholder?: string
  hasDebt?: 'all' | 'yes' | 'no'
  showDebt?: boolean
}

export function SupplierCombobox({
  value,
  onChange,
  placeholder = 'Chọn nhà cung cấp',
  hasDebt = 'all',
  showDebt = false,
  disabled = false,
}: SupplierComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data } = useSuppliersQuery({
    search: debouncedSearch || undefined,
    pageSize: 20,
    hasDebt,
  })
  const suppliers = data?.data ?? []

  const { data: detailData } = useSupplierQuery(
    value && !suppliers.find((s) => s.id === value) ? value : undefined,
  )
  const selectedSupplier = suppliers.find((s) => s.id === value) ?? detailData

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
        >
          {selectedSupplier ? (
            <span className="truncate">
              {selectedSupplier.name}
              {showDebt &&
                selectedSupplier.currentDebt > 0 &&
                ` - Nợ: ${formatVndWithSuffix(selectedSupplier.currentDebt)}`}
            </span>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm NCC..."
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          <button
            type="button"
            onClick={() => {
              onChange(undefined)
              setOpen(false)
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
              !value && 'bg-accent text-accent-foreground',
            )}
          >
            Tất cả / Bỏ chọn
          </button>
          {suppliers.length === 0 && debouncedSearch && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">Không tìm thấy</p>
          )}
          {suppliers.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                onChange(s.id)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                s.id === value && 'bg-accent text-accent-foreground',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatPhone(s.phone)}
                  {showDebt && ` - Nợ: ${formatVndWithSuffix(s.currentDebt)}`}
                </p>
              </div>
              {s.id === value && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
