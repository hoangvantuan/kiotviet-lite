import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  type CreateUserInput,
  createUserSchema,
  type UpdateUserInput,
  updateUserSchema,
  type UserListItem,
  type UserRole,
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

import { useCreateUserMutation, useUpdateUserMutation } from './use-users'

type Mode = 'create' | 'edit'

interface StaffFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: Mode
  user?: UserListItem
}

type EditFormValues = UpdateUserInput

export function StaffFormDialog({ open, onOpenChange, mode, user }: StaffFormDialogProps) {
  const createMutation = useCreateUserMutation()
  const updateMutation = useUpdateUserMutation()
  const isPending = createMutation.isPending || updateMutation.isPending

  if (mode === 'create') {
    return (
      <CreateStaffDialog
        open={open}
        onOpenChange={onOpenChange}
        isPending={isPending}
        onSubmit={async (input) => {
          try {
            await createMutation.mutateAsync(input)
            showSuccess('Đã thêm nhân viên')
            onOpenChange(false)
            return null
          } catch (err) {
            return err
          }
        }}
      />
    )
  }

  if (!user) return null

  return (
    <EditStaffDialog
      key={user.id}
      open={open}
      onOpenChange={onOpenChange}
      user={user}
      isPending={isPending}
      onSubmit={async (input) => {
        try {
          await updateMutation.mutateAsync({ id: user.id, input })
          showSuccess('Đã cập nhật nhân viên')
          onOpenChange(false)
          return null
        } catch (err) {
          return err
        }
      }}
    />
  )
}

function CreateStaffDialog({
  open,
  onOpenChange,
  isPending,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  isPending: boolean
  onSubmit: (input: CreateUserInput) => Promise<unknown>
}) {
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    mode: 'onTouched',
    defaultValues: { name: '', phone: '', role: 'staff', pin: '' },
  })

  useEffect(() => {
    if (!open) form.reset({ name: '', phone: '', role: 'staff', pin: '' })
  }, [open, form])

  const submit = form.handleSubmit(async (values) => {
    const err = await onSubmit(values)
    if (err) handleApiError(err, asFormSetError(form), ['name', 'phone', 'role', 'pin'])
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm nhân viên</DialogTitle>
          <DialogDescription>Tạo tài khoản nhân viên cho cửa hàng.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="name">Tên nhân viên</Label>
            <Input id="name" placeholder="Nguyễn Văn A" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Số điện thoại</Label>
            <Input
              id="phone"
              inputMode="tel"
              placeholder="0901234567"
              {...form.register('phone')}
            />
            {form.formState.errors.phone && (
              <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Vai trò</Label>
            <Select
              value={form.watch('role')}
              onValueChange={(v) => form.setValue('role', v as UserRole, { shouldValidate: true })}
            >
              <SelectTrigger id="role">
                <SelectValue placeholder="Chọn vai trò" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Chủ cửa hàng</SelectItem>
                <SelectItem value="manager">Quản lý</SelectItem>
                <SelectItem value="staff">Nhân viên</SelectItem>
              </SelectContent>
            </Select>
            {form.formState.errors.role && (
              <p className="text-sm text-destructive">{form.formState.errors.role.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pin">Mã PIN (6 chữ số)</Label>
            <Input
              id="pin"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              autoComplete="off"
              {...form.register('pin')}
            />
            {form.formState.errors.pin && (
              <p className="text-sm text-destructive">{form.formState.errors.pin.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={!form.formState.isValid || isPending}>
              {isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditStaffDialog({
  open,
  onOpenChange,
  user,
  isPending,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  user: UserListItem
  isPending: boolean
  onSubmit: (input: UpdateUserInput) => Promise<unknown>
}) {
  const form = useForm<EditFormValues>({
    resolver: zodResolver(updateUserSchema),
    mode: 'onTouched',
    defaultValues: { name: user.name, role: user.role, pin: '' },
  })

  useEffect(() => {
    if (open) form.reset({ name: user.name, role: user.role, pin: '' })
  }, [open, user, form])

  const submit = form.handleSubmit(async (values) => {
    const payload: UpdateUserInput = {}
    if (values.name !== undefined) payload.name = values.name
    if (values.role !== undefined) payload.role = values.role
    if (values.pin && values.pin.trim().length > 0) {
      payload.pin = values.pin
    }
    const err = await onSubmit(payload)
    if (err) handleApiError(err, asFormSetError(form), ['name', 'role', 'pin'])
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa nhân viên</DialogTitle>
          <DialogDescription>Cập nhật thông tin và quyền của nhân viên.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="edit-name">Tên nhân viên</Label>
            <Input id="edit-name" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-phone">Số điện thoại</Label>
            <Input id="edit-phone" value={user.phone ?? ''} disabled readOnly />
            <p className="text-xs text-muted-foreground">Không thể chỉnh sửa số điện thoại.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-role">Vai trò</Label>
            <Select
              value={form.watch('role')}
              onValueChange={(v) => form.setValue('role', v as UserRole, { shouldValidate: true })}
            >
              <SelectTrigger id="edit-role">
                <SelectValue placeholder="Chọn vai trò" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Chủ cửa hàng</SelectItem>
                <SelectItem value="manager">Quản lý</SelectItem>
                <SelectItem value="staff">Nhân viên</SelectItem>
              </SelectContent>
            </Select>
            {form.formState.errors.role && (
              <p className="text-sm text-destructive">{form.formState.errors.role.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-pin">Đặt PIN mới (để trống nếu không đổi)</Label>
            <Input
              id="edit-pin"
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              {...form.register('pin')}
            />
            {form.formState.errors.pin && (
              <p className="text-sm text-destructive">{form.formState.errors.pin.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Đang lưu…' : 'Lưu'}
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
      if (detail?.field === 'phone' && knownFields.includes('phone')) {
        form.setError('phone', { message: err.message })
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
