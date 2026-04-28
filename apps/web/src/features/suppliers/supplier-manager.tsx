import { useState } from 'react'
import { MoreVertical, Pencil, Plus, RotateCcw, SearchX, Trash2, Truck } from 'lucide-react'

import type { SupplierHasDebt, SupplierListItem } from '@kiotviet-lite/shared'

import { EmptyState } from '@/components/shared/empty-state'
import { Pagination } from '@/components/shared/pagination'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDebounced } from '@/hooks/use-debounced'
import { ApiClientError } from '@/lib/api-client'
import { formatVndWithSuffix } from '@/lib/currency'
import { showError, showSuccess } from '@/lib/toast'

import { SupplierFormDialog } from './supplier-form-dialog'
import {
  useDeleteSupplierMutation,
  useRestoreSupplierMutation,
  useSupplierQuery,
  useSuppliersQuery,
  useTrashedSuppliersQuery,
} from './use-suppliers'

const PAGE_SIZE = 20

function DebtBadge({ currentDebt }: { currentDebt: number }) {
  if (currentDebt === 0) {
    return (
      <Badge variant="secondary" className="text-xs">
        0đ
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-yellow-300 bg-yellow-50 text-yellow-700 text-xs">
      {formatVndWithSuffix(currentDebt)}
    </Badge>
  )
}

export function SupplierManager() {
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounced(searchInput, 300)
  const [hasDebt, setHasDebt] = useState<SupplierHasDebt>('all')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<SupplierListItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SupplierListItem | null>(null)
  const [trashedOpen, setTrashedOpen] = useState(false)

  const editTargetDetail = useSupplierQuery(editTarget?.id)

  const suppliersQuery = useSuppliersQuery({
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch.trim() || undefined,
    hasDebt,
  })

  const items = suppliersQuery.data?.data ?? []
  const meta = suppliersQuery.data?.meta
  const isLoading = suppliersQuery.isLoading
  const isError = suppliersQuery.isError
  const isEmpty = !isLoading && items.length === 0
  const hasFilter = debouncedSearch.trim() !== '' || hasDebt !== 'all'

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Nhà cung cấp</h1>
          <p className="text-sm text-muted-foreground">Quản lý danh sách NCC và công nợ phải trả</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTrashedOpen(true)}>
            <Trash2 className="size-4 mr-1" /> NCC đã xoá
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1" /> Thêm NCC
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Tìm theo tên hoặc số điện thoại"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value)
            setPage(1)
          }}
          className="sm:max-w-xs"
        />
        <Select
          value={hasDebt}
          onValueChange={(v: SupplierHasDebt) => {
            setHasDebt(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="sm:max-w-44">
            <SelectValue placeholder="Công nợ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="yes">Có công nợ</SelectItem>
            <SelectItem value="no">Không có công nợ</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive">Không tải được danh sách. Thử lại sau.</p>
      )}

      {isEmpty && !hasFilter && (
        <EmptyState
          icon={Truck}
          title="Chưa có nhà cung cấp nào"
          description="Thêm NCC đầu tiên để tạo phiếu nhập"
          actionLabel="Thêm NCC"
          onAction={() => setCreateOpen(true)}
        />
      )}

      {isEmpty && hasFilter && (
        <EmptyState
          icon={SearchX}
          title="Không tìm thấy NCC"
          description="Thử thay đổi từ khoá hoặc bộ lọc."
        />
      )}

      {!isLoading && !isEmpty && (
        <>
          <div className="hidden md:block">
            <SupplierTable
              items={items}
              onEdit={(s) => setEditTarget(s)}
              onDelete={(s) => setDeleteTarget(s)}
            />
          </div>
          <div className="md:hidden">
            <SupplierCardList
              items={items}
              onEdit={(s) => setEditTarget(s)}
              onDelete={(s) => setDeleteTarget(s)}
            />
          </div>
        </>
      )}

      {meta && meta.totalPages > 1 && (
        <Pagination
          page={meta.page}
          pageSize={meta.pageSize}
          total={meta.total}
          totalPages={meta.totalPages}
          onPageChange={setPage}
        />
      )}

      <SupplierFormDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" />
      {editTarget && editTargetDetail.data && (
        <SupplierFormDialog
          key={editTarget.id}
          open={!!editTarget}
          onOpenChange={(v) => {
            if (!v) setEditTarget(null)
          }}
          mode="edit"
          supplier={editTargetDetail.data}
        />
      )}
      <DeleteSupplierDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
      <TrashedSuppliersSheet open={trashedOpen} onOpenChange={setTrashedOpen} />
    </div>
  )
}

interface SupplierTableProps {
  items: SupplierListItem[]
  onEdit: (s: SupplierListItem) => void
  onDelete: (s: SupplierListItem) => void
}

function SupplierTable({ items, onEdit, onDelete }: SupplierTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tên</TableHead>
            <TableHead>SĐT</TableHead>
            <TableHead className="hidden md:table-cell">Email</TableHead>
            <TableHead>Công nợ</TableHead>
            <TableHead className="hidden md:table-cell text-right">Số phiếu</TableHead>
            <TableHead className="hidden lg:table-cell text-right">Tổng đã nhập</TableHead>
            <TableHead className="text-right">Hành động</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => (
            <TableRow key={it.id}>
              <TableCell className="font-medium">{it.name}</TableCell>
              <TableCell className="font-mono text-sm">{it.phone ?? '—'}</TableCell>
              <TableCell className="hidden md:table-cell text-muted-foreground">
                {it.email ?? '—'}
              </TableCell>
              <TableCell>
                <DebtBadge currentDebt={it.currentDebt} />
              </TableCell>
              <TableCell className="hidden md:table-cell text-right">{it.purchaseCount}</TableCell>
              <TableCell className="hidden lg:table-cell text-right">
                {formatVndWithSuffix(it.totalPurchased)}
              </TableCell>
              <TableCell className="text-right">
                <Button size="icon" variant="ghost" onClick={() => onEdit(it)} aria-label="Sửa">
                  <Pencil className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => onDelete(it)} aria-label="Xoá">
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

interface SupplierCardListProps {
  items: SupplierListItem[]
  onEdit: (s: SupplierListItem) => void
  onDelete: (s: SupplierListItem) => void
}

const AVATAR_PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-yellow-100 text-yellow-800',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-orange-100 text-orange-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
]

function avatarClassFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length] ?? AVATAR_PALETTE[0]!
}

function getInitial(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  return trimmed.charAt(0).toUpperCase()
}

function SupplierCardList({ items, onEdit, onDelete }: SupplierCardListProps) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((s) => (
        <div
          key={s.id}
          className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
        >
          <button
            type="button"
            onClick={() => onEdit(s)}
            className="flex flex-1 items-start gap-3 text-left"
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarClassFor(s.name)}`}
              aria-hidden
            >
              {getInitial(s.name)}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-medium text-foreground">{s.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{s.phone ?? '—'}</p>
              <div className="flex items-center gap-2">
                <DebtBadge currentDebt={s.currentDebt} />
                <span className="text-xs text-muted-foreground">{s.purchaseCount} phiếu</span>
              </div>
            </div>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={`Thao tác cho ${s.name}`}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(s)}>
                <Pencil className="mr-2 h-4 w-4" />
                Sửa
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(s)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Xoá
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  )
}

interface DeleteSupplierDialogProps {
  target: SupplierListItem | null
  onClose: () => void
}

function DeleteSupplierDialog({ target, onClose }: DeleteSupplierDialogProps) {
  const mutation = useDeleteSupplierMutation()

  const onConfirm = async () => {
    if (!target) return
    try {
      await mutation.mutateAsync(target.id)
      showSuccess('Đã xoá nhà cung cấp')
      onClose()
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError(err.message)
      } else {
        showError('Không xoá được nhà cung cấp')
      }
    }
  }

  return (
    <AlertDialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá NCC {target?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            NCC sẽ được chuyển vào thùng rác. Có thể khôi phục từ mục NCC đã xoá. Không xoá được NCC
            còn công nợ hoặc đã có phiếu nhập.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Huỷ</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={mutation.isPending}>
            {mutation.isPending ? 'Đang xoá...' : 'Xoá'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface TrashedSuppliersSheetProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

function TrashedSuppliersSheet({ open, onOpenChange }: TrashedSuppliersSheetProps) {
  const [page, setPage] = useState(1)
  const trashedQuery = useTrashedSuppliersQuery(page, 50)
  const restoreMutation = useRestoreSupplierMutation()

  const items = trashedQuery.data?.data ?? []
  const meta = trashedQuery.data?.meta

  const onRestore = async (id: string) => {
    try {
      await restoreMutation.mutateAsync(id)
      showSuccess('Đã khôi phục nhà cung cấp')
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError(err.message)
      } else {
        showError('Không khôi phục được')
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nhà cung cấp đã xoá</SheetTitle>
          <SheetDescription>
            Khôi phục NCC để dùng lại. Nếu trùng tên hoặc SĐT với NCC khác, hãy đổi trước khi khôi
            phục.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-2 mt-4">
          {trashedQuery.isLoading && <p className="text-sm text-muted-foreground">Đang tải...</p>}
          {!trashedQuery.isLoading && items.length === 0 && (
            <p className="text-sm text-muted-foreground">Thùng rác trống.</p>
          )}
          {items.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{s.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{s.phone ?? '—'}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRestore(s.id)}
                disabled={restoreMutation.isPending}
              >
                <RotateCcw className="size-4 mr-1" /> Khôi phục
              </Button>
            </div>
          ))}
          {meta && meta.totalPages > 1 && (
            <Pagination
              page={meta.page}
              pageSize={meta.pageSize}
              total={meta.total}
              totalPages={meta.totalPages}
              onPageChange={setPage}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
