import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { toast } from 'sonner'

import {
  DEV_SEED_ACCOUNTS,
  DEV_SEED_PASSWORD,
  type LoginInput,
  loginSchema,
} from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { handleApiError } from '@/lib/api-error'

import { useLogin } from './use-login'

export function LoginForm() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { redirect?: string }
  const login = useLogin()

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: { phone: '', password: '' },
  })

  const passwordValue = form.watch('password')
  const hasPasswordSpaces =
    passwordValue !== undefined &&
    passwordValue.length > 0 &&
    (passwordValue.startsWith(' ') || passwordValue.endsWith(' '))

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values)
      toast.success('Đăng nhập thành công')
      const redirect = search.redirect
      const safePath =
        redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
      navigate({ to: safePath, replace: true })
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
        {hasPasswordSpaces && !form.formState.errors.password && (
          <p className="text-sm text-yellow-600">Mật khẩu có chứa khoảng trắng ở đầu hoặc cuối</p>
        )}
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={!form.formState.isValid || login.isPending}
      >
        {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </Button>
      {import.meta.env.DEV && (
        <div className="space-y-2 rounded-md border border-dashed bg-muted/40 p-3">
          <p className="text-sm font-medium">Tài khoản mẫu sau khi chạy seed</p>
          <p className="text-xs text-muted-foreground">
            Bấm Điền nhanh để dùng tài khoản mẫu, rồi đăng nhập.
          </p>
          <div className="space-y-1">
            {DEV_SEED_ACCOUNTS.map((account) => (
              <div
                key={account.phone}
                className="flex items-center justify-between gap-2 rounded px-2 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{account.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {account.role} · {account.phone}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Điền nhanh tài khoản ${account.name}`}
                  onClick={() => {
                    form.setValue('phone', account.phone, { shouldValidate: true })
                    form.setValue('password', DEV_SEED_PASSWORD, { shouldValidate: true })
                  }}
                >
                  Điền nhanh
                </Button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Mật khẩu chung: {DEV_SEED_PASSWORD}</p>
        </div>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Chưa có cửa hàng?{' '}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Đăng ký ngay
        </Link>
      </p>
    </form>
  )
}
