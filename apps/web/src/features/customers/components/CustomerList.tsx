import { useMemo, useState } from 'react'
import { Archive, Pencil, Plus, RotateCcw, SearchX, Trash2, Users } from 'lucide-react'

import type { CustomerListItem, ListCustomersQuery } from '@kiotviet-lite/shared'

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
import { showError, showSuccess } from '@/lib/toast'

import {
  useCustomerGroupsQuery,
  useCustomerQuery,
  useCustomersQuery,
  useDeleteCustomerMutation,
  useRestoreCustomerMutation,
  useTrashedCustomersQuery,
} from '../use-customers'
import { CustomerFormDialog } from './CustomerForm'

const PAGE_SIZE = 20
const ALL_GROUPS_VALUE = '__ALL__'
const NO_GROUP_VALUE = 'none'
const VND_FORMATTER = new Intl.NumberFormat('vi-VN')

function DebtBadge({
  currentDebt,
  effectiveDebtLimit,
}: {
  currentDebt: number
  effectiveDebtLimit: number | null
}) {
  if (currentDebt === 0) {
    return (
      <Badge variant="secondary" className="text-xs">
        0đ
      </Badge>
    )
  }
  const formatted = `${VND_FORMATTER.format(currentDebt)}đ`
  if (effectiveDebtLimit === null || effectiveDebtLimit === 0) {
    return (
      <Badge variant="outline" className="border-yellow-300 bg-yellow-50 text-yellow-700 text-xs">
        {formatted}
      </Badge>
    )
  }
  const ratio = currentDebt / effectiveDebtLimit
  if (ratio >= 0.8) {
    const pct = Math.round(ratio * 100)
    return (
      <Badge variant="destructive" className="text-xs" title={`Đã sử dụng ${pct}% hạn mức`}>
        {formatted}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-yellow-300 bg-yellow-50 text-yellow-700 text-xs">
      {formatted}
    </Badge>
  )
}

export function CustomerList() {
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<string>(ALL_GROUPS_VALUE)
  const [debtFilter, setDebtFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTargetId, setEditTargetId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CustomerListItem | null>(null)
  const [trashedOpen, setTrashedOpen] = useState(false)

  const debouncedSearch = useDebounced(search, 300)
  const groupsQuery = useCustomerGroupsQuery()
  const groups = groupsQuery.data ?? []

  const apiQuery: Partial<ListCustomersQuery> = useMemo(() => {
    const q: Partial<ListCustomersQuery> = { page, pageSize: PAGE_SIZE }
    const trimmed = debouncedSearch.trim()
    if (trimmed.length > 0) q.search = trimmed
    if (groupFilter !== ALL_GROUPS_VALUE) {
      q.groupId = groupFilter === NO_GROUP_VALUE ? 'none' : groupFilter
    }
    if (debtFilter !== 'all') q.hasDebt = debtFilter
    return q
  }, [page, debouncedSearch, groupFilter, debtFilter])

  const customersQuery = useCustomersQuery(apiQuery)
  const editCustomerQuery = useCustomerQuery(editTargetId ?? undefined)

  const items = customersQuery.data?.data ?? []
  const meta = customersQuery.data?.meta
  const isFiltered =
    debouncedSearch.trim().length > 0 || groupFilter !== ALL_GROUPS_VALUE || debtFilter !== 'all'

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Khách hàng</h2>
          <p className="text-sm text-muted-foreground">
            Quản lý danh sách khách hàng và phân nhóm.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setTrashedOpen(true)}>
            <Archive className="h-4 w-4" />
            <span>Đã xoá</span>
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>Thêm khách hàng</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex-1">
          <Input
            placeholder="Tìm theo tên hoặc số điện thoại…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="md:w-48">
          <Select
            value={groupFilter}
            onValueChange={(v) => {
              setGroupFilter(v)
              setPage(1)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tất cả nhóm" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_GROUPS_VALUE}>Tất cả nhóm</SelectItem>
              <SelectItem value={NO_GROUP_VALUE}>Chưa phân nhóm</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:w-44">
          <Select
            value={debtFilter}
            onValueChange={(v) => {
              setDebtFilter(v as 'all' | 'yes' | 'no')
              setPage(1)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="yes">Có công nợ</SelectItem>
              <SelectItem value="no">Không có công nợ</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {customersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải danh sách…</p>
      ) : customersQuery.isError ? (
        <p className="text-sm text-destructive">Không tải được danh sách khách hàng.</p>
      ) : items.length === 0 && !isFiltered ? (
        <EmptyState
          icon={Users}
          title="Chưa có khách hàng nào"
          description="Thêm khách hàng đầu tiên để bắt đầu quản lý."
          actionLabel="Thêm khách hàng"
          onAction={() => setCreateOpen(true)}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Không tìm thấy khách hàng"
          description="Thử bỏ bớt bộ lọc để xem thêm kết quả."
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên</TableHead>
                <TableHead>Số điện thoại</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Nhóm</TableHead>
                <TableHead className="text-right">Số đơn</TableHead>
                <TableHead className="text-right">Tổng mua</TableHead>
                <TableHead className="text-right">Công nợ</TableHead>
                <TableHead className="w-32 text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell className="font-mono text-sm">{customer.phone}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {customer.email ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {customer.groupName ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">{customer.purchaseCount}</TableCell>
                  <TableCell className="text-right">
                    {VND_FORMATTER.format(customer.totalPurchased)} ₫
                  </TableCell>
                  <TableCell className="text-right">
                    <DebtBadge
                      currentDebt={customer.currentDebt}
                      effectiveDebtLimit={customer.effectiveDebtLimit}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditTargetId(customer.id)}
                        aria-label={`Sửa khách hàng ${customer.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteTarget(customer)}
                        aria-label={`Xoá khách hàng ${customer.name}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {meta && meta.total > 0 && (
        <Pagination
          page={meta.page}
          pageSize={meta.pageSize}
          total={meta.total}
          totalPages={meta.totalPages}
          onPageChange={setPage}
          unitLabel="khách hàng"
        />
      )}

      <CustomerFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        groups={groups}
      />
      {editCustomerQuery.data && (
        <CustomerFormDialog
          key={editCustomerQuery.data.id}
          mode="edit"
          open={editTargetId !== null}
          onOpenChange={(v) => {
            if (!v) setEditTargetId(null)
          }}
          customer={editCustomerQuery.data}
          groups={groups}
        />
      )}
      <DeleteCustomerDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null)
        }}
        customer={deleteTarget}
      />
      <TrashedCustomersSheet open={trashedOpen} onOpenChange={setTrashedOpen} />
    </div>
  )
}

interface DeleteCustomerDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  customer: CustomerListItem | null
}

function DeleteCustomerDialog({ open, onOpenChange, customer }: DeleteCustomerDialogProps) {
  const mutation = useDeleteCustomerMutation()
  if (!customer) return null

  const hasDebt = customer.currentDebt > 0

  const onConfirm = async () => {
    try {
      await mutation.mutateAsync(customer.id)
      showSuccess('Đã xoá khách hàng')
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError(err.message)
      } else {
        showError('Đã xảy ra lỗi không xác định')
      }
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá khách hàng {customer.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasDebt
              ? `Khách hàng có công nợ ${VND_FORMATTER.format(customer.currentDebt)}đ, không thể xoá.`
              : 'Khách hàng sẽ bị đánh dấu xoá. Bạn có thể khôi phục trong mục "Đã xoá".'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Hủy</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={mutation.isPending || hasDebt}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mutation.isPending ? 'Đang xoá…' : 'Xoá'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface TrashedCustomersSheetProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

function TrashedCustomersSheet({ open, onOpenChange }: TrashedCustomersSheetProps) {
  const [page, setPage] = useState(1)
  const trashedQuery = useTrashedCustomersQuery(page)
  const restoreMutation = useRestoreCustomerMutation()

  const items = trashedQuery.data?.data ?? []
  const meta = trashedQuery.data?.meta

  const handleRestore = async (id: string) => {
    try {
      await restoreMutation.mutateAsync(id)
      showSuccess('Đã khôi phục khách hàng')
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError(err.message)
      } else {
        showError('Đã xảy ra lỗi không xác định')
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Khách hàng đã xoá</SheetTitle>
          <SheetDescription>
            Danh sách khách hàng đã bị xoá. Nhấn khôi phục để đưa lại vào danh sách.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {trashedQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có khách hàng nào đã xoá.</p>
          ) : (
            items.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-sm text-muted-foreground">{c.phone}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRestore(c.id)}
                  disabled={restoreMutation.isPending}
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Khôi phục
                </Button>
              </div>
            ))
          )}
          {meta && meta.totalPages > 1 && (
            <Pagination
              page={meta.page}
              pageSize={meta.pageSize}
              total={meta.total}
              totalPages={meta.totalPages}
              onPageChange={setPage}
              unitLabel="khách hàng"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
