import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Search, Tags } from 'lucide-react'

import { type BrandItem, createBrandSchema, type ListBrandsQuery } from '@kiotviet-lite/shared'

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ApiClientError } from '@/lib/api-client'
import { asFormSetError, handleApiError } from '@/lib/api-error'
import { showError, showSuccess } from '@/lib/toast'

import { useBrandMutation, useBrandsQuery } from './use-brands'

const PAGE_SIZE = 20

type BrandFormValues = { name: string }

export function BrandsManager() {
  const [query, setQuery] = useState<ListBrandsQuery>({
    page: 1,
    pageSize: PAGE_SIZE,
    status: 'active',
  })
  const [formTarget, setFormTarget] = useState<BrandItem | 'create' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BrandItem | null>(null)
  const list = useBrandsQuery(query)
  const { remove, restore } = useBrandMutation()

  useEffect(() => {
    if (list.data && query.page > Math.max(1, list.data.meta.totalPages)) {
      setQuery((current) => ({ ...current, page: Math.max(1, list.data.meta.totalPages) }))
    }
  }, [list.data, query.page])

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await remove.mutateAsync(deleteTarget.id)
      showSuccess('Đã xoá thương hiệu')
      setDeleteTarget(null)
    } catch (error) {
      showError(error instanceof ApiClientError ? error.message : 'Không xoá được thương hiệu')
    }
  }

  async function confirmRestore(brand: BrandItem) {
    try {
      await restore.mutateAsync(brand.id)
      showSuccess('Đã khôi phục thương hiệu')
    } catch (error) {
      showError(
        error instanceof ApiClientError ? error.message : 'Không khôi phục được thương hiệu',
      )
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Thương hiệu</h1>
          <p className="text-sm text-muted-foreground">Quản lý thương hiệu của cửa hàng.</p>
        </div>
        <Button className="self-start" onClick={() => setFormTarget('create')}>
          <Plus className="h-4 w-4" /> Thêm thương hiệu
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Tìm thương hiệu"
            placeholder="Tìm theo tên thương hiệu"
            value={query.search ?? ''}
            onChange={(event) =>
              setQuery((current) => ({ ...current, search: event.target.value, page: 1 }))
            }
            className="pl-9"
          />
        </div>
        <div className="flex gap-2" role="group" aria-label="Trạng thái thương hiệu">
          <Button
            variant={query.status === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setQuery((current) => ({ ...current, status: 'active', page: 1 }))}
          >
            Đang dùng
          </Button>
          <Button
            variant={query.status === 'trashed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setQuery((current) => ({ ...current, status: 'trashed', page: 1 }))}
          >
            Đã xoá
          </Button>
        </div>
      </div>

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải thương hiệu…</p>
      ) : list.isError ? (
        <p className="text-sm text-destructive">Không tải được thương hiệu. Vui lòng thử lại.</p>
      ) : list.data?.data.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-12 text-center">
          <Tags aria-hidden="true" className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {query.search
              ? 'Không tìm thấy thương hiệu phù hợp.'
              : query.status === 'trashed'
                ? 'Chưa có thương hiệu đã xoá.'
                : 'Chưa có thương hiệu nào. Hãy thêm thương hiệu đầu tiên.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên thương hiệu</TableHead>
                <TableHead className="hidden sm:table-cell">Ngày tạo</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.data.map((brand) => (
                <TableRow key={brand.id}>
                  <TableCell className="font-medium">{brand.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {new Date(brand.createdAt).toLocaleDateString('vi-VN')}
                  </TableCell>
                  <TableCell className="text-right">
                    {query.status === 'trashed' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={restore.isPending}
                        onClick={() => void confirmRestore(brand)}
                      >
                        Khôi phục
                      </Button>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setFormTarget(brand)}>
                          Sửa
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDeleteTarget(brand)}>
                          Xoá
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {list.data && (
            <div className="px-4 pb-3">
              <Pagination
                page={query.page}
                pageSize={query.pageSize}
                total={list.data.meta.total}
                totalPages={list.data.meta.totalPages}
                unitLabel="thương hiệu"
                onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
              />
            </div>
          )}
        </div>
      )}

      <BrandFormDialog target={formTarget} onClose={() => setFormTarget(null)} />
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá thương hiệu?</AlertDialogTitle>
            <AlertDialogDescription>
              Thương hiệu “{deleteTarget?.name}” sẽ chuyển vào danh sách đã xoá và có thể khôi phục.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault()
                void confirmDelete()
              }}
            >
              Xoá thương hiệu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function BrandFormDialog({
  target,
  onClose,
}: {
  target: BrandItem | 'create' | null
  onClose: () => void
}) {
  const { create, update } = useBrandMutation()
  const form = useForm<BrandFormValues>({
    resolver: zodResolver(createBrandSchema),
    mode: 'onTouched',
    defaultValues: { name: '' },
  })
  useEffect(() => {
    if (target) form.reset({ name: target === 'create' ? '' : target.name })
  }, [target, form])

  const isCreating = target === 'create'
  const pending = create.isPending || update.isPending
  const submit = form.handleSubmit(async ({ name }) => {
    try {
      if (target === 'create') await create.mutateAsync(name)
      else if (target) await update.mutateAsync({ id: target.id, name })
      showSuccess(isCreating ? 'Đã thêm thương hiệu' : 'Đã sửa thương hiệu')
      onClose()
    } catch (error) {
      handleApiError(error, asFormSetError(form), ['name'])
    }
  })

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isCreating ? 'Thêm thương hiệu' : 'Sửa thương hiệu'}</DialogTitle>
          <DialogDescription>Nhập tên thương hiệu trong cửa hàng.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="brand-name">Tên thương hiệu</Label>
            <Input
              id="brand-name"
              autoFocus
              maxLength={100}
              placeholder="VD: Nike"
              {...form.register('name')}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Hủy
            </Button>
            <Button type="submit" disabled={pending}>
              Lưu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
