# Epic 1: Khởi tạo dự án & Quản trị cửa hàng

Owner đăng ký cửa hàng, đăng nhập, quản lý nhân viên, phân quyền 3 vai trò. Nền tảng monorepo, design tokens, base components, auth system.

## Story 1.1: Khởi tạo monorepo, database, design system cơ bản

As a developer,
I want một monorepo hoàn chỉnh với database, design system và dev server chạy được,
So that toàn bộ team có nền tảng thống nhất để phát triển các tính năng tiếp theo.

> **Parallel Work Lanes:** Story này gồm 3 luồng có thể triển khai song song:
> - **Lane A:** Monorepo + PostgreSQL + Drizzle + PGlite (infra + data layer)
> - **Lane B:** Tailwind + Design tokens + 6 base components (UI layer)
> - **Lane C:** ESLint + Prettier + TypeScript strict + Vitest (quality layer)
>
> Lane B và C chỉ cần Lane A hoàn thành cấu trúc thư mục cơ bản, không cần database chạy.

**Acceptance Criteria:**

**Given** developer clone repo về máy lần đầu
**When** chạy `pnpm install && pnpm dev`
**Then** dev server khởi động thành công trong ≤30 giây với cả 3 workspace: `apps/web` (Vite 8 + React 19), `apps/api` (Hono), `packages/shared`
**And** không có lỗi TypeScript hay lint error nào

**Given** monorepo đã cài đặt
**When** kiểm tra cấu trúc thư mục
**Then** tồn tại đúng 3 workspace: `apps/web`, `apps/api`, `packages/shared`
**And** `packages/shared` export được types, constants, utils dùng chung cho cả web và api
**And** path alias `@shared/*` hoạt động trong cả web và api

**Given** PostgreSQL đang chạy
**When** chạy `pnpm db:migrate`
**Then** Drizzle ORM tạo thành công schema ban đầu (bảng `users`, `stores`, migration history)
**And** file migration được lưu trong `apps/api/src/db/migrations`
**And** `pnpm db:studio` mở được Drizzle Studio để inspect database

**Given** dev server đang chạy
**When** truy cập `apps/web` trên trình duyệt
**Then** Tailwind CSS 4 hoạt động, shadcn/ui đã cấu hình
**And** design tokens được định nghĩa trong CSS variables: `--color-primary`, `--color-secondary`, `--color-destructive`, `--color-muted`, `--radius`, `--font-sans`

**Given** design system đã cấu hình
**When** import các base component
**Then** 6 component cơ bản sẵn sàng sử dụng: `Button` (4 variants: default/secondary/outline/destructive, 3 sizes: sm/md/lg), `Input`, `Dialog`, `Toast`, `Tabs`, `Select`
**And** mỗi component có TypeScript props đầy đủ

**Given** PostgreSQL schema đã tạo thành công
**When** khởi tạo PGlite trong browser (hoặc test environment)
**Then** PGlite tạo được schema tương đương từ Drizzle shared schemas (`packages/shared/src/schema/`)
**And** cùng 1 Drizzle schema definition dùng cho cả PostgreSQL server và PGlite client (DRY)
**And** `pnpm test:pglite` chạy test tạo PGlite instance + insert/query record thành công
**And** document rõ cách client và server schemas đồng bộ khi thêm table/column mới

**Given** developer muốn kiểm tra code quality
**When** chạy `pnpm lint` và `pnpm typecheck`
**Then** ESLint + Prettier chạy trên toàn monorepo không lỗi
**And** TypeScript strict mode bật cho tất cả workspace
**And** `pnpm test` chạy được Vitest (dù chưa có test case nào)

**Given** developer hoàn thành Story 1.1
**When** muốn bắt đầu implement Story 1.2 (Đăng ký & Đăng nhập)
**Then** có thể tạo React component mới trong `apps/web`, import types từ `@shared/*`, dev server hot-reload
**And** có thể tạo API route mới trong `apps/api`, query database qua Drizzle, trả JSON response
**And** toàn bộ TypeScript strict mode pass, không lỗi

---

## Story 1.2: Đăng ký cửa hàng & Đăng nhập

As a chủ cửa hàng,
I want đăng ký tài khoản bằng số điện thoại và đăng nhập an toàn,
So that tôi có cửa hàng riêng trên hệ thống và chỉ người được phép mới truy cập được.

**Acceptance Criteria:**

**Given** người dùng mới truy cập hệ thống lần đầu
**When** vào trang đăng ký và điền: tên cửa hàng (bắt buộc, 2-100 ký tự), số điện thoại (bắt buộc, format VN 10 số), mật khẩu (bắt buộc, ≥8 ký tự), tên chủ cửa hàng (bắt buộc)
**Then** hệ thống tạo 1 record trong bảng `users` (role = `owner`) và 1 record trong bảng `stores`
**And** user được liên kết với store qua `store_id`
**And** tự động đăng nhập và redirect về trang chủ

**Given** số điện thoại đã được đăng ký
**When** người dùng khác đăng ký với cùng số điện thoại
**Then** hiển thị lỗi "Số điện thoại đã được sử dụng" ngay dưới field input
**And** không tạo record mới nào trong database

**Given** Better Auth đã cấu hình trên `apps/api`
**When** người dùng đăng nhập đúng số điện thoại + mật khẩu
**Then** server trả về JWT access token (expire 15 phút) và refresh token (expire 7 ngày)
**And** access token chứa: `userId`, `storeId`, `role`
**And** token được lưu trong httpOnly cookie (không localStorage)

**Given** access token đã hết hạn
**When** client gửi request đến API
**Then** middleware tự động dùng refresh token để lấy access token mới
**And** request ban đầu được retry tự động, user không bị gián đoạn
**And** nếu refresh token cũng hết hạn, redirect về trang đăng nhập

**Given** người dùng chưa đăng nhập
**When** truy cập bất kỳ route nào ngoài `/login` và `/register`
**Then** TanStack Router redirect về `/login`
**And** sau khi đăng nhập thành công, redirect về URL ban đầu user muốn vào

**Given** người dùng đã đăng nhập
**When** nhấn "Đăng xuất"
**Then** xoá JWT cookie cả access và refresh token
**And** redirect về `/login`
**And** mọi request API tiếp theo trả về 401

**Given** người dùng điền form đăng ký
**When** nhập số điện thoại sai format (không đủ 10 số, chứa chữ cái)
**Then** hiển thị lỗi validation inline dưới field
**And** nút "Đăng ký" bị disable cho đến khi tất cả field hợp lệ

**Given** server trả về lỗi bất kỳ (500, network error)
**When** đang submit form đăng ký hoặc đăng nhập
**Then** hiển thị Toast lỗi với message rõ ràng (không hiển thị stack trace)
**And** form giữ nguyên dữ liệu user đã nhập, không reset

---

## Story 1.3: Layout ứng dụng & Navigation

As a người dùng,
I want giao diện nhất quán trên mọi thiết bị với navigation rõ ràng,
So that tôi thao tác nhanh dù dùng điện thoại, tablet hay máy tính.

**Acceptance Criteria:**

**Given** người dùng đã đăng nhập, màn hình ≥1024px (desktop)
**When** trang load xong
**Then** hiển thị `AppLayout` gồm: `Sidebar` bên trái (240px, có thể collapse về 64px icon-only), `Header` trên cùng (tên cửa hàng, avatar, nút đăng xuất), vùng content chính bên phải
**And** Sidebar chứa menu: Tổng quan, Bán hàng (POS), Hàng hóa, Báo cáo, Cài đặt — mỗi mục có icon + text
**And** menu item active được highlight bằng `--color-primary`

**Given** người dùng đã đăng nhập, màn hình <768px (mobile)
**When** trang load xong
**Then** Sidebar ẩn đi, thay bằng `BottomTabBar` cố định phía dưới (5 tab tương ứng 5 menu)
**And** Header rút gọn chỉ hiển thị tên cửa hàng và icon menu hamburger
**And** nhấn hamburger mở Sidebar dạng overlay drawer từ trái, nhấn ngoài hoặc swipe trái để đóng

**Given** người dùng đang dùng tablet (768px-1023px)
**When** trang load xong
**Then** Sidebar collapse mặc định về icon-only (64px)
**And** hover hoặc nhấn icon menu → expand ra full Sidebar overlay
**And** BottomTabBar ẩn

**Given** route hiện tại là `/pos`
**When** kiểm tra layout
**Then** POS screen chiếm toàn bộ viewport, ẩn Sidebar và BottomTabBar để tối đa diện tích bán hàng
**And** có nút icon nhỏ góc trái trên để quay về menu chính

**Given** component con bất kỳ throw JavaScript error
**When** error xảy ra trong runtime
**Then** `ErrorBoundary` bắt lỗi, hiển thị UI fallback thân thiện: icon lỗi, message "Đã xảy ra lỗi", nút "Thử lại" (reload component) và nút "Về trang chủ"
**And** error được log ra console kèm component stack trace
**And** phần còn lại của app không bị crash

**Given** Toast system đã tích hợp
**When** action thành công (tạo/sửa/xoá) hoặc lỗi xảy ra
**Then** Toast hiển thị góc trên phải (desktop) hoặc trên cùng full-width (mobile)
**And** 4 loại: success (xanh lá), error (đỏ), warning (vàng), info (xanh dương)
**And** tự đóng sau 3 giây (success/info) hoặc 5 giây (error/warning), có nút đóng thủ công

**Given** một trang có danh sách nhưng chưa có dữ liệu nào
**When** trang load xong
**Then** hiển thị empty state: illustration/icon, tiêu đề mô tả (VD: "Chưa có sản phẩm nào"), mô tả ngắn, nút CTA chính (VD: "Thêm sản phẩm đầu tiên")
**And** mỗi trang danh sách có empty state riêng phù hợp ngữ cảnh

**Given** app đã render xong
**When** kiểm tra accessibility
**Then** tất cả interactive element có thể navigate bằng Tab, focus ring visible (2px `--color-primary`)
**And** color contrast ratio ≥4.5:1 cho text, ≥3:1 cho UI component (WCAG 2.1 AA)
**And** mọi icon button có `aria-label`, mọi form field có `label` liên kết

---

## Story 1.4: Quản lý nhân viên & Phân quyền

As a chủ cửa hàng (Owner),
I want quản lý nhân viên, phân quyền và thiết lập mã PIN,
So that mỗi người chỉ truy cập đúng chức năng được phép và tôi theo dõi được ai làm gì.

**Acceptance Criteria:**

**Given** Owner đã đăng nhập
**When** vào trang Cài đặt > Nhân viên > nhấn "Thêm nhân viên"
**Then** mở form tạo nhân viên: tên (bắt buộc), số điện thoại (bắt buộc, unique trong store), role (chọn 1 trong 3: Owner/Manager/Staff), mã PIN (bắt buộc, đúng 6 số)
**And** tạo thành công → record mới trong bảng `users` liên kết đúng `store_id`, Toast success, danh sách cập nhật
**And** mã PIN được hash (bcrypt) trước khi lưu, không bao giờ trả về plaintext qua API

**Given** danh sách nhân viên hiển thị
**When** Owner xem danh sách
**Then** bảng responsive hiển thị: tên, số điện thoại, vai trò (badge màu: Owner=tím, Manager=xanh, Staff=xám), trạng thái (hoạt động/khoá), ngày tạo
**And** có ô tìm kiếm theo tên/SĐT, filter theo role
**And** trên mobile, bảng chuyển sang dạng card list

**Given** hệ thống phân quyền 3 roles
**When** kiểm tra ma trận quyền
**Then** quyền được phân như sau:

| Chức năng | Owner | Manager | Staff |
|---|---|---|---|
| Quản lý nhân viên | ✅ | ❌ | ❌ |
| Cài đặt cửa hàng | ✅ | ❌ | ❌ |
| Xem báo cáo | ✅ | ✅ | ❌ |
| Quản lý hàng hóa | ✅ | ✅ | ❌ |
| Bán hàng (POS) | ✅ | ✅ | ✅ |
| Xem lịch sử bán hàng | ✅ | ✅ | Chỉ đơn của mình |

**And** API middleware kiểm tra role trước mỗi request, trả 403 nếu không đủ quyền
**And** UI ẩn menu/nút mà user không có quyền truy cập

**Given** nhân viên đã có mã PIN
**When** nhân viên nhập PIN 6 số tại màn hình xác thực
**Then** hệ thống so khớp PIN hash trong ≤200ms
**And** đúng → cho phép thao tác, sai → hiển thị "Mã PIN không đúng", sau 5 lần sai liên tiếp → khoá 15 phút
**And** PIN dùng cho: xác nhận thao tác nhạy cảm (sửa giá dưới vốn, override hạn mức nợ)

**Given** Owner muốn sửa thông tin nhân viên
**When** nhấn icon Edit trên dòng nhân viên
**Then** mở form pre-filled với dữ liệu hiện tại, cho phép sửa: tên, role, trạng thái, reset PIN
**And** không cho phép sửa số điện thoại (hiển thị disabled)
**And** Owner không thể hạ role của chính mình xuống dưới Owner
**And** lưu thành công → ghi 1 record vào bảng `audit_logs` (who, action, target, timestamp, changes JSON)

**Given** Owner muốn khoá nhân viên
**When** nhấn nút "Khoá" và xác nhận trong dialog
**Then** nhân viên chuyển trạng thái "Khoá", không thể đăng nhập hay xác thực PIN
**And** nếu nhân viên đang online → session bị invalidate ngay lập tức
**And** audit log ghi nhận hành động khoá

**Given** Owner vào trang Cài đặt > Cửa hàng
**When** trang load xong
**Then** hiển thị form cài đặt cửa hàng: tên cửa hàng, địa chỉ, số điện thoại, logo (upload ảnh ≤2MB, jpg/png)
**And** lưu thành công → Toast success, header cập nhật tên mới ngay

**Given** hệ thống audit log
**When** Owner vào Cài đặt > Lịch sử hoạt động
**Then** hiển thị bảng `audit_logs`: thời gian, người thực hiện, hành động, chi tiết thay đổi
**And** filter theo người thực hiện, loại hành động, khoảng thời gian
**And** phân trang 20 record/trang
**And** audit_logs là append-only, không cho phép sửa/xoá (DB constraint)

---
