import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { toast } from 'sonner'

import { type LoginInput, loginSchema } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiClientError } from '@/lib/api-client'

import { useLogin } from './use-login'

export function LoginForm() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { redirect?: string }
  const login = useLogin()

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    defaultValues: { phone: '', password: '' },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values)
      toast.success('Đăng nhập thành công')
      navigate({ to: search.redirect ?? '/', replace: true })
    } catch (err) {
      handleApiError(err, form)
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
          autoComplete="current-password"
          {...form.register('password')}
        />
        {form.formState.errors.password ? (
          <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" disabled={!form.formState.isValid || login.isPending}>
        {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Chưa có cửa hàng?{' '}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Đăng ký ngay
        </Link>
      </p>
    </form>
  )
}

function handleApiError(err: unknown, form: ReturnType<typeof useForm<LoginInput>>) {
  if (err instanceof ApiClientError) {
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
      for (const issue of err.details as Array<{ path: string; message: string }>) {
        if (issue.path === 'phone' || issue.path === 'password') {
          form.setError(issue.path, { message: issue.message })
        }
      }
    }
    toast.error(err.message)
    return
  }
  toast.error('Đã xảy ra lỗi không xác định')
}
