# Audit Log Viewer

Liên quan FR65-FR67 (Phân quyền / Audit). Vá lỗ hổng Medium severity từ Implementation Readiness Report 2026-04-18.

## Mục tiêu

Architecture đã có `audit_log` table, nhưng UX thiếu viewer. Owner/Manager cần:

1. Thấy rõ AI đã làm gì, lúc nào, trên dữ liệu nào
2. Lọc nhanh theo user, loại hành động, thời gian
3. Drill-down từ 1 entity (đơn/SP/KH) → lịch sử thay đổi của riêng nó
4. Export audit report cho báo cáo tuân thủ

## Ai được xem?

| Role    | Quyền truy cập Audit                        |
| ------- | ------------------------------------------- |
| Owner   | Toàn bộ — mọi user, mọi hành động           |
| Manager | Xem log của Staff + của chính mình          |
| Staff   | Chỉ xem log của chính mình (tab "Hoạt động") |

## Loại hành động được log

| Category             | Ví dụ                                      |
| -------------------- | ------------------------------------------ |
| **Bán hàng**         | Tạo đơn, hủy đơn, trả hàng, áp CK          |
| **Giá**              | Sửa giá bán, sửa cascade, override dưới vốn |
| **Tồn kho**          | Nhập kho, điều chỉnh thủ công, trả NCC      |
| **Công nợ**          | Ghi nợ, thu nợ, điều chỉnh, override hạn mức|
| **Sản phẩm**         | Tạo/sửa/xóa SP, đổi trạng thái              |
| **Khách hàng**       | Tạo/sửa/xóa KH, đổi nhóm KH                 |
| **Nhân viên**        | Thêm/xóa NV, đổi quyền, reset mật khẩu      |
| **Cấu hình**         | Đổi cấu hình cửa hàng, bảng giá, printer    |
| **Đăng nhập**        | Login, logout, PIN override, fail attempts  |
| **Sync**             | Resolve conflict (giữ Local/Server/Merge)   |

## Entry point

**Owner/Manager:**

- Menu chính → "Nhật ký hệ thống" (icon `history`)
- Từ chi tiết entity: tab "Lịch sử" (drill-down audit của riêng entity đó)

**Staff:**

- Menu Cá nhân → "Hoạt động của tôi"

## Audit Log Viewer Layout

**Desktop (full page):**

```
┌────────────────────────────────────────────────────────────────────┐
│  Nhật ký hệ thống                               [Xuất CSV] [Lọc]   │
├────────────────────────────────────────────────────────────────────┤
│  [Hôm nay ▼]  [Tất cả NV ▼]  [Tất cả loại ▼]  🔍 Tìm...          │
├────────────────────────────────────────────────────────────────────┤
│  Thời gian        │ NV        │ Hành động        │ Chi tiết       │
├────────────────────────────────────────────────────────────────────┤
│  14:32 hôm nay   │ Lan       │ Tạo đơn #1234   │ 3 SP, 450.000đ│
│  14:28 hôm nay   │ Anh Hùng │ Sửa giá SP       │ G7: 75k→80k    │
│  14:15 hôm nay   │ Chị Hoa  │ Override hạn mức│ KH Anh Ba +500k│
│  13:50 hôm nay   │ Lan       │ Thu nợ           │ KH Tèo 2tr     │
│  13:22 hôm nay   │ Lan       │ ❗ Fail login    │ Sai mật khẩu ×3│
│  ...                                                               │
├────────────────────────────────────────────────────────────────────┤
│  Hiển thị 50/234  │  ← Trước  Trang 1/5  Tiếp →                   │
└────────────────────────────────────────────────────────────────────┘
```

**Mobile (list card):**

```
┌──────────────────────────────┐
│  Nhật ký              [Lọc]  │
├──────────────────────────────┤
│  🔍 Tìm...                   │
├──────────────────────────────┤
│  ┌──────────────────────────┐│
│  │ 14:32 Lan                ││
│  │ Tạo đơn #1234            ││
│  │ 3 SP, 450.000đ           ││
│  └──────────────────────────┘│
│  ┌──────────────────────────┐│
│  │ 14:28 Anh Hùng  ⚠        ││
│  │ Sửa giá Cà phê G7        ││
│  │ 75.000 → 80.000đ         ││
│  └──────────────────────────┘│
│  ...                         │
└──────────────────────────────┘
```

## Filter panel

```
┌──────────────────────────────┐
│  Lọc nhật ký            [X]  │
├──────────────────────────────┤
│  Thời gian                   │
│  (•) Hôm nay                 │
│  ( ) 7 ngày qua              │
│  ( ) 30 ngày qua              │
│  ( ) Tùy chỉnh [__ - __]     │
│                              │
│  Nhân viên                   │
│  ☑ Tất cả                    │
│  ☐ Lan                       │
│  ☐ Anh Hùng                 │
│  ☐ Chị Hoa (Owner)          │
│                              │
│  Loại hành động              │
│  ☑ Bán hàng                  │
│  ☑ Giá                       │
│  ☑ Tồn kho                   │
│  ☑ Công nợ                   │
│  ☐ Đăng nhập                 │
│  ☑ Cấu hình                  │
│                              │
│  Mức độ                      │
│  ☑ Thông thường              │
│  ☑ Quan trọng (PIN override) │
│  ☑ Cảnh báo (fail login)     │
├──────────────────────────────┤
│    [Reset]       [Áp dụng]   │
└──────────────────────────────┘
```

## Detail view (tap 1 log entry)

```
┌──────────────────────────────────────────┐
│  ← Chi tiết nhật ký                      │
├──────────────────────────────────────────┤
│  Thời gian:  14:28 23/04/2026            │
│  Nhân viên:  Anh Hùng (Manager)         │
│  Thiết bị:   iPhone 15 — iOS 17          │
│  IP:         192.168.1.12                │
│  Hành động:  Sửa giá bán sản phẩm        │
│  Đối tượng:  Cà phê G7 (SKU: CF001)      │
├──────────────────────────────────────────┤
│  Thay đổi                                │
│                                          │
│  Field      │ Trước    │ Sau             │
│  ───────────┼──────────┼─────────────────│
│  Giá bán    │ 75.000đ  │ 80.000đ         │
│  Ngày hiệu  │ —        │ 23/04/2026      │
│                                          │
│  Lý do: "Điều chỉnh theo giá nhập mới"   │
├──────────────────────────────────────────┤
│  Hành động liên quan                     │
│  • Cascade áp dụng cho nhóm ĐL C1 (+10%) │
│  • 3 đơn đang mở chưa bị ảnh hưởng       │
├──────────────────────────────────────────┤
│  [Xem SP này]  [Xem log của Anh Hùng]   │
└──────────────────────────────────────────┘
```

## Drill-down từ entity

**Trên chi tiết SP / KH / Đơn:**

Tab "Lịch sử" hiển thị audit chỉ liên quan entity đó:

```
┌──────────────────────────────────────┐
│ SP: Cà phê G7                         │
│ [Thông tin] [Lịch sử] [Thống kê]     │
├──────────────────────────────────────┤
│  23/04 14:28 │ Anh Hùng sửa giá     │
│  75.000 → 80.000đ                    │
│                                       │
│  20/04 09:15 │ Chị Hoa nhập kho     │
│  +100 (tồn 250)                      │
│                                       │
│  15/04 16:00 │ Chị Hoa tạo SP       │
│  Giá khởi đầu 75.000đ                │
└──────────────────────────────────────┘
```

## Visual indicator cho hành động quan trọng

| Loại                  | Badge               | Icon màu      |
| --------------------- | ------------------- | ------------- |
| PIN Owner override    | `badge-owner`       | 🛡️ primary    |
| Fail login / Block    | `badge-warning`     | ⚠ warning     |
| Xóa (irreversible)    | `badge-destructive` | 🗑️ error     |
| Sync conflict resolved| `badge-sync`        | ☁ neutral     |
| Cấu hình hệ thống     | `badge-config`      | ⚙ info        |

## Mức độ chi tiết theo field

**Field nhạy cảm (log full diff):**

- Giá vốn, giá bán, cascade
- Hạn mức nợ, công nợ
- Quyền user, mật khẩu (log hash trước/sau, không log plaintext)

**Field thông thường (log value sau):**

- Tên SP, mô tả, ghi chú
- Email, SĐT KH

**Field KHÔNG log (privacy):**

- Mật khẩu plaintext
- PIN Owner
- Token session
- Ảnh CMND nếu có (chỉ log "uploaded", không log nội dung)

## Export Audit Report

Cho mục đích audit thuế/tuân thủ:

**Modal xuất audit:**

```
Format: (•) Excel  ( ) CSV  ( ) PDF (ký số)
Phạm vi: [01/04/2026 - 23/04/2026]
Nhóm theo: [Nhân viên ▼]
Include:
  ☑ Thông tin cơ bản
  ☑ Diff chi tiết (before/after)
  ☑ IP + thiết bị
  ☐ Ghi chú lý do
```

## Retention policy

| Mức độ hành động    | Retention    |
| ------------------- | ------------ |
| Login / Logout      | 90 ngày      |
| Bán hàng thường     | 2 năm        |
| Giá / Công nợ       | 5 năm        |
| Cấu hình / Quyền    | Vĩnh viễn    |

Hiển thị banner top viewer: "Log trước 01/01/2025 đã archive. Tải từ Lịch sử Export."

## Component liên quan

- **AuditLogViewer** — page chính
- **AuditLogFilterPanel** — side panel lọc
- **AuditLogListItem** — 1 dòng card/row
- **AuditLogDetailDrawer** — drawer/modal chi tiết
- **AuditLogDiffView** — bảng field before/after
- **AuditLogTabPanel** — tab "Lịch sử" trong entity detail
- **AuditExportDialog** — modal xuất file

## Edge cases

| Tình huống                        | Xử lý                                        |
| --------------------------------- | -------------------------------------------- |
| Log offline (khi POS offline)     | Lưu local, sync khi online, giữ timestamp local |
| User đã bị xóa                   | Hiển thị "Lan (đã nghỉ việc)" thay vì ẩn    |
| Entity bị xóa hard                | Giữ tên + SKU snapshot trong log            |
| 1 action tạo nhiều log (cascade)  | Group thành 1 entry cha + list entry con    |
| Owner xem log của chính mình       | Không filter — vẫn thấy đầy đủ              |
| Staff cố truy cập audit page      | 403 redirect, log lại attempt               |

## Phím tắt (Desktop)

| Phím       | Hành động                  |
| ---------- | -------------------------- |
| `Ctrl+L`   | Mở Audit Log Viewer        |
| `F`        | Focus vào filter           |
| `/`        | Focus search               |
| `↑↓`       | Navigate log entries       |
| `Enter`    | Mở detail log đang chọn    |
