import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'

import {
  type CreateCustomerGroupInput,
  createCustomerGroupSchema,
  type CustomerGroupItem,
  type UpdateCustomerGroupInput,
  updateCustomerGroupSchema,
} from '@kiotviet-lite/shared'

import { EmptyState } from '@/components/shared/empty-state'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ApiClientError } from '@/lib/api-client'
import { showError, showSuccess } from '@/lib/toast'

import { useDirectPriceListsQuery } from '../../pricing/use-price-lists'
import {
  useCreateCustomerGroupMutation,
  useCustomerGroupsQuery,
  useDeleteCustomerGroupMutation,
  useUpdateCustomerGroupMutation,
} from '../use-customers'

const NO_PRICE_LIST = '__NONE__'

const VND_FORMATTER = new Intl.NumberFormat('vi-VN')

function formatDebtLimit(value: number | null): string {
  if (value === null) return 'Không giới hạn'
  return `${VND_FORMATTER.format(value)} ₫`
}

export function CustomerGroupManager() {
  const groupsQuery = useCustomerGroupsQuery()
  const directPriceLists = useDirectPriceListsQuery({ enabled: true })
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CustomerGroupItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CustomerGroupItem | null>(null)

  const groups = groupsQuery.data ?? []
  const priceListItems = directPriceLists.data?.data ?? []
  const priceListMap = new Map(priceListItems.map((p) => [p.id, p.name]))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Nhóm khách hàng</h2>
          <p className="text-sm text-muted-foreground">
            Phân nhóm khách hàng để áp dụng bảng giá và hạn mức nợ riêng.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          <span>Thêm nhóm</span>
        </Button>
      </div>

      {groupsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải danh sách…</p>
      ) : groupsQuery.isError ? (
        <p className="text-sm text-destructive">Không tải được danh sách nhóm.</p>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Chưa có nhóm khách hàng"
          description="Tạo nhóm đầu tiên để phân loại khách hàng."
          actionLabel="Thêm nhóm"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên nhóm</TableHead>
                <TableHead>Mô tả</TableHead>
                <TableHead>Bảng giá</TableHead>
                <TableHead>Hạn mức nợ</TableHead>
                <TableHead className="text-right">Số khách hàng</TableHead>
                <TableHead className="w-32 text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {group.description ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {group.defaultPriceListId
                      ? (priceListMap.get(group.defaultPriceListId) ?? '—')
                      : '—'}
                  </TableCell>
                  <TableCell>{formatDebtLimit(group.debtLimit)}</TableCell>
                  <TableCell className="text-right">{group.customerCount}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditTarget(group)}
                        aria-label={`Sửa nhóm ${group.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteTarget(group)}
                        aria-label={`Xoá nhóm ${group.name}`}
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

      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditGroupDialog
        open={editTarget !== null}
        onOpenChange={(v) => {
          if (!v) setEditTarget(null)
        }}
        group={editTarget}
      />
      <DeleteGroupDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null)
        }}
        group={deleteTarget}
      />
    </div>
  )
}

interface CreateGroupDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

function CreateGroupDialog({ open, onOpenChange }: CreateGroupDialogProps) {
  const mutation = useCreateCustomerGroupMutation()
  const directPriceLists = useDirectPriceListsQuery({ enabled: open })
  const priceLists = directPriceLists.data?.data ?? []
  const form = useForm<CreateCustomerGroupInput>({
    resolver: zodResolver(createCustomerGroupSchema),
    mode: 'onTouched',
    defaultValues: { name: '', description: null, defaultPriceListId: null, debtLimit: null },
  })
  const [debtLimitText, setDebtLimitText] = useState('')

  useEffect(() => {
    if (open) {
      form.reset({ name: '', description: null, defaultPriceListId: null, debtLimit: null })
      setDebtLimitText('')
    }
  }, [open, form])

  const submit = form.handleSubmit(async (values) => {
    const payload: CreateCustomerGroupInput = {
      name: values.name,
      description: values.description?.trim() || null,
      defaultPriceListId: values.defaultPriceListId ?? null,
      debtLimit: values.debtLimit ?? null,
    }
    try {
      await mutation.mutateAsync(payload)
      showSuccess('Đã tạo nhóm khách hàng')
      onOpenChange(false)
    } catch (err) {
      handleApiError(err, asFormSetError(form), ['name'])
    }
  })

  const priceListValue = form.watch('defaultPriceListId') ?? null

  const handleDebtLimitChange = (text: string) => {
    setDebtLimitText(text)
    if (text.trim() === '') {
      form.setValue('debtLimit', null, { shouldValidate: true })
      return
    }
    const num = Number(text.replace(/[^0-9]/g, ''))
    form.setValue('debtLimit', Number.isFinite(num) ? num : null, { shouldValidate: true })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm nhóm khách hàng</DialogTitle>
          <DialogDescription>Tạo nhóm mới để phân loại khách hàng.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="group-name">Tên nhóm</Label>
            <Input
              id="group-name"
              autoFocus
              maxLength={100}
              placeholder="VD: VIP"
              {...form.register('name')}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-description">Mô tả</Label>
            <Input
              id="group-description"
              maxLength={255}
              placeholder="Mô tả nhóm (tuỳ chọn)"
              {...form.register('description', {
                setValueAs: (v) => (v === '' ? null : v),
              })}
            />
          </div>
          <div className="space-y-2">
            <Label>Bảng giá mặc định</Label>
            <Select
              value={priceListValue ?? NO_PRICE_LIST}
              onValueChange={(v) =>
                form.setValue('defaultPriceListId', v === NO_PRICE_LIST ? null : v, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Không áp dụng bảng giá riêng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PRICE_LIST}>Không áp dụng</SelectItem>
                {priceLists.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Khi chọn, mọi khách hàng trong nhóm sẽ áp dụng bảng giá này.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-debt-limit">Hạn mức nợ (VND)</Label>
            <Input
              id="group-debt-limit"
              inputMode="numeric"
              placeholder="Để trống = không giới hạn"
              value={debtLimitText}
              onChange={(e) => handleDebtLimitChange(e.target.value)}
            />
            {form.formState.errors.debtLimit && (
              <p className="text-sm text-destructive">{form.formState.errors.debtLimit.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface EditGroupDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  group: CustomerGroupItem | null
}

function EditGroupDialog({ open, onOpenChange, group }: EditGroupDialogProps) {
  const mutation = useUpdateCustomerGroupMutation()
  const directPriceLists = useDirectPriceListsQuery({ enabled: open })
  const priceLists = directPriceLists.data?.data ?? []
  const form = useForm<UpdateCustomerGroupInput>({
    resolver: zodResolver(updateCustomerGroupSchema),
    mode: 'onTouched',
  })
  const [debtLimitText, setDebtLimitText] = useState('')

  useEffect(() => {
    if (open && group) {
      form.reset({
        name: group.name,
        description: group.description,
        defaultPriceListId: group.defaultPriceListId,
        debtLimit: group.debtLimit,
      })
      setDebtLimitText(group.debtLimit === null ? '' : String(group.debtLimit))
    }
  }, [open, group, form])

  if (!group) return null

  const submit = form.handleSubmit(async (values) => {
    const payload: UpdateCustomerGroupInput = {}
    if (values.name !== undefined && values.name !== group.name) payload.name = values.name
    const desc = values.description?.trim() || null
    if (desc !== group.description) payload.description = desc
    if (
      values.defaultPriceListId !== undefined &&
      values.defaultPriceListId !== group.defaultPriceListId
    ) {
      payload.defaultPriceListId = values.defaultPriceListId
    }
    if (values.debtLimit !== undefined && values.debtLimit !== group.debtLimit) {
      payload.debtLimit = values.debtLimit
    }
    if (Object.keys(payload).length === 0) {
      onOpenChange(false)
      return
    }
    try {
      await mutation.mutateAsync({ id: group.id, input: payload })
      showSuccess('Đã cập nhật nhóm')
      onOpenChange(false)
    } catch (err) {
      handleApiError(err, asFormSetError(form), ['name'])
    }
  })

  const priceListValue = form.watch('defaultPriceListId') ?? null

  const handleDebtLimitChange = (text: string) => {
    setDebtLimitText(text)
    if (text.trim() === '') {
      form.setValue('debtLimit', null, { shouldValidate: true })
      return
    }
    const num = Number(text.replace(/[^0-9]/g, ''))
    form.setValue('debtLimit', Number.isFinite(num) ? num : null, { shouldValidate: true })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa nhóm khách hàng</DialogTitle>
          <DialogDescription>Cập nhật tên hoặc hạn mức nợ của nhóm.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="edit-group-name">Tên nhóm</Label>
            <Input id="edit-group-name" autoFocus maxLength={100} {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-group-description">Mô tả</Label>
            <Input
              id="edit-group-description"
              maxLength={255}
              placeholder="Mô tả nhóm (tuỳ chọn)"
              {...form.register('description', {
                setValueAs: (v) => (v === '' ? null : v),
              })}
            />
          </div>
          <div className="space-y-2">
            <Label>Bảng giá mặc định</Label>
            <Select
              value={priceListValue ?? NO_PRICE_LIST}
              onValueChange={(v) =>
                form.setValue('defaultPriceListId', v === NO_PRICE_LIST ? null : v, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Không áp dụng bảng giá riêng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PRICE_LIST}>Không áp dụng</SelectItem>
                {priceLists.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-group-debt-limit">Hạn mức nợ (VND)</Label>
            <Input
              id="edit-group-debt-limit"
              inputMode="numeric"
              placeholder="Để trống = không giới hạn"
              value={debtLimitText}
              onChange={(e) => handleDebtLimitChange(e.target.value)}
            />
            {form.formState.errors.debtLimit && (
              <p className="text-sm text-destructive">{form.formState.errors.debtLimit.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface DeleteGroupDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  group: CustomerGroupItem | null
}

function DeleteGroupDialog({ open, onOpenChange, group }: DeleteGroupDialogProps) {
  const mutation = useDeleteCustomerGroupMutation()
  if (!group) return null

  const onConfirm = async () => {
    try {
      await mutation.mutateAsync(group.id)
      showSuccess('Đã xoá nhóm')
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
          <AlertDialogTitle>Xoá nhóm {group.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Nhóm sẽ bị xoá vĩnh viễn. Không thể xoá nếu đang có khách hàng.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Hủy</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mutation.isPending ? 'Đang xoá…' : 'Xoá'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface FormSetError {
  setError: (name: string, error: { message: string }) => void
}

function asFormSetError(form: { setError: (...args: never[]) => void }): FormSetError {
  return {
    setError: (name, error) => {
      ;(form.setError as unknown as (n: string, e: { message: string }) => void)(name, error)
    },
  }
}

function handleApiError(err: unknown, form: FormSetError, knownFields: string[]) {
  if (err instanceof ApiClientError) {
    if (err.code === 'CONFLICT') {
      const detail = err.details as { field?: string } | undefined
      if (detail?.field === 'name' && knownFields.includes('name')) {
        form.setError('name', { message: err.message })
        showError(err.message)
        return
      }
    }
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
      for (const issue of err.details as Array<{ path: string; message: string }>) {
        if (knownFields.includes(issue.path)) {
          form.setError(issue.path, { message: issue.message })
        }
      }
    }
    showError(err.message)
    return
  }
  showError('Đã xảy ra lỗi không xác định')
}
