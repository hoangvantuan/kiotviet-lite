import { useEffect, useState } from 'react'

import {
  type NotificationChannelItem,
  type NotificationSeverity,
  notificationSeverityValues,
  notificationSubscribableTypeValues,
} from '@kiotviet-lite/shared'

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
import { Switch } from '@/components/ui/switch'
import { handleApiError } from '@/lib/api-error'
import { showError, showSuccess } from '@/lib/toast'

import {
  buildCreatePayload,
  buildUpdatePayload,
  type ChannelFormField,
  type ChannelFormValues,
  describeChannelTarget,
  emptyChannelForm,
  formFromChannel,
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_SEVERITY_LABELS,
  NOTIFICATION_TRANSPORT_LABELS,
} from './notification-channel-form'
import {
  useCreateNotificationChannelMutation,
  useDeleteNotificationChannelMutation,
  useNotificationChannelsQuery,
  useTestNotificationChannelMutation,
  useUpdateNotificationChannelMutation,
} from './use-notification-channels'

type DialogState = { mode: 'create' } | { mode: 'edit'; channel: NotificationChannelItem } | null

export function NotificationChannelsManager() {
  const query = useNotificationChannelsQuery()
  const updateMutation = useUpdateNotificationChannelMutation()
  const testMutation = useTestNotificationChannelMutation()
  const [dialog, setDialog] = useState<DialogState>(null)
  const [deleting, setDeleting] = useState<NotificationChannelItem | null>(null)

  async function toggleEnabled(channel: NotificationChannelItem, enabled: boolean) {
    try {
      await updateMutation.mutateAsync({ id: channel.id, input: { enabled } })
    } catch (err) {
      handleApiError(err, { fallbackMessage: 'Không đổi được trạng thái kênh' })
    }
  }

  async function sendTest(channel: NotificationChannelItem) {
    try {
      const result = await testMutation.mutateAsync(channel.id)
      if (result.ok) showSuccess(result.message)
      else showError(result.message)
    } catch (err) {
      handleApiError(err, { fallbackMessage: 'Không gửi thử được' })
    }
  }

  const channels = query.data ?? []

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center md:justify-between md:p-6">
        <div>
          <h3 className="text-sm font-medium text-foreground">Kênh nhận cảnh báo</h3>
          <p className="text-xs text-muted-foreground">
            Nhận cảnh báo tồn kho âm, đơn giá trị lớn, đăng nhập đáng ngờ... qua Telegram hoặc
            webhook https của bạn.
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: 'create' })}>Thêm kênh</Button>
      </div>

      {query.isLoading && <p className="text-sm text-muted-foreground">Đang tải...</p>}
      {query.isError && (
        <p className="text-sm text-destructive">Không tải được danh sách kênh thông báo</p>
      )}
      {!query.isLoading && !query.isError && channels.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Chưa có kênh nào. Thêm một bot Telegram hoặc webhook để nhận cảnh báo ngay khi có sự cố.
        </p>
      )}

      <ul className="space-y-3">
        {channels.map((channel) => (
          <li
            key={channel.id}
            className="space-y-3 rounded-lg border bg-card p-4"
            data-testid="notification-channel"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium text-foreground">{channel.name}</span>
                <Badge variant="secondary">
                  {NOTIFICATION_TRANSPORT_LABELS[channel.transport] ?? channel.transport}
                </Badge>
                {!channel.enabled && <Badge variant="outline">Đang tắt</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={channel.enabled}
                  onCheckedChange={(v) => void toggleEnabled(channel, v)}
                  disabled={updateMutation.isPending}
                  aria-label={channel.enabled ? 'Tắt kênh' : 'Bật kênh'}
                />
              </div>
            </div>
            <p className="break-all text-xs text-muted-foreground">
              {describeChannelTarget(channel)}
            </p>
            <p className="text-xs text-muted-foreground">
              {channel.eventTypes.map((t) => NOTIFICATION_EVENT_LABELS[t]).join(', ')} ·{' '}
              {NOTIFICATION_SEVERITY_LABELS[channel.minSeverity]}
            </p>
            {channel.failedLast7Days > 0 && (
              <p className="text-xs text-destructive">
                {channel.failedLast7Days} lượt gửi thất bại trong 7 ngày qua
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void sendTest(channel)}
                disabled={testMutation.isPending}
              >
                {testMutation.isPending && testMutation.variables === channel.id
                  ? 'Đang gửi...'
                  : 'Gửi thử'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialog({ mode: 'edit', channel })}
              >
                Sửa
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDeleting(channel)}>
                Xoá
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <ChannelFormDialog state={dialog} onClose={() => setDialog(null)} />
      <DeleteChannelDialog channel={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}

function ChannelFormDialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const createMutation = useCreateNotificationChannelMutation()
  const updateMutation = useUpdateNotificationChannelMutation()
  const [values, setValues] = useState<ChannelFormValues>(emptyChannelForm)
  const [errors, setErrors] = useState<Partial<Record<ChannelFormField, string>>>({})
  const editing = state?.mode === 'edit' ? state.channel : null
  const isPending = createMutation.isPending || updateMutation.isPending

  useEffect(() => {
    if (!state) return
    setValues(state.mode === 'edit' ? formFromChannel(state.channel) : emptyChannelForm())
    setErrors({})
  }, [state])

  function set<K extends keyof ChannelFormValues>(key: K, value: ChannelFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function toggleEvent(type: (typeof notificationSubscribableTypeValues)[number], on: boolean) {
    setValues((prev) => ({
      ...prev,
      eventTypes: on ? [...prev.eventTypes, type] : prev.eventTypes.filter((t) => t !== type),
    }))
  }

  async function submit(e: { preventDefault: () => void }) {
    e.preventDefault()
    try {
      if (editing) {
        const built = buildUpdatePayload(values, editing)
        if (!built.ok) return setErrors(built.errors)
        await updateMutation.mutateAsync({ id: editing.id, input: built.payload })
        showSuccess('Đã cập nhật kênh thông báo')
      } else {
        const built = buildCreatePayload(values)
        if (!built.ok) return setErrors(built.errors)
        await createMutation.mutateAsync(built.payload)
        showSuccess('Đã thêm kênh thông báo, bấm "Gửi thử" để kiểm tra')
      }
      onClose()
    } catch (err) {
      handleApiError(err, { fallbackMessage: 'Không lưu được kênh thông báo' })
    }
  }

  const secretHint = editing ? 'Bỏ trống để giữ nguyên giá trị đang lưu' : undefined
  const fieldError = (field: ChannelFormField) =>
    errors[field] ? <p className="text-xs text-destructive">{errors[field]}</p> : null

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Sửa kênh thông báo' : 'Thêm kênh thông báo'}</DialogTitle>
          <DialogDescription>
            Token và khoá bí mật được mã hoá khi lưu và không hiển thị lại.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label>Loại kênh</Label>
            <Select
              value={values.transport}
              onValueChange={(v) => set('transport', v as ChannelFormValues['transport'])}
              disabled={!!editing}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="telegram">Telegram bot</SelectItem>
                <SelectItem value="webhook">Webhook https</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="channel-name">Tên kênh</Label>
            <Input
              id="channel-name"
              placeholder="Nhóm chủ cửa hàng"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
            />
            {fieldError('name')}
          </div>

          {values.transport === 'telegram' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="channel-bot-token">Bot token</Label>
                <Input
                  id="channel-bot-token"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    editing?.config?.botTokenMasked ?? '123456789:AA... (lấy từ @BotFather)'
                  }
                  value={values.botToken}
                  onChange={(e) => set('botToken', e.target.value)}
                />
                {secretHint && <p className="text-xs text-muted-foreground">{secretHint}</p>}
                {fieldError('botToken')}
              </div>
              <div className="space-y-2">
                <Label htmlFor="channel-chat-id">Chat ID</Label>
                <Input
                  id="channel-chat-id"
                  placeholder="-1001234567890 hoặc @tenkenh"
                  value={values.chatId}
                  onChange={(e) => set('chatId', e.target.value)}
                />
                {fieldError('chatId')}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="channel-url">URL webhook</Label>
                <Input
                  id="channel-url"
                  type="url"
                  autoComplete="off"
                  placeholder={editing?.config?.urlMasked ?? 'https://hooks.example.com/kiotviet'}
                  value={values.url}
                  onChange={(e) => set('url', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Chỉ nhận https tới địa chỉ công khai. {secretHint}
                </p>
                {fieldError('url')}
              </div>
              <div className="space-y-2">
                <Label htmlFor="channel-hmac">Khoá ký HMAC (không bắt buộc)</Label>
                <Input
                  id="channel-hmac"
                  type="password"
                  autoComplete="off"
                  placeholder={editing?.config?.hasHmacSecret ? '•••••••• (đang có)' : ''}
                  value={values.hmacSecret}
                  disabled={values.removeHmacSecret}
                  onChange={(e) => set('hmacSecret', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Bên nhận kiểm chữ ký ở header X-KVL-Signature. {secretHint}
                </p>
                {editing?.config?.hasHmacSecret && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={values.removeHmacSecret}
                      onChange={(e) => set('removeHmacSecret', e.target.checked)}
                    />
                    Gỡ khoá ký
                  </label>
                )}
                {fieldError('hmacSecret')}
              </div>
            </>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Sự kiện nhận</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {notificationSubscribableTypeValues.map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={values.eventTypes.includes(type)}
                    onChange={(e) => toggleEvent(type, e.target.checked)}
                  />
                  {NOTIFICATION_EVENT_LABELS[type]}
                </label>
              ))}
            </div>
            {fieldError('eventTypes')}
          </fieldset>

          <div className="space-y-2">
            <Label>Mức độ tối thiểu</Label>
            <Select
              value={values.minSeverity}
              onValueChange={(v) => set('minSeverity', v as NotificationSeverity)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {notificationSeverityValues.map((s) => (
                  <SelectItem key={s} value={s}>
                    {NOTIFICATION_SEVERITY_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={values.enabled} onCheckedChange={(v) => set('enabled', v)} />
            Bật kênh
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Huỷ
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteChannelDialog({
  channel,
  onClose,
}: {
  channel: NotificationChannelItem | null
  onClose: () => void
}) {
  const mutation = useDeleteNotificationChannelMutation()

  async function onConfirm() {
    if (!channel) return
    try {
      await mutation.mutateAsync(channel.id)
      showSuccess('Đã xoá kênh thông báo')
      onClose()
    } catch (err) {
      handleApiError(err, { fallbackMessage: 'Không xoá được kênh thông báo' })
    }
  }

  return (
    <AlertDialog open={channel !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá kênh {channel?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Cửa hàng sẽ không còn nhận cảnh báo qua kênh này. Lịch sử gửi của kênh cũng bị xoá.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Hủy</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              void onConfirm()
            }}
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
