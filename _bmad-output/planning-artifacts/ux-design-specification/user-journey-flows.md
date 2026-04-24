# User Journey Flows

## Journey 1: Setup & Bán buôn (Chị Hoa)

**Entry:** Đăng ký mới → Setup cửa hàng → Import SP → Tạo bảng giá → Bán hàng đầu tiên

```mermaid
flowchart TD
    A[Mở web app] --> B[Đăng ký bằng SĐT + OTP]
    B --> C[Nhập tên cửa hàng + ngành hàng]
    C --> D{Có file SP Excel?}
    D -- Có --> E[Import Excel - map cột tự động]
    D -- Không --> F[Thêm SP thủ công]
    E --> G[Preview + xác nhận import]
    F --> G
    G --> H[Tạo nhóm KH: Lẻ / Buôn / ĐL]
    H --> I[Tạo bảng giá cho mỗi nhóm]
    I --> J[Thiết lập chain formula]
    J --> K[Thêm giá riêng KH nếu cần]
    K --> L[Mở POS - bán đơn đầu tiên]
    L --> M[Chọn KH buôn → giá tự áp]
    M --> N[Thanh toán / Ghi nợ]
    N --> O[In hóa đơn]
    O --> P[Xem Dashboard cuối ngày]
```

**Điểm UX quan trọng:**

- Step B: OTP qua SMS, không cần email
- Step C: Chỉ 2 field bắt buộc (tên cửa hàng, ngành), còn lại optional
- Step E: Drag-drop file, auto-detect columns, preview trước khi commit
- Step J: UI preview cascade "Giá gốc 100k → Buôn 85k → ĐL C1 80k → ĐL C2 82k"

## Journey 2: Bán lẻ nhanh + Offline (Lan)

**Entry:** Mở POS → Quét/tìm SP → Thanh toán → Offline seamless

```mermaid
flowchart TD
    A[Mở POS trên điện thoại] --> B[Màn hình sẵn sàng: search + grid]
    B --> C{Cách thêm SP?}
    C -- Quét barcode --> D[Camera mở → quét → SP tự thêm]
    C -- Gõ tên --> E[Autocomplete < 200ms → chọn]
    C -- Chọn grid --> F[Tap SP từ grid ảnh]
    D --> G[SP trong giỏ, giá bán lẻ auto]
    E --> G
    F --> G
    G --> H{Thêm SP nữa?}
    H -- Có --> C
    H -- Không --> I[Tap 'Thanh toán']
    I --> J[Nhập tiền mặt → hiện tiền thừa]
    J --> K[In hóa đơn]
    K --> L[Đơn mới tự mở]

    M[Wifi mất giữa chừng] -.-> N[Icon offline nhỏ xuất hiện]
    N -.-> O[Bán bình thường, đơn đánh dấu pending]
    O -.-> P[Wifi có lại → auto sync]
    P -.-> Q[Icon offline biến mất]
```

**Điểm UX quan trọng:**

- Step B: Không loading screen, POS sẵn sàng ngay (cached)
- Step D: Camera mở nhanh, quét liên tục (không cần bấm mỗi lần)
- Step G: Giỏ hàng kéo lên từ dưới (mobile), bên phải (tablet/desktop)
- Offline flow: Chỉ 1 icon nhỏ thay đổi, không popup/modal/warning

## Journey 3: Nhập hàng & Quản lý giá (Chị Hoa)

```mermaid
flowchart TD
    A[Tạo phiếu nhập kho] --> B[Chọn NCC]
    B --> C[Quét/tìm SP + nhập SL + giá nhập mới]
    C --> D[Hệ thống tính giá vốn BQ mới]
    D --> E{Chế độ cảnh báo giá?}
    E -- Cảnh báo --> F[Thông báo: 'Giá vốn tăng 8.1%']
    E -- Tự động --> G[Cascade tự cập nhật]
    E -- Thủ công --> H[Không làm gì, chờ user]
    F --> I[Preview cascade: giá mới cho mỗi bảng giá]
    I --> J{Xác nhận thay đổi?}
    J -- Có --> K[Cập nhật giá + lưu lịch sử]
    J -- Sửa --> L[Điều chỉnh giá gốc mới]
    L --> I
    K --> M[Thanh toán NCC: trả 1 phần / ghi nợ]
```

## Journey 4: Công nợ — Thu nợ KH (Lan + Chị Hoa)

```mermaid
flowchart TD
    A[KH đến trả nợ] --> B[Tìm KH trên POS]
    B --> C[Tab Công nợ: tổng nợ + DS hóa đơn]
    C --> D[Nhập số tiền thu]
    D --> E{Phân bổ?}
    E -- FIFO tự động --> F[Hệ thống phân bổ từ HĐ cũ nhất]
    E -- Chọn thủ công --> G[User chọn HĐ cụ thể]
    F --> H[Preview: HĐ nào trả hết, HĐ nào còn dư]
    G --> H
    H --> I[Xác nhận + In phiếu thu]
    I --> J{KH muốn mua thêm?}
    J -- Có --> K[Check hạn mức nợ]
    K --> L{Trong hạn mức?}
    L -- Có --> M[Bán + ghi nợ bình thường]
    L -- Không --> N[Block → Cần PIN Owner]
    N --> O{Owner approve?}
    O -- Có --> M
    O -- Không --> P[Yêu cầu thanh toán bớt]
```

## Pattern chung giữa các Journey

**Navigation:** Bottom tab → module chính. Detail page → back arrow phía trên.

**Feedback:**

- Thành công: Toast xanh lá ở top, tự biến mất sau 3s
- Lỗi: Toast đỏ + mô tả + gợi ý sửa, cần bấm dismiss
- Cảnh báo: Banner vàng trên đầu trang, có nút action

**Decision Points:**

- Hành động nhẹ: inline confirmation (toggle, switch)
- Hành động quan trọng: bottom sheet confirmation (ghi nợ, trả hàng)
- Hành động nguy hiểm: PIN xác nhận (sửa giá dưới vốn, override hạn mức)

---
