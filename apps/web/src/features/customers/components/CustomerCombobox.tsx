import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCustomersQuery } from '@/features/customers/use-customers'
import { useDebounced } from '@/hooks/use-debounced'
import { cn } from '@/lib/utils'

interface CustomerComboboxProps {
  value?: string
  onChange: (value: string | undefined) => void
  placeholder?: string
  hasDebt?: 'all' | 'yes' | 'no'
}

export function CustomerCombobox({
  value,
  onChange,
  placeholder = 'Chọn khách hàng',
  hasDebt = 'all',
}: CustomerComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data } = useCustomersQuery({
    search: debouncedSearch || undefined,
    pageSize: 50,
    hasDebt,
  })

  const customers = data?.data ?? []

  // Try to find selected customer name.
  // If it's not in the current page, we just show "1 khách hàng đã chọn" or similar.
  // Ideally, the parent passes the name, or we do a specific query.
  // Let's do a basic find.
  const selectedCustomer = customers.find((c) => c.id === value)

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
          className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
        >
          {selectedCustomer ? (
            <span className="truncate">{selectedCustomer.name}</span>
          ) : (
            <span className="truncate text-muted-foreground">
              {value ? 'Đã chọn KH' : placeholder}
            </span>
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
              placeholder="Tìm khách hàng..."
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
          {customers.length === 0 && debouncedSearch && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">Không tìm thấy</p>
          )}
          {customers.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange(c.id)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                c.id === value && 'bg-accent text-accent-foreground',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.phone ? `${c.phone}` : ''}
                </p>
              </div>
              {c.id === value && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
