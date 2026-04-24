# Return Dialog Specification

Liên quan FR46-FR51 (Hóa đơn / Trả hàng). Vá lỗ hổng Medium severity từ Implementation Readiness Report 2026-04-18.

## Mục tiêu

`ReturnDialog` đã có trong Component Strategy nhưng thiếu chi tiết: field nào editable, flow nào cho trả 1 phần, xử lý hoàn tiền vs. giảm nợ vs. đổi hàng.

## Các loại trả hàng

| Loại           | Mô tả                              | Tần suất | Complexity |
| -------------- | ---------------------------------- | -------- | ---------- |
| **Trả toàn bộ** | KH mang full đơn về trả            | Thấp     | Đơn giản   |
| **Trả 1 phần** | Chỉ trả vài SP trong đơn           | Cao      | Trung bình |
| **Đổi hàng**   | Trả SP A, lấy SP B (cùng giá/khác)| Trung    | Cao        |
| **Bảo hành**   | Trả SP lỗi, đổi SP mới cùng loại   | Thấp     | Trung bình |

## Entry point

**Từ chi tiết đơn hàng:**

```
┌─────────────────────────────────┐
│  Đơn hàng #1234                 │
│  KH: Anh Ba                     │
│  Tổng: 450.000đ                 │
│  ...                            │
│  [Trả hàng] [In lại] [Xóa]     │
└─────────────────────────────────┘
```

- Nút "Trả hàng" chỉ hiện với role Owner/Manager (FR51)
- Staff có quyền `can_return` cần duyệt bởi Owner

**Từ trang KH:**

- Tab "Đơn hàng" của KH → swipe left trên đơn → "Trả hàng"

## Return Dialog Layout

**Mobile (full screen):**

```
┌───────────────────────────────────────────┐
│  ← Trả hàng đơn #1234          [Lịch sử]  │
├───────────────────────────────────────────┤
│  KH: Anh Ba     │ Ngày bán: 20/04/2026    │
│  Tổng đã bán: 450.000đ (3 SP)             │
├───────────────────────────────────────────┤
│  Chọn SP trả                              │
│                                           │
│  ☑ Cà phê G7                              │
│    Đã bán: 5  │ Trả: [3] ▼               │
│    Giá: 75.000đ × 3 = 225.000đ           │
│    Lý do: [Hư hỏng ▼]                     │
│                                           │
│  ☐ Mì tôm                                 │
│    Đã bán: 10 │ Trả: 0                    │
│                                           │
│  ☑ Bánh mì                                │
│    Đã bán: 2  │ Trả: [2] ▼               │
│    Giá: 10.000đ × 2 = 20.000đ             │
│    Lý do: [Sai mẫu ▼]                    │
├───────────────────────────────────────────┤
│  Tổng trả: 245.000đ                       │
│                                           │
│  Cách hoàn trả                            │
│  (•) Tiền mặt                             │
│  ( ) Chuyển khoản                         │
│  ( ) Trừ vào công nợ (còn nợ 5tr)         │
│  ( ) Đổi sang SP khác                     │
│                                           │
│  Ghi chú: [_____________________]         │
├───────────────────────────────────────────┤
│         [Hủy]    [Xác nhận trả]           │
└───────────────────────────────────────────┘
```

## Field specification

### Fields READ-ONLY

| Field           | Nguồn             | Hiển thị                       |
| --------------- | ----------------- | ------------------------------ |
| Mã đơn          | orders.order_no   | "#1234"                        |
| Tên KH          | customers.name    | "Anh Ba"                       |
| Ngày bán        | orders.created_at | "20/04/2026 14:30"             |
| Tổng đã bán     | orders.total      | "450.000đ (3 SP)"              |
| Giá đơn vị      | order_items.price | Giữ giá lúc bán, KHÔNG đổi     |
| Đã bán (SL)     | order_items.qty   | Upper bound cho SL trả         |

### Fields EDITABLE

| Field               | Kiểu                      | Validation                             |
| ------------------- | ------------------------- | -------------------------------------- |
| Chọn SP trả         | Checkbox per item         | Ít nhất 1 SP                           |
| SL trả              | Number stepper            | 1 ≤ SL ≤ qty đã bán                    |
| Lý do trả           | Dropdown (predefined)     | Bắt buộc nếu SL > 0                    |
| Cách hoàn           | Radio (4 options)         | Bắt buộc chọn                          |
| Ghi chú             | Textarea (optional)       | Max 500 ký tự                          |
| SP đổi (nếu có)     | Product search + qty      | Chỉ hiện khi chọn "Đổi sang SP khác"   |

### Lý do trả (predefined)

```
- Hư hỏng, lỗi nhà SX
- Sai mẫu / khác mô tả
- KH đổi ý
- Quá hạn / ôi thiu
- Thừa SP
- Hàng bảo hành
- Khác (cần ghi chú)
```

## Cách hoàn trả chi tiết

### 1. Tiền mặt

- Hiển thị ngay số tiền trả: "Trả KH 245.000đ tiền mặt"
- Modal xác nhận: "Giao tiền cho KH trước khi xác nhận"
- Update cash drawer (nếu có tích hợp)

### 2. Chuyển khoản

- Hiển thị QR code + số tài khoản để chủ cửa hàng chuyển
- Nhập mã tham chiếu giao dịch (tùy chọn)
- Flow async: đánh dấu "Chờ chuyển" → Owner xác nhận sau

### 3. Trừ vào công nợ

**Điều kiện:** KH có công nợ > 0 hoặc có hạn mức nợ.

```
Công nợ hiện tại: 5.000.000đ
Trừ trả hàng: -245.000đ
Công nợ mới: 4.755.000đ
```

- Apply FIFO: trừ vào hóa đơn nợ cũ nhất trước (giống flow thu nợ)
- Log: "Trả hàng đơn #1234 → giảm nợ hóa đơn #1100"

### 4. Đổi sang SP khác

Section mở rộng:

```
┌─────────────────────────────────────┐
│  SP đổi sang                        │
│  🔍 [Tìm SP...]                    │
│                                     │
│  SP đã chọn:                        │
│  • Áo thun XL × 2 — 160.000đ        │
│                                     │
│  Chênh lệch                         │
│  Trả: 245.000đ → Đổi: 160.000đ      │
│  KH nhận lại: 85.000đ (tiền mặt)    │
└─────────────────────────────────────┘
```

**3 trường hợp chênh lệch:**

- Trả > Đổi → hoàn tiền thừa (radio cách hoàn)
- Trả = Đổi → không cần tiền thêm
- Trả < Đổi → KH trả thêm (mở payment dialog)

## Validation + Guards

| Rule                                        | Xử lý                                                |
| ------------------------------------------- | ---------------------------------------------------- |
| Đơn đã trả toàn bộ rồi                      | Disable nút "Trả hàng", hiện badge "Đã trả"          |
| SP trong đơn đã trả 1 phần                  | "Đã trả 2/5, còn trả được tối đa 3"                  |
| Đơn > 30 ngày                               | Warning "Đơn quá hạn trả, cần Owner duyệt"           |
| SP giá đã đổi (không còn bán)               | Giữ giá lúc bán, không dùng giá hiện tại             |
| Trả SP đổi sang SP giá dưới vốn             | Cần PIN Owner                                        |
| Đang offline                                | "Lưu local, đồng bộ khi có mạng" (icon pending)      |
| Số tiền trả > tiền mặt trong két            | Warning, vẫn cho phép nhưng ghi nợ két               |

## Confirmation flow

Sau khi user bấm "Xác nhận trả":

```
┌─────────────────────────────────────┐
│  Xác nhận trả hàng                  │
├─────────────────────────────────────┤
│  Đơn #1234 — KH Anh Ba              │
│                                     │
│  • Cà phê G7 × 3 — 225.000đ         │
│  • Bánh mì × 2 — 20.000đ            │
│                                     │
│  Tổng trả: 245.000đ                 │
│  Hoàn: Tiền mặt                     │
│                                     │
│  Thao tác này KHÔNG thể hoàn tác.   │
├─────────────────────────────────────┤
│      [Quay lại]  [Xác nhận trả]    │
└─────────────────────────────────────┘
```

## Sau xác nhận

**Actions tự động:**

1. Tạo `return_record` (có mã: `RT-1234-01`)
2. Cập nhật tồn kho: +SL trả (inventory_transactions)
3. Cập nhật công nợ KH (nếu cần)
4. Ghi audit log (FR65-67)
5. Gen phiếu trả hàng in được (thermal + A4)

**Feedback:**

- Toast xanh: "Đã trả hàng thành công — Mã RT-1234-01"
- CTA: [In phiếu trả hàng] [Xem đơn gốc] [Đóng]

## Component liên quan

- **ReturnDialog** — dialog chính (bottom sheet mobile, modal desktop)
- **ReturnItemRow** — 1 dòng SP với checkbox + SL stepper + lý do
- **ReturnReasonDropdown** — dropdown lý do predefined
- **ReturnRefundMethodPicker** — radio 4 options hoàn trả
- **ProductExchangePanel** — section đổi sang SP khác
- **ReturnReceiptTemplate** — template in phiếu trả (variant của InvoicePrintTemplate)

## Edge cases

| Tình huống                        | Xử lý                                             |
| --------------------------------- | ------------------------------------------------- |
| KH mất hóa đơn, chỉ nhớ số đơn   | Tìm đơn theo số, SĐT KH, hoặc ngày mua            |
| Trả khi đã qua đợt chốt sổ        | Owner PIN bắt buộc, log đặc biệt                  |
| SP đã bị xóa khỏi catalog         | Hiện tên cũ + badge "SP đã ngừng"                 |
| Đơn có áp CK toàn đơn             | Tính tỷ lệ, trả đúng phần sau CK                  |
| KH mua bằng voucher/coupon         | V1: không hỗ trợ (giữ đơn giản, note trong scope) |
| Trả hàng trên POS đang có đơn mới | Hỏi "Lưu nháp đơn hiện tại?" trước khi vào return |

## Phím tắt (Desktop)

| Phím         | Hành động                        |
| ------------ | -------------------------------- |
| `Space`      | Toggle checkbox SP đang focus    |
| `+/-`        | Tăng/giảm SL trả                 |
| `1/2/3/4`    | Chọn cách hoàn trả               |
| `Ctrl+Enter` | Xác nhận trả                     |
| `Esc`        | Hủy, quay lại chi tiết đơn       |
