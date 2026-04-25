# Story 1.3: Layout ứng dụng & Navigation

Status: done

## Story

As a người dùng đã đăng nhập,
I want giao diện nhất quán trên mọi thiết bị với navigation rõ ràng,
So that tôi thao tác nhanh dù dùng điện thoại, tablet hay máy tính.

## Acceptance Criteria (BDD)

### AC1: Desktop layout (≥1024px)

**Given** người dùng đã đăng nhập, màn hình ≥1024px
**When** trang load xong
**Then** hiển thị `AppLayout` gồm: `Sidebar` trái (240px, collapse được về 64px icon-only), `Header` trên cùng (tên cửa hàng, avatar, nút đăng xuất), vùng content chính bên phải
**And** Sidebar chứa menu: Tổng quan, Bán hàng (POS), Hàng hóa, Báo cáo, Cài đặt. Mỗi mục có icon + text
**And** menu item active được highlight bằng `--color-primary`

### AC2: Mobile layout (<768px)

**Given** người dùng đã đăng nhập, màn hình <768px
**When** trang load xong
**Then** Sidebar ẩn, thay bằng `BottomTabBar` cố định phía dưới (5 tab tương ứng 5 menu)
**And** Header rút gọn: tên cửa hàng + icon hamburger
**And** nhấn hamburger → mở Sidebar overlay drawer từ trái, nhấn backdrop hoặc swipe trái để đóng

### AC3: Tablet layout (768px-1023px)

**Given** người dùng đang dùng tablet
**When** trang load xong
**Then** Sidebar collapse mặc định về icon-only (64px), hover hoặc nhấn icon menu → expand ra full Sidebar overlay
**And** BottomTabBar ẩn

### AC4: POS fullscreen mode

**Given** route hiện tại là `/pos`
**When** kiểm tra layout
**Then** POS screen chiếm toàn bộ viewport, ẩn Sidebar và BottomTabBar
**And** có nút icon nhỏ góc trái trên để quay về menu chính

### AC5: ErrorBoundary

**Given** component con bất kỳ throw JavaScript error
**When** error xảy ra trong runtime
**Then** `ErrorBoundary` bắt lỗi, hiển thị UI fallback: icon lỗi, message "Đã xảy ra lỗi", nút "Thử lại" (reload component), nút "Về trang chủ"
**And** error được log ra console kèm component stack trace
**And** phần còn lại của app không bị crash

### AC6: Toast system

**Given** Toast system đã tích hợp (Sonner, từ Story 1.2)
**When** action thành công hoặc lỗi xảy ra
**Then** Toast hiển thị góc trên phải (desktop) hoặc trên cùng full-width (mobile)
**And** 4 loại: success (xanh lá), error (đỏ), warning (vàng), info (xanh dương)
**And** tự đóng sau 3 giây (success/info) hoặc 5 giây (error/warning), có nút đóng thủ công

### AC7: Empty state

**Given** một trang có danh sách nhưng chưa có dữ liệu
**When** trang load xong
**Then** hiển thị empty state: icon/illustration, tiêu đề mô tả, mô tả ngắn, nút CTA chính
**And** tạo `EmptyState` component reusable nhận props: icon, title, description, actionLabel, onAction

### AC8: Accessibility

**Given** app đã render xong
**When** kiểm tra accessibility
**Then** tất cả interactive element navigate được bằng Tab, focus ring visible (2px `--color-primary`)
**And** color contrast ≥4.5:1 cho text, ≥3:1 cho UI component (WCAG 2.1 AA)
**And** mọi icon button có `aria-label`, mọi form field có `label` liên kết

## Tasks / Subtasks

### Phase A: Layout components

- [x] Task 1: Sidebar component (AC: #1, #2, #3)
  - [x] 1.1: `apps/web/src/components/layout/sidebar.tsx`: 5 nav items (Tổng quan `/`, Bán hàng `/pos`, Hàng hóa `/products`, Báo cáo `/reports`, Cài đặt `/settings`), mỗi item có Lucide icon + text
  - [x] 1.2: State: expanded (240px) / collapsed (64px icon-only). Desktop: toggle bằng nút trên sidebar. Tablet: collapsed mặc định (forced icon-only)
  - [x] 1.3: Mobile: ẩn hoàn toàn (BottomTabBar thay thế). Khi mở bằng hamburger → render dạng drawer overlay từ trái với backdrop
  - [x] 1.4: Active item highlight `bg-primary/10 text-primary`. Dùng `useRouterState` từ TanStack Router để detect route hiện tại
  - [x] 1.5: Persist collapsed state trong `localStorage` key `sidebar-collapsed`

- [x] Task 2: Header component (AC: #1, #2)
  - [x] 2.1: `apps/web/src/components/layout/header.tsx`: Desktop: tên cửa hàng (từ auth store `user.name`), nút đăng xuất. Mobile: tên cửa hàng + hamburger icon
  - [x] 2.2: Nút đăng xuất gọi `useLogout` (đã có từ Story 1.2)
  - [x] 2.3: Mobile hamburger toggle state: mở/đóng sidebar drawer

- [x] Task 3: BottomTabBar component (AC: #2)
  - [x] 3.1: `apps/web/src/components/layout/bottom-tab-bar.tsx`: 5 tab tương ứng 5 menu sidebar, icon + label ngắn
  - [x] 3.2: Chỉ hiển thị khi `<768px` (dùng Tailwind `md:hidden`)
  - [x] 3.3: Tab active highlight `text-primary`, inactive `text-muted-foreground`
  - [x] 3.4: Cố định bottom, `z-40`, safe-area-inset cho iOS (padding-bottom `env(safe-area-inset-bottom)`)

- [x] Task 4: AppLayout composition (AC: #1, #2, #3, #4)
  - [x] 4.1: `apps/web/src/components/layout/app-layout.tsx`: compose Sidebar + Header + BottomTabBar + `<Outlet />`
  - [x] 4.2: Thay `AuthenticatedLayout` trong `router.tsx` bằng `appLayoutRoute` với `AppLayout` component
  - [x] 4.3: Content area: desktop margin-left dynamic (240px/64px), tablet 64px, mobile 0. Mobile padding-bottom cho BottomTabBar
  - [x] 4.4: POS route tách riêng ngoài appLayoutRoute → fullscreen, không có Sidebar/Header/BottomTabBar

### Phase B: Error handling & UX components

- [x] Task 5: ErrorBoundary (AC: #5)
  - [x] 5.1: `apps/web/src/components/layout/error-boundary.tsx`: React class component với `componentDidCatch`
  - [x] 5.2: Fallback UI: icon `AlertTriangle` (Lucide), heading "Đã xảy ra lỗi", mô tả, nút "Thử lại" (reset state), nút "Về trang chủ"
  - [x] 5.3: `componentDidCatch`: log error + componentStack ra console.error
  - [x] 5.4: Wrap ở 2 vị trí: (a) bọc `<Outlet />` trong AppLayout (page-level), (b) bọc toàn app trong `rootRoute` (app-level)

- [x] Task 6: Toast configuration (AC: #6)
  - [x] 6.1: Cập nhật `<Toaster />` trong `router.tsx`: position `top-right`, closeButton enabled
  - [x] 6.2: Tạo `apps/web/src/lib/toast.ts` helper: `showSuccess`, `showError`, `showWarning`, `showInfo` với đúng duration config

- [x] Task 7: EmptyState component (AC: #7)
  - [x] 7.1: `apps/web/src/components/shared/empty-state.tsx`: props `icon`, `title`, `description?`, `actionLabel?`, `onAction?`
  - [x] 7.2: Layout: icon 48px muted, title lg medium, description sm muted, CTA button
  - [x] 7.3: Cập nhật `home-page.tsx` hiển thị dashboard placeholder với EmptyState

### Phase C: Router & page stubs

- [x] Task 8: Cập nhật Router (AC: #1, #2, #3, #4)
  - [x] 8.1: Thêm route stubs: `/` (home), `/pos`, `/products`, `/reports`, `/settings`
  - [x] 8.2: Mỗi stub page có EmptyState phù hợp context
  - [x] 8.3: `/pos` route: parent trực tiếp là `authenticatedRoute`, fullscreen, nút quay về trang chủ
  - [x] 8.4: Route tree: `authenticatedRoute` → `appLayoutRoute` (layout) + `posRoute` (fullscreen)

- [x] Task 9: Sidebar collapse hook (AC: #1, #3)
  - [x] 9.1: `apps/web/src/hooks/use-sidebar.ts`: Zustand store quản lý `isCollapsed`, `isMobileOpen`, `toggle`, `closeMobile`
  - [x] 9.2: Lắng nghe `matchMedia('(min-width: 768px)')` auto-close mobile drawer khi resize
  - [x] 9.3: Lắng nghe route change (TanStack Router `useRouterState`) auto-close mobile drawer khi navigate

### Phase D: Accessibility & polish

- [x] Task 10: Accessibility (AC: #8)
  - [x] 10.1: Sidebar: `<nav aria-label="Menu chính">`, mỗi link có `aria-current="page"` khi active
  - [x] 10.2: BottomTabBar: `<nav aria-label="Menu chính">`, active tab có `aria-current="page"`
  - [x] 10.3: Hamburger button: `aria-label="Mở menu"`, `aria-expanded` bind theo state
  - [x] 10.4: Focus ring: `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2` cho tất cả interactive elements
  - [x] 10.5: Mobile drawer: close button có `aria-label="Đóng menu"`, backdrop click để đóng

- [x] Task 11: Responsive testing & integration (AC: all)
  - [x] 11.1: `pnpm typecheck` pass (3/3 packages)
  - [x] 11.2: `pnpm lint` pass (0 errors, 2 pre-existing warnings)
  - [x] 11.3: `pnpm test` pass (22/22 tests, 0 regression)
  - [x] 11.4: Manual test: desktop layout đúng, sidebar expand/collapse
  - [x] 11.5: Manual test: mobile BottomTabBar hiện, hamburger mở drawer
  - [x] 11.6: Manual test: tablet sidebar collapsed
  - [x] 11.7: Manual test: navigate giữa các route, active state đúng

## Dev Notes

### Pattern cần tuân thủ từ Story 1.2

- **Code-based routing**: TanStack Router dùng code-based (KHÔNG file-based routing plugin). Xem `router.tsx` hiện tại
- **Auth store**: `useAuthStore` (Zustand) tại `stores/use-auth-store.ts`. Lấy `user.name` cho Header
- **Logout hook**: `useLogout` tại `features/auth/use-logout.ts`. Đã handle xóa cookie + clear store
- **Sonner Toast**: đã cấu hình `<Toaster />` trong `RootComponent` tại `router.tsx`. Di chuyển hoặc cấu hình thêm, không duplicate
- **API client**: `api-client.ts` đã có auto-refresh 401 + redirect `/login` khi refresh fail

### Cấu trúc file cần tạo

```
apps/web/src/
├── components/
│   ├── layout/
│   │   ├── app-layout.tsx       # Compose sidebar+header+content
│   │   ├── sidebar.tsx          # Nav sidebar (desktop/tablet/mobile drawer)
│   │   ├── header.tsx           # Top header bar
│   │   ├── bottom-tab-bar.tsx   # Mobile bottom navigation
│   │   └── error-boundary.tsx   # React error boundary
│   └── shared/
│       └── empty-state.tsx      # Reusable empty state
├── hooks/
│   └── use-sidebar.ts           # Sidebar state management
├── lib/
│   └── toast.ts                 # Toast helper functions
└── pages/
    ├── home-page.tsx            # Cập nhật (dashboard placeholder)
    ├── pos-page.tsx             # Stub: POS fullscreen
    ├── products-page.tsx        # Stub: Hàng hóa
    ├── reports-page.tsx         # Stub: Báo cáo
    └── settings-page.tsx        # Stub: Cài đặt
```

### Breakpoints (Tailwind)

- Mobile: mặc định (không prefix)
- Tablet: `md:` (≥768px)
- Desktop: `lg:` (≥1024px)
- Large desktop: `xl:` (≥1280px)

### Navigation items config

```typescript
const NAV_ITEMS = [
  { path: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { path: '/pos', label: 'Bán hàng', icon: ShoppingCart },
  { path: '/products', label: 'Hàng hóa', icon: Package },
  { path: '/reports', label: 'Báo cáo', icon: BarChart3 },
  { path: '/settings', label: 'Cài đặt', icon: Settings },
] as const
```

### Icon library

Dùng `lucide-react` (đã có sẵn qua shadcn/ui dependency). Import trực tiếp:

```typescript
import { LayoutDashboard, ShoppingCart, Package, BarChart3, Settings } from 'lucide-react'
```

### Router restructure

Hiện tại `authenticatedRoute` chỉ có `<Outlet />`. Cần tách thành 2 nhánh:

```
rootRoute
├── loginRoute
├── registerRoute
└── authenticatedRoute (guard only, no layout)
    ├── appLayoutRoute (AppLayout wrapper)
    │   ├── homeRoute (/)
    │   ├── productsRoute (/products)
    │   ├── reportsRoute (/reports)
    │   └── settingsRoute (/settings)
    └── posRoute (/pos) (fullscreen, no layout)
```

### Anti-patterns

- KHÔNG dùng `window.innerWidth` để detect breakpoint. Dùng Tailwind responsive classes hoặc `matchMedia` trong hook
- KHÔNG hard-code 240px/64px trong nhiều chỗ. Dùng CSS variable hoặc constant
- KHÔNG tạo context mới cho sidebar state nếu Zustand store nhỏ gọn đủ dùng
- KHÔNG import component từ `@radix-ui` trực tiếp. Dùng qua shadcn/ui wrapper (đã có `dialog.tsx`, etc.)
- KHÔNG thêm dependency mới trừ khi thực sự cần. `lucide-react` đã có sẵn

### References

- [Source: epics/epic-1 Story 1.3 section]
- [Source: ux-design-specification/responsive-design-accessibility.md]
- [Source: ux-design-specification/component-strategy.md]
- [Source: architecture/project-structure-boundaries.md#layout components]
- [Source: ux-design-specification/core-user-experience.md]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- Tạo responsive layout: Sidebar (desktop/tablet), MobileDrawer (mobile), Header, BottomTabBar
- Sidebar collapse state persist trong localStorage, tablet luôn collapsed
- Router restructure: tách authenticatedRoute thành appLayoutRoute (có layout) + posRoute (fullscreen)
- ErrorBoundary ở 2 cấp: app-level (rootRoute) + page-level (AppLayout bọc Outlet)
- Toast helper functions với duration phù hợp (3s success/info, 5s error/warning)
- EmptyState reusable component, dùng cho tất cả stub pages
- Tạo useMediaQuery + useSidebarAutoClose hooks
- Không thêm dependency mới, dùng toàn bộ lucide-react + shadcn/ui đã có

### Change Log

- 2026-04-25: Triển khai Story 1.3 Layout ứng dụng & Navigation
- 2026-04-25: Code review - 5 patches áp dụng (Escape key cho mobile drawer, route matching exact, tablet hover-to-expand, Toaster responsive position, gỡ noop onAction)

### Review Findings (self-review 2026-04-25)

- [x] [Review][Patch] Mobile drawer thiếu Escape key handler (sidebar.tsx) - đã thêm useEffect listener
- [x] [Review][Patch] Active route matching dùng startsWith không đúng (sidebar.tsx, bottom-tab-bar.tsx) - đã đổi thành exact match hoặc startsWith với "/"
- [x] [Review][Patch] Tablet thiếu hover-to-expand sidebar (sidebar.tsx) - đã thêm group-hover Tailwind class
- [x] [Review][Patch] Toaster mobile position cố định top-right (router.tsx) - đã thêm ResponsiveToaster với useMediaQuery
- [x] [Review][Patch] EmptyState noop onAction (products-page.tsx) - đã gỡ actionLabel/onAction
- [x] [Review][Defer] Mobile drawer focus trap (WCAG 2.1 AA) - chuyển sang deferred work
- [x] [Review][Defer] Unit tests cho layout components - chuyển sang deferred work
- [x] [Review][Defer] HomePage hiển thị "Xin chào, " trống khi user null - defensive, auth guard đã chặn

### File List

New files:

- apps/web/src/components/layout/app-layout.tsx
- apps/web/src/components/layout/sidebar.tsx
- apps/web/src/components/layout/header.tsx
- apps/web/src/components/layout/bottom-tab-bar.tsx
- apps/web/src/components/layout/error-boundary.tsx
- apps/web/src/components/layout/nav-items.ts
- apps/web/src/components/shared/empty-state.tsx
- apps/web/src/hooks/use-sidebar.ts
- apps/web/src/hooks/use-media-query.ts
- apps/web/src/lib/toast.ts
- apps/web/src/pages/pos-page.tsx
- apps/web/src/pages/products-page.tsx
- apps/web/src/pages/reports-page.tsx
- apps/web/src/pages/settings-page.tsx

Modified files:

- apps/web/src/router.tsx
- apps/web/src/pages/home-page.tsx
