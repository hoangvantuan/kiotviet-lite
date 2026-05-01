import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowLeftRight, Download, RefreshCw } from 'lucide-react'

import type { PriceListDetail } from '@kiotviet-lite/shared'

import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useDebounced } from '@/hooks/use-debounced'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ApiClientError } from '@/lib/api-client'
import { downloadCsv, slugify } from '@/lib/csv'
import { showError, showSuccess } from '@/lib/toast'
import { cn } from '@/lib/utils'

import { buildCompareCsv } from '../lib/compare-csv'
import {
  applyCompareFilters,
  type CompareFiltersState,
  DEFAULT_COMPARE_FILTERS,
} from '../lib/compare-filters'
import { useComparePriceListsQuery } from '../use-price-lists'
import { ComparePriceListsCardList } from './ComparePriceListsCardList'
import { ComparePriceListsTable } from './ComparePriceListsTable'
import { PriceListStatusBadge } from './PriceListStatusBadge'

interface Props {
  listAId: string
  listBId: string
  onSwap: () => void
  onBack: () => void
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

function buildIneffectiveReason(list: PriceListDetail): string {
  if (list.deletedAt) return 'Đã bị xoá'
  if (!list.isActive) return 'Đã tắt'
  const today = new Date().toISOString().slice(0, 10)
  if (list.effectiveFrom && today < list.effectiveFrom) {
    return `Chưa hiệu lực từ ${formatDate(list.effectiveFrom)}`
  }
  if (list.effectiveTo && today > list.effectiveTo) {
    return `Đã hết hạn từ ${formatDate(list.effectiveTo)}`
  }
  return 'Không hiệu lực'
}

function methodLabel(method: PriceListDetail['method']): string {
  switch (method) {
    case 'direct':
      return 'Trực tiếp'
    case 'formula':
      return 'Công thức'
    case 'chain':
      return 'Nối chuỗi'
  }
}

export function ComparePriceListsView({ listAId, listBId, onSwap, onBack }: Props) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const query = useComparePriceListsQuery(listAId, listBId)

  const [filters, setFilters] = useState<CompareFiltersState>(DEFAULT_COMPARE_FILTERS)
  const debouncedSearch = useDebounced(filters.search, 300)

  const filteredRows = useMemo(() => {
    if (!query.data) return []
    return applyCompareFilters(query.data.rows, { ...filters, search: debouncedSearch })
  }, [query.data, filters, debouncedSearch])

  // Khi 1 trong 2 bảng bị xoá giữa flow → 404 → toast + back
  useEffect(() => {
    if (query.isError && query.error instanceof ApiClientError && query.error.status === 404) {
      showError('Bảng giá đã bị xoá hoặc không tồn tại, vui lòng chọn lại')
      onBack()
    }
  }, [query.isError, query.error, onBack])

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-12 rounded bg-muted animate-pulse" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-muted/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (query.isError) {
    if (query.error instanceof ApiClientError && query.error.status === 404) {
      return null
    }
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Không tải được dữ liệu so sánh.</p>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          <RefreshCw className="h-4 w-4" />
          Thử lại
        </Button>
      </div>
    )
  }

  if (!query.data) return null

  const { listA, listB, rows, summary } = query.data

  const ineffectiveBanners: { which: 'A' | 'B'; list: PriceListDetail }[] = []
  if (!listA.effectiveActive) ineffectiveBanners.push({ which: 'A', list: listA })
  if (!listB.effectiveActive) ineffectiveBanners.push({ which: 'B', list: listB })

  const handleExportCsv = () => {
    if (filteredRows.length === 0) return
    const csv = buildCompareCsv(filteredRows)
    const today = new Date().toISOString().slice(0, 10)
    const filename = `so-sanh-bang-gia-${slugify(listA.name)}-vs-${slugify(listB.name)}-${today}.csv`
    downloadCsv(filename, csv)
    showSuccess(`Đã xuất ${filteredRows.length} dòng`)
  }

  const exportDisabled = filteredRows.length === 0

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* Header step 2 */}
      <div className="flex flex-wrap items-start gap-2 justify-between">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">A</Badge>
            <span className="font-medium truncate">{listA.name}</span>
            <Badge variant="outline" className="text-xs">
              {methodLabel(listA.method)}
            </Badge>
            <PriceListStatusBadge priceList={listA} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">B</Badge>
            <span className="font-medium truncate">{listB.name}</span>
            <Badge variant="outline" className="text-xs">
              {methodLabel(listB.method)}
            </Badge>
            <PriceListStatusBadge priceList={listB} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Button>
          <Button variant="outline" size="sm" onClick={onSwap}>
            <ArrowLeftRight className="h-4 w-4" />
            Đổi chiều
          </Button>
          <Button size="sm" onClick={handleExportCsv} disabled={exportDisabled}>
            <Download className="h-4 w-4" />
            Xuất CSV
          </Button>
        </div>
      </div>

      {/* Banner cảnh báo */}
      {ineffectiveBanners.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 space-y-1">
          {ineffectiveBanners.map(({ which, list }) => (
            <div key={which} className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Bảng giá {which} ({list.name}) đang không hiệu lực ({buildIneffectiveReason(list)}).
                Kết quả so sánh chỉ mang tính tham khảo.
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">
          Tổng: {summary.totalProducts} SP{' '}
          {filteredRows.length !== summary.totalProducts && (
            <span className="ml-1 text-muted-foreground">(hiển thị {filteredRows.length})</span>
          )}
        </Badge>
        <Badge variant="outline">Có ở cả 2 bảng: {summary.bothCount}</Badge>
        <Badge variant="outline">Chỉ A: {summary.onlyACount}</Badge>
        <Badge variant="outline">Chỉ B: {summary.onlyBCount}</Badge>
        <Badge variant="outline" className="border-amber-300 text-amber-700">
          Δ &gt; 10%: {summary.diffOver10Count}
        </Badge>
        <Badge
          variant={summary.belowCostBCount > 0 ? 'destructive' : 'outline'}
          className={cn(summary.belowCostBCount === 0 && 'text-muted-foreground')}
        >
          Dưới vốn (B): {summary.belowCostBCount}
        </Badge>
      </div>

      {/* Filter row */}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:gap-3 md:flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="compare-search" className="text-xs">
            Tìm sản phẩm
          </Label>
          <Input
            id="compare-search"
            placeholder="Tên hoặc SKU…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>
        <div className="flex flex-wrap gap-4 items-center">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={filters.onlyBelowCostB}
              onCheckedChange={(v) => setFilters((f) => ({ ...f, onlyBelowCostB: v }))}
            />
            Chỉ dưới vốn (B)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={filters.onlyDiffOver10}
              onCheckedChange={(v) => setFilters((f) => ({ ...f, onlyDiffOver10: v }))}
            />
            Δ &gt; 10%
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={filters.onlyBoth}
              onCheckedChange={(v) => setFilters((f) => ({ ...f, onlyBoth: v }))}
            />
            Có ở cả 2 bảng
          </label>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto">
        {rows.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="Cả 2 bảng giá đều chưa có sản phẩm"
            description="Hãy thêm sản phẩm vào bảng giá rồi so sánh lại."
          />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="Không có sản phẩm khớp bộ lọc"
            description="Thử bỏ bớt bộ lọc hoặc tìm kiếm khác."
          />
        ) : isDesktop ? (
          <ComparePriceListsTable rows={filteredRows} />
        ) : (
          <ComparePriceListsCardList rows={filteredRows} />
        )}
      </div>
    </div>
  )
}
