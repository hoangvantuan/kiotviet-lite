# Báo Cáo Kỹ Thuật: Cho Phép Đồng Bộ Ngoại Tuyến Đơn Hàng Vượt Hạn Mức Nợ Kèm Cảnh Báo

- **Mã nhiệm vụ**: T2b
- **Mục tiêu**: Khi bán hàng ngoại tuyến (offline), thiết bị không nắm được nợ cập nhật của khách hàng từ máy chủ. Do đó khi đồng bộ trực tuyến trở lại (offline sync), nếu đơn hàng vượt hạn mức công nợ của khách hàng, hệ thống không từ chối (tránh mất đơn của người bán) mà vẫn tạo đơn, ghi nợ đầy đủ, đồng thời đánh dấu `debtLimitExceeded = true`, ghi nhật ký kiểm toán (audit log) hành động `order.debt_limit_exceeded`, phát thông báo cảnh báo mức `warn` và hiển thị chỉ dấu rõ ràng trên giao diện người dùng.

---

## 1. Phân Tích Nhân Duyên Quả

### Quả (Hiện tượng trước thay đổi)

- Đơn hàng bán khi mất mạng (offline) với khách hàng ghi nợ, khi khôi phục mạng và gửi đồng bộ đẩy (sync push) lên máy chủ, nếu tổng nợ vượt hạn mức công nợ (`debtLimit`) và không nhập mã PIN tại thời điểm ngoại tuyến, máy chủ từ chối tạo đơn với lỗi `BUSINESS_RULE_VIOLATION`.
- Hệ quả: Hàng đã giao cho khách tại cửa hàng nhưng trên máy chủ đơn hàng bị lỗi đồng bộ, doanh thu và tồn kho không được cập nhật, gây sai lệch số liệu kế toán và tồn kho thực tế.

### Nhân (Nguyên nhân cốt lõi)

- Hàm tạo đơn hàng `createOrder` áp dụng cùng một chính sách từ chối nghiêm ngặt cho cả nguồn bán trực tiếp (`source: 'pos'`) và nguồn đồng bộ ngoại tuyến (`source: 'offline_sync'`).

### Duyên (Bối cảnh và điều kiện phát sinh)

- Chế độ bán hàng ngoại tuyến (offline) trên máy tính/điện thoại chỉ lưu dữ liệu cục bộ (IndexedDB / PGlite trong trình duyệt), không thể xác thực trực tiếp mã PIN của chủ cửa hàng từ xa cũng như không thể biết khách hàng vừa mua nợ ở thiết bị khác hay chưa.
- Việc từ chối đơn hàng khi đồng bộ ngoại tuyến là hành động nghịch lý trong kinh doanh bán lẻ vì giao dịch vật lý đã hoàn tất ngoài đời thực.

---

## 2. Giải Pháp và Cấu Trúc Thực Hiện

```
┌─────────────────────────────────────────────────────────────┐
│                    Nguồn tạo đơn hàng                       │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
       [source = 'pos']             [source = 'offline_sync']
               │                              │
        Vượt hạn mức nợ?               Vượt hạn mức nợ?
        Có PIN override?               Có PIN override?
         /          \                   /           \
     (Có PIN)     (Không PIN)       (Có PIN)     (Không PIN)
        │              │                │             │
  Ghi nhận nợ     Từ chối (422)    Ghi nhận nợ   Ghi nhận nợ
  Audit:          Lỗi kinh doanh   Audit:        Đánh dấu:
  debt.limit_                      debt.limit_   debtLimitExceeded=true
  overridden                       overridden    Audit:
                                                 order.debt_limit_exceeded
                                                 Phát thông báo:
                                                 order.debt_limit_exceeded
```

### Các thay đổi chính:

1. **Cơ sở dữ liệu và Lược đồ dữ liệu (Schema & Database)**:
   - `packages/shared/src/schema/orders.ts`: Bổ sung cột `debtLimitExceeded: boolean().notNull().default(false)` vào bảng `orders`.
   - `packages/shared/src/schema/audit-log.ts`: Thêm hành động `'order.debt_limit_exceeded'` vào danh sách kiểm toán `auditActionSchema`.
   - `packages/shared/src/schema/notifications.ts`: Thêm loại sự kiện `'order.debt_limit_exceeded'` vào `notificationTypeValues`.
   - `packages/shared/src/schema/customer-management.ts`: Thêm trường `debtLimitExceeded: z.boolean().default(false)` vào `customerOrderItemSchema`.
   - `apps/api/src/db/migrations/0032_order_debt_limit_exceeded.sql`: Tệp chuyển đổi cơ sở dữ liệu thêm cột `debt_limit_exceeded` và mở rộng kiểu liệt kê `notification_type`.

2. **Dịch vụ Đơn hàng và Đồng bộ (Backend Service & Routes)**:
   - `apps/api/src/services/orders.service.ts`:
     - Phân nhánh rõ ràng trong hàm `createOrder`: Nếu có PIN override (`debtLimitOverridden: true`), ghi nhật ký `debt.limit_overridden`. Nếu không có PIN và `source === 'pos'`, từ chối giao dịch với mã lỗi `BUSINESS_RULE_VIOLATION`. Nếu không có PIN và `source === 'offline_sync'`, cập nhật `debtLimitExceeded = true`, ghi nhật ký `order.debt_limit_exceeded` với đầy đủ bối cảnh (mã đơn, mã khách hàng, hạn mức, nợ trước, nợ sau, số tiền vượt, người bán, thời điểm bán ngoại tuyến), và phát sự kiện thông báo cảnh báo `order.debt_limit_exceeded`.
     - Cập nhật hàm `listOrders` và `getOrderDetail` trả về trường `debtLimitExceeded`.
   - `apps/api/src/routes/sync.routes.ts`: Truyền `offlineCreatedAt: offlineOrder.createdAt` khi gọi `createOrder`.
   - `apps/api/src/services/customers.service.ts`: Bổ sung `orders.debtLimitExceeded` vào truy vấn lịch sử đơn hàng của khách hàng trong hàm `listCustomerOrders`.

3. **Giao diện Người dùng (Frontend)**:
   - `apps/web/src/features/audit/action-labels.ts`: Thêm nhãn tiếng Việt `Đơn ngoại tuyến vượt hạn mức nợ` và xếp vào nhóm kiểm toán `Công nợ`.
   - `apps/web/src/features/orders/orders-api.ts`: Cập nhật kiểu dữ liệu `OrderListItem` và `OrderDetailResponse` có `debtLimitExceeded?: boolean`.
   - `apps/web/src/features/orders/order-list.tsx`: Hiển thị huy hiệu `Vượt hạn mức` bên cạnh mã đơn hàng trên bảng máy tính và thẻ di động.
   - `apps/web/src/features/orders/order-detail-view.tsx`: Hiển thị huy hiệu `Vượt hạn mức nợ (Offline)` cạnh tiêu đề và hộp thông báo cảnh báo màu vàng nổi bật.
   - `apps/web/src/features/customers/components/CustomerOrdersTab.tsx`: Hiển thị huy hiệu `Vượt hạn mức` trong danh sách đơn hàng đã mua của khách hàng.

---

## 3. Danh Sách Tệp Thay Đổi

| Đường dẫn tệp                                                      | Loại thay đổi | Nội dung chính                                           |
| :----------------------------------------------------------------- | :------------ | :------------------------------------------------------- |
| `packages/shared/src/schema/orders.ts`                             | Chỉnh sửa     | Thêm cột `debtLimitExceeded`                             |
| `packages/shared/src/schema/audit-log.ts`                          | Chỉnh sửa     | Thêm action `order.debt_limit_exceeded`                  |
| `packages/shared/src/schema/notifications.ts`                      | Chỉnh sửa     | Thêm type `order.debt_limit_exceeded`                    |
| `packages/shared/src/schema/customer-management.ts`                | Chỉnh sửa     | Thêm `debtLimitExceeded` vào schema đơn của khách        |
| `apps/api/src/db/migrations/0032_order_debt_limit_exceeded.sql`    | Tạo mới       | Di chuyển cơ sở dữ liệu (Migration)                      |
| `apps/api/src/db/migrations/meta/_journal.json`                    | Chỉnh sửa     | Đăng ký di chuyển idx 32                                 |
| `apps/api/src/services/orders.service.ts`                          | Chỉnh sửa     | Logic kiểm tra nợ, ghi audit, emitEvent và trả về trường |
| `apps/api/src/routes/sync.routes.ts`                               | Chỉnh sửa     | Truyền `offlineCreatedAt` khi sync                       |
| `apps/api/src/services/customers.service.ts`                       | Chỉnh sửa     | Thêm `debtLimitExceeded` trong `listCustomerOrders`      |
| `apps/web/src/features/audit/action-labels.ts`                     | Chỉnh sửa     | Thêm nhãn tiếng Việt cho audit log                       |
| `apps/web/src/features/orders/orders-api.ts`                       | Chỉnh sửa     | Cập nhật TypeScript interface                            |
| `apps/web/src/features/orders/order-list.tsx`                      | Chỉnh sửa     | Hiển thị nhãn trên danh sách đơn                         |
| `apps/web/src/features/orders/order-detail-view.tsx`               | Chỉnh sửa     | Hiển thị nhãn và cảnh báo chi tiết đơn                   |
| `apps/web/src/features/customers/components/CustomerOrdersTab.tsx` | Chỉnh sửa     | Hiển thị nhãn trong tab đơn của khách                    |
| `apps/api/src/__tests__/t2b-no-offline.integration.test.ts`        | Tạo mới       | Bộ kiểm thử tích hợp chuyên biệt cho task T2b            |
| `apps/api/src/__tests__/sync-orders-h8-m26.integration.test.ts`    | Chỉnh sửa     | Cập nhật các trường hợp kiểm thử đồng bộ nợ              |
| `apps/api/src/__tests__/notifications-events.integration.test.ts`  | Chỉnh sửa     | Cập nhật 8 default notification rules                    |

---

## 4. Kết Quả Kiểm Thử (Verification)

1. **Kiểm thử tích hợp chuyên biệt (`t2b-no-offline.integration.test.ts`)**:
   - `5/5 tests passed`
   - Đơn ngoại tuyến vượt hạn mức không có PIN: Đồng bộ thành công, đơn tạo thành công, nợ ghi đúng.
   - Bản ghi kiểm toán `order.debt_limit_exceeded` và thông báo cảnh báo phát ra chính xác.
   - Đơn POS trực tiếp vượt hạn mức không có PIN: Bị từ chối lỗi `BUSINESS_RULE_VIOLATION`.
   - Đơn ngoại tuyến trong hạn mức: Không phát sinh cảnh báo thừa.
   - Truy vấn (`listOrders`, `getOrderDetail`, `listCustomerOrders`) trả về đúng `debtLimitExceeded: true`.

2. **Kiểm thử liên đới**:
   - `sync-orders-h8-m26.integration.test.ts`: `9/9 tests passed`
   - `pos-debt.integration.test.ts`: `17/17 tests passed`
   - `notifications-events.integration.test.ts`: `8/8 tests passed`

3. **Kiểm tra chất lượng mã nguồn toàn dự án**:
   - `pnpm lint`: Đạt chuẩn (0 error).
   - `pnpm -r typecheck`: Đạt chuẩn cho tất cả các gói (`packages/shared`, `packages/notifications`, `apps/web`, `apps/api`).
   - `pnpm -r build`: Biên dịch thành công cho toàn bộ ứng dụng web và máy chủ API.
