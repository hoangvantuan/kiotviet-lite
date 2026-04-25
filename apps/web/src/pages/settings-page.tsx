import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePermission } from '@/hooks/use-permission'

interface SettingsTab {
  value: string
  label: string
  path: string
  permission: 'store.manage' | 'users.manage' | 'audit.viewOwn'
}

const SETTINGS_TABS: SettingsTab[] = [
  { value: 'store', label: 'Cửa hàng', path: '/settings/store', permission: 'store.manage' },
  { value: 'staff', label: 'Nhân viên', path: '/settings/staff', permission: 'users.manage' },
  {
    value: 'audit',
    label: 'Lịch sử hoạt động',
    path: '/settings/audit',
    permission: 'audit.viewOwn',
  },
]

export function SettingsPage() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const canStore = usePermission('store.manage')
  const canUsers = usePermission('users.manage')
  const canAudit = usePermission('audit.viewOwn')

  const visibleTabs = SETTINGS_TABS.filter((tab) => {
    if (tab.permission === 'store.manage') return canStore
    if (tab.permission === 'users.manage') return canUsers
    return canAudit
  })

  const activeTab =
    SETTINGS_TABS.find((tab) => pathname.startsWith(tab.path))?.value ?? visibleTabs[0]?.value

  if (!activeTab) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-foreground">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">Bạn chưa có quyền truy cập mục cài đặt nào.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý cửa hàng, nhân viên và xem lịch sử hoạt động.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const tab = SETTINGS_TABS.find((t) => t.value === value)
          if (tab) navigate({ to: tab.path })
        }}
      >
        <TabsList className="w-full max-w-2xl justify-start overflow-x-auto">
          {visibleTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div>
        <Outlet />
      </div>
    </div>
  )
}
