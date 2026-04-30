import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, UserPlus, Users, X } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCustomersQuery } from '@/features/customers/use-customers'
import { cn } from '@/lib/utils'
import { useCartStore } from '@/stores/use-cart-store'

import { QuickCreateCustomerInline } from './QuickCreateCustomerInline'

export function CustomerSearchCombobox() {
  const customerId = useCartStore((s) => s.tabs[s.activeTab]?.customerId ?? null)
  const customerName = useCartStore((s) => s.tabs[s.activeTab]?.customerName ?? null)
  const setCustomer = useCartStore((s) => s.setCustomer)

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  const { data } = useCustomersQuery({
    search: debouncedSearch || undefined,
    pageSize: 10,
  })

  const customers = data?.data ?? []

  const handleSelect = useCallback(
    (c: { id: string; name: string; groupId: string | null; groupName: string | null }) => {
      setCustomer(c)
      setOpen(false)
      setSearch('')
    },
    [setCustomer],
  )

  const handleClear = useCallback(() => {
    setCustomer(null)
  }, [setCustomer])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  if (customerId) {
    return (
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Users className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {customerName}
        </span>
        <button
          type="button"
          onClick={handleClear}
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="Bỏ chọn khách hàng"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/40"
          >
            <Users className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Khách lẻ</span>
            <Search className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
          sideOffset={0}
        >
          <div className="p-2">
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên, SĐT..."
              className="h-8 text-sm"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {customers.length === 0 && debouncedSearch && (
              <p className="px-3 py-2 text-center text-xs text-muted-foreground">Không tìm thấy</p>
            )}
            {customers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  handleSelect({
                    id: c.id,
                    name: c.name,
                    groupId: c.groupId,
                    groupName: c.groupName,
                  })
                }
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                  c.id === customerId && 'bg-accent',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.phone}
                    {c.groupName && ` · ${c.groupName}`}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <div className="border-t border-border p-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setQuickCreateOpen(true)
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-primary transition-colors hover:bg-accent"
            >
              <UserPlus className="h-4 w-4" />
              Tạo KH mới
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <QuickCreateCustomerInline
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        onCreated={handleSelect}
      />
    </>
  )
}
