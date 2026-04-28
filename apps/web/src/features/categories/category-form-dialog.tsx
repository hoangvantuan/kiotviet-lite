import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  type CategoryItem,
  type CreateCategoryInput,
  createCategorySchema,
  type UpdateCategoryInput,
  updateCategorySchema,
} from '@kiotviet-lite/shared'

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
import { ApiClientError } from '@/lib/api-client'
import { showError, showSuccess } from '@/lib/toast'

import { useCreateCategoryMutation, useUpdateCategoryMutation } from './use-categories'

const ROOT_OPTION_VALUE = '__ROOT__'

type Mode = 'create' | 'edit'

interface CategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: Mode
  category?: CategoryItem
  parentOptions: CategoryItem[]
  categoryHasChildren?: boolean
  defaultParentId?: string | null
}

export function CategoryFormDialog(props: CategoryFormDialogProps) {
  if (props.mode === 'create') {
    return <CreateCategoryDialog {...props} />
  }
  if (!props.category) return null
  return <EditCategoryDialog {...props} category={props.category} />
}

function CreateCategoryDialog({
  open,
  onOpenChange,
  parentOptions,
  defaultParentId,
}: CategoryFormDialogProps) {
  const mutation = useCreateCategoryMutation()
  const form = useForm<CreateCategoryInput>({
    resolver: zodResolver(createCategorySchema),
    mode: 'onTouched',
    defaultValues: { name: '', parentId: defaultParentId ?? null },
  })

  useEffect(() => {
    if (open) {
      form.reset({ name: '', parentId: defaultParentId ?? null })
    }
  }, [open, defaultParentId, form])

  const submit = form.handleSubmit(async (values) => {
    const payload: CreateCategoryInput = {
      name: values.name,
      parentId: values.parentId ?? null,
    }
    try {
      await mutation.mutateAsync(payload)
      showSuccess('Đã tạo danh mục')
      onOpenChange(false)
    } catch (err) {
      handleApiError(err, asFormSetError(form), ['name', 'parentId'])
    }
  })

  const parentValue = form.watch('parentId') ?? null
  const selectValue = parentValue === null ? ROOT_OPTION_VALUE : parentValue

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm danh mục</DialogTitle>
          <DialogDescription>Tạo danh mục mới để phân loại sản phẩm.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="cat-name">Tên danh mục</Label>
            <Input
              id="cat-name"
              autoFocus
              maxLength={100}
              placeholder="VD: Đồ uống"
              {...form.register('name')}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-parent">Danh mục cha</Label>
            <Select
              value={selectValue}
              onValueChange={(v) =>
                form.setValue('parentId', v === ROOT_OPTION_VALUE ? null : v, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="cat-parent">
                <SelectValue placeholder="Chọn danh mục cha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROOT_OPTION_VALUE}>— Danh mục cấp 1 —</SelectItem>
                {parentOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.parentId && (
              <p className="text-sm text-destructive">{form.formState.errors.parentId.message}</p>
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
            <Button type="submit" disabled={!form.formState.isValid || mutation.isPending}>
              {mutation.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditCategoryDialog({
  open,
  onOpenChange,
  category,
  parentOptions,
  categoryHasChildren,
}: CategoryFormDialogProps & { category: CategoryItem }) {
  const mutation = useUpdateCategoryMutation()
  const form = useForm<UpdateCategoryInput>({
    resolver: zodResolver(updateCategorySchema),
    mode: 'onTouched',
    defaultValues: { name: category.name, parentId: category.parentId },
  })

  useEffect(() => {
    if (open) {
      form.reset({ name: category.name, parentId: category.parentId })
    }
  }, [open, category, form])

  const isRootWithChildren = category.parentId === null && categoryHasChildren === true

  const submit = form.handleSubmit(async (values) => {
    const payload: UpdateCategoryInput = {}
    if (values.name !== undefined && values.name !== category.name) payload.name = values.name
    const newParentId = values.parentId ?? null
    if (newParentId !== category.parentId) payload.parentId = newParentId
    if (Object.keys(payload).length === 0) {
      onOpenChange(false)
      return
    }
    try {
      await mutation.mutateAsync({ id: category.id, input: payload })
      showSuccess('Đã cập nhật danh mục')
      onOpenChange(false)
    } catch (err) {
      handleApiError(err, asFormSetError(form), ['name', 'parentId'])
    }
  })

  const parentValue = form.watch('parentId') ?? null
  const selectValue = parentValue === null ? ROOT_OPTION_VALUE : parentValue
  const filteredParents = parentOptions.filter((p) => p.id !== category.id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa danh mục</DialogTitle>
          <DialogDescription>Cập nhật tên hoặc thay đổi danh mục cha.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="edit-cat-name">Tên danh mục</Label>
            <Input id="edit-cat-name" autoFocus maxLength={100} {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-cat-parent">Danh mục cha</Label>
            <Select
              value={selectValue}
              disabled={isRootWithChildren}
              onValueChange={(v) =>
                form.setValue('parentId', v === ROOT_OPTION_VALUE ? null : v, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="edit-cat-parent">
                <SelectValue placeholder="Chọn danh mục cha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROOT_OPTION_VALUE}>— Danh mục cấp 1 —</SelectItem>
                {filteredParents.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isRootWithChildren && (
              <p className="text-xs text-muted-foreground">
                Danh mục có danh mục con không thể chuyển thành cấp 2
              </p>
            )}
            {form.formState.errors.parentId && (
              <p className="text-sm text-destructive">{form.formState.errors.parentId.message}</p>
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
            <Button type="submit" disabled={!form.formState.isValid || mutation.isPending}>
              {mutation.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
