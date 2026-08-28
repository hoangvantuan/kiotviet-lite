import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'

import { type RegisterInput, registerSchema } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { handleApiError } from '@/lib/api-error'

import { useRegister } from './use-register'

export function RegisterForm() {
  const navigate = useNavigate()
  const register = useRegister()

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    mode: 'onTouched',
    defaultValues: { storeName: '', ownerName: '', phone: '', password: '' },
  })

  const passwordValue = form.watch('password')
  const hasPasswordSpaces =
    passwordValue !== undefined &&
    passwordValue.length > 0 &&
    (passwordValue.startsWith(' ') || passwordValue.endsWith(' '))

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await register.mutateAsync(values)
      toast.success('Tạo cửa hàng thành công')
      navigate({ to: '/', replace: true })
    } catch (err) {
      handleApiError(err, form)
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="storeName">Tên cửa hàng</Label>
        <Input id="storeName" placeholder="Cửa hàng tạp hoá A" {...form.register('storeName')} />
        {form.formState.errors.storeName ? (
          <p className="text-sm text-destructive">{form.formState.errors.storeName.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ownerName">Tên chủ cửa hàng</Label>
        <Input id="ownerName" placeholder="Nguyễn Văn A" {...form.register('ownerName')} />
        {form.formState.errors.ownerName ? (
          <p className="text-sm text-destructive">{form.formState.errors.ownerName.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Số điện thoại</Label>
        <Input
          id="phone"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0901234567"
          {...form.register('phone')}
        />
        {form.formState.errors.phone ? (
          <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Mật khẩu</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="Tối thiểu 8 ký tự"
          {...form.register('password')}
        />
        {form.formState.errors.password ? (
          <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
        ) : null}
        {hasPasswordSpaces && !form.formState.errors.password && (
          <p className="text-sm text-yellow-600">Mật khẩu có chứa khoảng trắng ở đầu hoặc cuối</p>
        )}
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={!form.formState.isValid || register.isPending}
      >
        {register.isPending ? 'Đang tạo cửa hàng…' : 'Tạo cửa hàng'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Đã có cửa hàng?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Đăng nhập
        </Link>
      </p>
    </form>
  )
}
