import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useProductQuery, useProductsQuery } from '@/features/products/use-products'
import { useDebounced } from '@/hooks/use-debounced'
import { cn } from '@/lib/utils'

interface ProductComboboxProps {
  value?: string
  onChange: (value: string | undefined) => void
  placeholder?: string
  status?: 'all' | 'active' | 'inactive'
}

export function ProductCombobox({
  value,
  onChange,
  placeholder = 'Chọn sản phẩm',
  status = 'active',
}: ProductComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data } = useProductsQuery({
    search: debouncedSearch || undefined,
    pageSize: 20,
    status,
  })
  const products = data?.data ?? []

  const { data: detailData } = useProductQuery(
    value && !products.find((p) => p.id === value) ? value : undefined,
  )
  const selectedProduct = products.find((p) => p.id === value) ?? detailData

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
          className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
        >
          {selectedProduct ? (
            <span className="truncate">{selectedProduct.name}</span>
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
              placeholder="Tìm sản phẩm..."
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
          {products.length === 0 && debouncedSearch && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">Không tìm thấy</p>
          )}
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p.id)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                p.id === value && 'bg-accent text-accent-foreground',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">{p.sku}</p>
              </div>
              {p.id === value && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
