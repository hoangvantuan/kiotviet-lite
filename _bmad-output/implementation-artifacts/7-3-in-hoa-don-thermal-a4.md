# Story 7.3: In hóa đơn Thermal & A4

Status: ready-for-dev

## Story

As a nhân viên bán hàng,
I want in hóa đơn bằng máy in nhiệt hoặc giấy A4/A5,
so that cung cấp hóa đơn chuyên nghiệp cho khách hàng.

## Acceptance Criteria (BDD)

### AC1: In thermal qua Web Serial API + ESC/POS binary (58mm/80mm)

**Given** máy tính kết nối thermal printer qua Web Serial API
**When** nhân viên bấm "In hóa đơn" (từ OrderCompletionDialog hoặc nút "In lại" trên chi tiết HĐ)
**Then** gửi lệnh ESC/POS binary theo thứ tự:

1. `ESC @` (initialize printer)
2. Logo (nếu có, ESC/POS raster image command)
3. Tên cửa hàng (bold, center, double height)
4. Slogan (center, normal)
5. Dòng kẻ `================================`
6. Mã HĐ + ngày tạo
7. Tên KH + SĐT (nếu có)
8. Dòng kẻ
9. Danh sách SP: tên, SL x đơn giá, thành tiền
10. Dòng kẻ
11. Tổng tiền hàng, CK (nếu có), tổng thanh toán
12. Phương thức thanh toán + số tiền
13. Tiền thừa (nếu có)
14. Nợ cũ/mới (nếu bật trong print_settings, Story 7.4)
15. Ghi chú cuối (footer_text từ print_settings)
16. `GS V` (cut paper)

**And** thermal 58mm: 32 ký tự/dòng, 1 cột SP (tên dòng 1, SL x giá + thành tiền dòng 2)
**And** thermal 80mm: 48 ký tự/dòng, bố cục rộng hơn, thêm cột CK
**And** nếu in lại: thêm dòng "*** BẢN IN LẠI ***" (bold, center) ngay sau logo
**And** device ID lưu vào localStorage cho auto-reconnect lần sau

### AC2: Fallback CSS @media print khi thermal không kết nối

**Given** thermal printer không kết nối được (chưa pair, lỗi, hoặc browser không hỗ trợ Web Serial)
**When** nhân viên bấm "In hóa đơn"
**Then** fallback tự động: render invoice HTML với CSS `@media print` + gọi `window.print()`
**And** toast cảnh báo: "Máy in nhiệt không kết nối, đang in qua trình duyệt"

**And** error handling theo UX spec:

| Lỗi | Hiển thị | Hành động |
|-----|----------|-----------|
| Máy in không phản hồi | Toast warning "Máy in không phản hồi" | [Thử lại] [In qua trình duyệt] |
| Hết giấy | Toast "Hết giấy. Nạp giấy rồi thử lại" | [Thử lại] |
| Mất kết nối giữa lúc in | Toast error "Mất kết nối máy in" | Tự động retry 1 lần |
| Web Serial không hỗ trợ (Safari, Firefox) | Auto-fallback browser print | Banner info "Trình duyệt không hỗ trợ in trực tiếp" |
| User từ chối permission | Toast info "Bạn có thể kết nối máy in sau tại Cài đặt > Máy in" | Fallback browser print |

### AC3: In A4/A5 qua CSS Print

**Given** khách buôn cần hóa đơn A4 hoặc A5
**When** nhân viên chọn "In A4/A5" (dropdown cạnh nút In)
**Then** render HTML template với CSS `@media print`:

**Layout A4:**

- Header: logo (trái) + tên cửa hàng + địa chỉ + SĐT (phải)
- Tiêu đề: "HÓA ĐƠN BÁN HÀNG" (center, bold)
- Thông tin: Mã HĐ, ngày, tên KH, SĐT, địa chỉ KH
- Bảng SP đầy đủ: STT, tên SP, ĐVT, SL, đơn giá, CK, thành tiền
- Footer bảng: tạm tính, CK đơn, tổng thanh toán
- Tổng bằng chữ: "Bằng chữ: Một triệu hai trăm nghìn đồng"
- Thanh toán: phương thức, đã trả, còn nợ
- Khu vực ký tên: 2 cột (Người mua hàng, Người bán hàng) với "(ký, họ tên)"
- Nếu in lại: watermark hoặc dòng "BẢN IN LẠI" ở header

**And** A5: layout tương tự A4 nhưng `@page { size: A5 }`, font nhỏ hơn
**And** gọi `window.print()` sau khi render

### AC4: Offline hoạt động

**Given** hệ thống đang offline (không có internet)
**When** nhân viên in hóa đơn (thermal hoặc A4/A5)
**Then** in vẫn hoạt động bình thường vì:

- Template render hoàn toàn client-side (React component)
- Dữ liệu order đã có sẵn trong TanStack Query cache
- Logo (nếu có) đã cache trong Service Worker
- Web Serial API hoạt động local, không cần internet

## Tasks / Subtasks

- [ ] Task 1: Tạo ESC/POS protocol utility (AC: #1)
  - [ ] 1.1: Tạo `apps/web/src/lib/thermal-printer.ts` với class `ThermalPrinter`
    - Constructor: `baudRate` (default 9600), `paperWidth` ('58mm' | '80mm')
    - Chứa ESC/POS command constants:
      - `ESC_INIT` = `[0x1B, 0x40]` (initialize)
      - `ESC_BOLD_ON` = `[0x1B, 0x45, 0x01]`
      - `ESC_BOLD_OFF` = `[0x1B, 0x45, 0x00]`
      - `ESC_CENTER` = `[0x1B, 0x61, 0x01]`
      - `ESC_LEFT` = `[0x1B, 0x61, 0x00]`
      - `ESC_DOUBLE_HEIGHT` = `[0x1B, 0x21, 0x10]`
      - `ESC_NORMAL` = `[0x1B, 0x21, 0x00]`
      - `GS_CUT` = `[0x1D, 0x56, 0x00]` (full cut)
      - `GS_PARTIAL_CUT` = `[0x1D, 0x56, 0x01]`
    - Helper methods: `text(str)`, `bold(str)`, `center(str)`, `line(char)`, `feed(n)`, `cut()`
    - `toBuffer(): Uint8Array` build toàn bộ print job thành binary
  - [ ] 1.2: Method `buildOrderReceipt(order, storeInfo, options)`:
    - `options`: `{ paperWidth, isReprint, showOldDebt, showNewDebt, showDiscount, footerText }`
    - Build ESC/POS buffer theo thứ tự AC1
    - 58mm: 32 chars/line, 2 dòng/SP (tên + SL x giá = thành tiền)
    - 80mm: 48 chars/line, 1 dòng/SP hoặc 2 dòng nếu tên dài, thêm cột CK
  - [ ] 1.3: Method `buildRasterImage(imageBlob): Uint8Array` cho logo
    - Canvas API resize logo xuống width phù hợp (384px cho 80mm, 272px cho 58mm)
    - Convert sang monochrome bitmap
    - Encode thành ESC/POS raster image command (`GS v 0`)
  - [ ] 1.4: Text encoding helper: Vietnamese UTF-8 → CP437 hoặc UTF-8 mode (`ESC t 255` nếu printer hỗ trợ)

- [ ] Task 2: Tạo Web Serial API service (AC: #1, #2)
  - [ ] 2.1: Tạo `apps/web/src/lib/serial-port.ts` với class `SerialPortService`
    - `isSupported(): boolean` check `'serial' in navigator`
    - `connect(): Promise<SerialPort>` trigger user gesture → `navigator.serial.requestPort()` → `port.open({ baudRate })`
    - `reconnect(): Promise<SerialPort>` dùng `navigator.serial.getPorts()` để auto-reconnect device đã pair
    - `send(data: Uint8Array): Promise<void>` write binary data qua `WritableStream`
    - `disconnect(): Promise<void>` close port
  - [ ] 2.2: Device persistence: lưu `lastPrinterId` vào localStorage
    - Khi reconnect: filter `getPorts()` theo device đã lưu
    - Nếu không tìm thấy: return null (trigger fallback)
  - [ ] 2.3: Error handling: wrap tất cả serial operations trong try-catch
    - `NotFoundError`: user cancel device picker → fallback
    - `NetworkError`: device disconnect → retry 1 lần → fallback
    - `InvalidStateError`: port already open → reuse
    - Timeout: 5s cho connect, 10s cho send → fallback

- [ ] Task 3: Tạo print orchestrator hook (AC: #1, #2, #3, #4)
  - [ ] 3.1: Tạo `apps/web/src/features/orders/use-print-order.ts` với hook `usePrintOrder()`
    - State: `status` ('idle' | 'connecting' | 'printing' | 'success' | 'error' | 'fallback')
    - Method `printOrder({ order, storeInfo, options })`:
      1. Check `SerialPortService.isSupported()`
      2. Nếu supported: try `reconnect()` hoặc `connect()`
      3. Build ESC/POS buffer via `ThermalPrinter.buildOrderReceipt()`
      4. Send buffer via `SerialPortService.send()`
      5. Nếu bất kỳ bước nào fail: fallback sang `printBrowserFallback()`
    - Method `printBrowserFallback()`: set CSS class → `window.print()` → toast info
    - Method `printA4({ order, storeInfo, options })`: luôn dùng `window.print()`
  - [ ] 3.2: Toast notifications dùng `sonner` (đã có trong project):
    - Success: "In hóa đơn thành công"
    - Fallback: "Máy in nhiệt không kết nối, đang in qua trình duyệt"
    - Error: "Lỗi in hóa đơn: {message}" với action buttons [Thử lại] [In qua trình duyệt]

- [ ] Task 4: Tạo print templates cho browser fallback (AC: #2, #3)
  - [ ] 4.1: Tạo `apps/web/src/features/orders/order-invoice-template.tsx`
    - Component `OrderInvoiceThermal`: layout thermal cho CSS print fallback
      - `hidden print:block` pattern (giống `ReceiptPrintTemplate`)
      - 58mm: `@page { size: 80mm auto; margin: 2mm }` (auto height)
      - 80mm: `@page { size: 80mm auto; margin: 3mm }`
      - Nội dung giống ESC/POS nhưng dùng HTML/CSS
    - Component `OrderInvoiceA4`: layout A4 cho in chính thức
      - `@page { size: A4; margin: 15mm }`
      - Header: logo + store info
      - Tiêu đề: HÓA ĐƠN BÁN HÀNG
      - Bảng SP: table full columns
      - Tổng bằng chữ: dùng helper `numberToVietnameseWords(amount)`
      - Khu vực ký tên
    - Component `OrderInvoiceA5`: layout A5
      - `@page { size: A5; margin: 10mm }`
      - Font nhỏ hơn A4, layout compact hơn
  - [ ] 4.2: Tạo `apps/web/src/lib/number-to-words.ts`
    - Function `numberToVietnameseWords(n: number): string`
    - Convert số sang tiếng Việt: 1,200,000 → "Một triệu hai trăm nghìn đồng"
    - Hỗ trợ đến hàng tỷ (đủ cho POS)
    - Edge cases: 0 → "Không đồng", số âm → prefix "Âm"
  - [ ] 4.3: CSS print styles trong `apps/web/src/index.css` (hoặc inline trong component):
    - `@media print { .no-print { display: none !important } }`
    - Hide sidebar, header, dialogs khi in
    - Chỉ hiển thị print template

- [ ] Task 5: Enable nút "In hóa đơn" và "In lại" (AC: #1, #2, #3)
  - [ ] 5.1: Cập nhật `OrderCompletionDialog.tsx`:
    - Bỏ `disabled` trên nút "In hoá đơn"
    - Bỏ `title="In hoá đơn sẽ kích hoạt ở Story 7.3"`
    - onClick: gọi `usePrintOrder().printOrder()` với thermal mặc định
    - Thêm dropdown arrow cho chọn: "In thermal" / "In A4" / "In A5"
  - [ ] 5.2: Cập nhật `order-detail-view.tsx`:
    - Bỏ `disabled` trên nút "In lại"
    - onClick: gọi `usePrintOrder().printOrder({ isReprint: true })`
    - Thêm dropdown: "In thermal" / "In A4" / "In A5"
    - Thêm `OrderInvoiceThermal` + `OrderInvoiceA4` + `OrderInvoiceA5` vào render (hidden, chỉ hiện khi print)
  - [ ] 5.3: Tạo `apps/web/src/features/orders/print-button.tsx`:
    - Component `PrintButton` reusable: nút chính "In" + dropdown chọn format
    - Props: `order`, `storeInfo`, `isReprint?`, `onSuccess?`
    - Dùng `DropdownMenu` từ shadcn/ui
    - Items: "In máy nhiệt 58mm", "In máy nhiệt 80mm", "In A4", "In A5"
    - Default action (click nút chính): in theo format mặc định (lấy từ localStorage hoặc thermal 58mm)

- [ ] Task 6: Lấy store info cho template (AC: #1, #3)
  - [ ] 6.1: Kiểm tra store info đã có trong auth store hoặc cần API mới
    - `useAuthStore` có `store` object với `name`, `address`, `phone`? Kiểm tra tại runtime
    - Nếu chưa có: thêm `storeInfo` vào auth store (load 1 lần khi login)
  - [ ] 6.2: Truyền `storeInfo` vào `usePrintOrder` và templates
    - Fallback nếu thiếu: hiển thị tên cửa hàng = "Cửa hàng", ẩn address/phone

- [ ] Task 7: Error handling & offline testing (AC: #2, #4)
  - [ ] 7.1: Xử lý edge cases:
    - Order data null/undefined → disable nút in, toast error
    - Store info incomplete → print với fallback values
    - Browser không hỗ trợ Web Serial → auto fallback, không hiện device picker
    - Logo fetch fail offline → print không logo
  - [ ] 7.2: Service Worker cache cho logo:
    - Kiểm tra SW hiện tại đã cache static assets chưa
    - Nếu logo là URL external: precache khi user upload (Story 7.4 scope)
    - Story này: nếu logo chưa có (print_settings chưa implement), skip logo
  - [ ] 7.3: Kiểm tra offline scenario:
    - TanStack Query cache giữ order data → in được
    - `window.print()` hoạt động offline → OK
    - Web Serial API hoạt động local → OK

## Technical Notes

### Web Serial API

- **Browser support**: Chrome 89+, Edge 89+, Opera 75+. KHÔNG hỗ trợ Safari, Firefox.
- **Yêu cầu user gesture**: `navigator.serial.requestPort()` PHẢI gọi từ click handler (không thể auto-trigger).
- **HTTPS required**: Web Serial chỉ hoạt động trên HTTPS hoặc localhost.
- **API flow**: `requestPort()` → `port.open({ baudRate })` → `port.writable.getWriter()` → `writer.write(data)` → `writer.releaseLock()` → `port.close()`

### ESC/POS Protocol

- Standard protocol cho thermal printers (Epson, HPRT, Xprinter, v.v.)
- Binary commands, KHÔNG phải text protocol
- Vietnamese text: nhiều printer hỗ trợ UTF-8 mode (`ESC t 255`). Fallback: encode CP437 cho ASCII, in Unicode qua raster image mode.
- Paper width: 58mm = 384 dots = 32 chars (12px font), 80mm = 576 dots = 48 chars (12px font)
- Logo: raster image `GS v 0` command, monochrome bitmap, max width = paper width in dots

### Offline Strategy

- Toàn bộ print logic chạy client-side, KHÔNG gọi API khi in
- Order data: đã có trong TanStack Query cache (loaded khi xem chi tiết)
- Store info: lưu trong auth store (loaded khi login)
- Print settings: Story 7.4 sẽ lưu vào localStorage/IndexedDB. Story này dùng defaults.
- Logo: Service Worker cache (nếu có). Story này không implement upload logo.

### numberToVietnameseWords

Quy tắc tiếng Việt cho đọc số:
- Hàng đơn vị: "không, một, hai, ba, bốn, năm, sáu, bảy, tám, chín"
- Đặc biệt: hàng chục = "mười", 10+ = "mười X", 20+ = "hai mươi X"
- "mốt" thay "một" khi hàng chục ≥ 2 (21 = "hai mươi mốt")
- "lăm" thay "năm" khi hàng chục ≥ 1 (15 = "mười lăm")
- "tư" thay "bốn" khi hàng chục ≥ 2 (24 = "hai mươi tư")
- Hàng: đơn vị, nghìn, triệu, tỷ
- Suffix: "đồng"

## Dependencies

### Story dependencies

- **Story 7-1** (done): Trang danh sách + chi tiết HĐ, nút "In lại" (disabled), `OrderDetailView`, API `GET /api/v1/orders/:id`
- **Story 7-2** (done): Trả hàng, cập nhật status badges, `ReturnDialog`
- **Story 7-4** (backlog): Cài đặt mẫu in (print_settings table, logo upload, template customization). Story 7.3 dùng default values, 7.4 sẽ bổ sung customization.

### Deferred from other stories

- OrderCompletionDialog nút "In hoá đơn" disabled since Story 3-3 (`title="In hoá đơn sẽ kích hoạt ở Story 7.3"`)
- OrderDetailView nút "In lại" disabled since Story 7-1

### External dependencies

- Web Serial API (Chrome 89+)
- ESC/POS compatible thermal printer (58mm hoặc 80mm)

## Definition of Done

- [ ] ESC/POS utility tạo binary buffer đúng cho thermal 58mm và 80mm
- [ ] Web Serial API connect, send, auto-reconnect hoạt động trên Chrome
- [ ] Fallback CSS print hoạt động khi không có thermal printer
- [ ] Template A4 render đúng: header, bảng SP, tổng bằng chữ, ký tên
- [ ] Template A5 render đúng (compact version A4)
- [ ] Nút "In hoá đơn" trong OrderCompletionDialog hoạt động (không còn disabled)
- [ ] Nút "In lại" trong OrderDetailView hoạt động với label "BẢN IN LẠI"
- [ ] Dropdown chọn format in: thermal 58mm/80mm, A4, A5
- [ ] Error handling: toast messages cho mọi error case trong bảng UX
- [ ] Offline: in thermal + browser print hoạt động khi mất mạng
- [ ] `numberToVietnameseWords` convert đúng (0 đến hàng tỷ)
- [ ] TypeScript compile clean: shared + api + web
- [ ] Không break test suite hiện tại

## Test Scenarios

### TS1: ESC/POS buffer generation (AC1)

- **TS1.1**: Build receipt 58mm với 3 SP → buffer chứa ESC_INIT + store name (bold, center) + 3 item blocks + totals + GS_CUT
- **TS1.2**: Build receipt 80mm với SP có tên dài → wrap text đúng ở 48 chars
- **TS1.3**: Build receipt isReprint=true → buffer chứa "*** BẢN IN LẠI ***" sau logo
- **TS1.4**: Build receipt với discountAmount > 0 → hiển thị dòng CK
- **TS1.5**: Build receipt với paymentStatus='partial' → hiển thị nợ cũ/mới (nếu bật)
- **TS1.6**: Vietnamese text encoding → UTF-8 bytes đúng cho "Đơn giá", "Chiết khấu"

### TS2: Web Serial API connection (AC1, AC2)

- **TS2.1**: `isSupported()` return true trên Chrome, false trên Firefox/Safari
- **TS2.2**: `connect()` success → lưu device ID vào localStorage
- **TS2.3**: `reconnect()` với device đã lưu → auto-connect không hiện picker
- **TS2.4**: `reconnect()` device không tìm thấy → return null
- **TS2.5**: `send()` fail NetworkError → retry 1 lần → throw nếu vẫn fail
- **TS2.6**: `connect()` user cancel picker → throw NotFoundError

### TS3: Print orchestrator (AC1, AC2, AC3)

- **TS3.1**: Browser hỗ trợ Serial + device paired → in thermal thành công
- **TS3.2**: Browser hỗ trợ Serial + device NOT paired → trigger picker → in
- **TS3.3**: Browser KHÔNG hỗ trợ Serial → auto fallback `window.print()` + toast
- **TS3.4**: Serial connect fail → fallback `window.print()` + toast error
- **TS3.5**: Chọn "In A4" → render A4 template + `window.print()` (không qua Serial)
- **TS3.6**: Chọn "In A5" → render A5 template + `window.print()`

### TS4: Browser print templates (AC2, AC3)

- **TS4.1**: OrderInvoiceThermal render: hidden bình thường, `print:block` khi in
- **TS4.2**: OrderInvoiceA4 render: header logo + store info, bảng SP, tổng bằng chữ, ký tên
- **TS4.3**: OrderInvoiceA5 render: layout compact, font nhỏ hơn A4
- **TS4.4**: OrderInvoiceA4 với KH = null → hiển thị "Khách lẻ"
- **TS4.5**: OrderInvoiceA4 isReprint → dòng "BẢN IN LẠI" ở header
- **TS4.6**: `@media print` hide sidebar, navigation, dialogs

### TS5: numberToVietnameseWords (AC3)

- **TS5.1**: `0` → "Không đồng"
- **TS5.2**: `1000` → "Một nghìn đồng"
- **TS5.3**: `1200000` → "Một triệu hai trăm nghìn đồng"
- **TS5.4**: `21000` → "Hai mươi mốt nghìn đồng"
- **TS5.5**: `15500` → "Mười lăm nghìn năm trăm đồng"
- **TS5.6**: `1000000000` → "Một tỷ đồng"
- **TS5.7**: `105000` → "Một trăm linh năm nghìn đồng"
- **TS5.8**: `400000` → "Bốn trăm nghìn đồng" (KHÔNG dùng "tư" cho hàng trăm)

### TS6: Offline (AC4)

- **TS6.1**: Disconnect network → bấm "In thermal" → gửi ESC/POS qua Serial thành công
- **TS6.2**: Disconnect network → bấm "In A4" → `window.print()` render đúng template
- **TS6.3**: Order data trong TanStack Query cache → available offline
- **TS6.4**: Logo cached bởi Service Worker → hiển thị trong print template offline

### TS7: Integration (AC1, AC2, AC3)

- **TS7.1**: OrderCompletionDialog nút "In hoá đơn" → in thermal mặc định
- **TS7.2**: OrderCompletionDialog dropdown → chọn "In A4" → in A4
- **TS7.3**: OrderDetailView nút "In lại" → in thermal với "BẢN IN LẠI"
- **TS7.4**: OrderDetailView dropdown → chọn "In A5" → in A5 với "BẢN IN LẠI"

## Dev Notes

### Codebase patterns BẮT BUỘC tuân thủ

**Frontend (story này 100% frontend, KHÔNG thay đổi backend):**

- Feature folder: thêm vào `apps/web/src/features/orders/` (KHÔNG tạo folder mới)
- Lib utilities: `apps/web/src/lib/` cho `thermal-printer.ts`, `serial-port.ts`, `number-to-words.ts`
- Styling: Tailwind CSS + shadcn/ui components ONLY
- Currency: `formatVnd`, `formatVndWithSuffix` từ `@/lib/currency`
- Date: `formatDateTime` pattern đã có trong `order-detail-view.tsx`
- Toast: `sonner` (đã có, dùng `toast()`, `toast.error()`, `toast.info()`)
- Dropdown: `DropdownMenu` từ `@/components/ui/dropdown-menu`

### Store info source

Kiểm tra `useAuthStore` tại runtime. Nếu đã có `store.name`, `store.address`, `store.phone` thì dùng trực tiếp. Nếu chưa có, xem xét mở rộng auth store hoặc tạo API `GET /api/v1/stores/me` (lightweight, chỉ 1 lần).

Pattern tham khảo: `ReceiptPrintTemplate` nhận `StoreInfo` props `{ name, address, phone }`.

### Print settings (default values cho Story 7.3)

Story 7.4 sẽ tạo bảng `print_settings` và UI tùy chỉnh. Story này dùng defaults:

```typescript
const DEFAULT_PRINT_OPTIONS = {
  paperWidth: '58mm' as const,
  showOldDebt: false,
  showNewDebt: true,
  showDiscount: true,
  showCostPrice: false,
  footerText: 'Cảm ơn quý khách!',
  logo: null, // Story 7.4 sẽ implement upload
  slogan: null,
}
```

Lưu lựa chọn format cuối cùng vào `localStorage` key `kv_print_default_format`.

### Existing print pattern trong codebase

`ReceiptPrintTemplate` (`apps/web/src/features/receipts/receipt-print-template.tsx`):
- Pattern: `hidden print:block print:p-4 print:font-sans print:text-black`
- Render inline, ẩn bình thường, hiện khi `window.print()`
- `receipt-detail-dialog.tsx` gọi `window.print()` trực tiếp

Giữ pattern này cho browser fallback templates.

### Web Serial API type declarations

TypeScript cần type cho Web Serial API (chưa có trong lib.dom.d.ts mặc định):

```typescript
// apps/web/src/types/web-serial.d.ts
interface SerialPort {
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  readonly writable: WritableStream<Uint8Array> | null
  readonly readable: ReadableStream<Uint8Array> | null
}

interface Serial {
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>
  getPorts(): Promise<SerialPort[]>
}

interface Navigator {
  readonly serial: Serial
}
```

Hoặc cài `@types/w3c-web-serial` nếu có trên npm.

### Files sẽ tạo mới

```
apps/web/src/lib/thermal-printer.ts          # ESC/POS protocol utility
apps/web/src/lib/serial-port.ts              # Web Serial API service
apps/web/src/lib/number-to-words.ts          # Số sang chữ tiếng Việt
apps/web/src/features/orders/use-print-order.ts    # Print orchestrator hook
apps/web/src/features/orders/order-invoice-template.tsx  # A4/A5/thermal print templates
apps/web/src/features/orders/print-button.tsx      # Reusable print button + dropdown
apps/web/src/types/web-serial.d.ts           # Web Serial API type declarations
```

### Files sẽ sửa

```
apps/web/src/features/pos/components/OrderCompletionDialog.tsx  # Enable nút "In hoá đơn"
apps/web/src/features/orders/order-detail-view.tsx              # Enable nút "In lại" + dropdown
apps/web/src/index.css                                          # @media print global styles (nếu cần)
```

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-7-ha-n-in-n.md#Story 7.3]
- [Source: _bmad-output/planning-artifacts/prd/functional-requirements.md#FR50]
- [Source: _bmad-output/planning-artifacts/prd/non-functional-requirements.md#NF14, NF17, NF18]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/thermal-printer-flow.md]
- [Source: apps/web/src/features/orders/order-detail-view.tsx]
- [Source: apps/web/src/features/pos/components/OrderCompletionDialog.tsx]
- [Source: apps/web/src/features/receipts/receipt-print-template.tsx]

## Dev Agent Record

### Agent Model Used

(chưa assign)

### Debug Log References

### Completion Notes List

### Change Log

### File List
