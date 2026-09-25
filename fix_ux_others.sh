#!/bin/bash

# UX-22: Action labels
sed -i '' 's/auditActionSchema = z.enum(\[/auditActionSchema = z.enum(\[\n  '"'"'login'"'"',/' packages/shared/src/schema/audit-log.ts
sed -i '' "s/export const ACTION_LABELS = {/export const ACTION_LABELS = {\n  login: 'Đăng nhập',/" apps/web/src/features/audit/action-labels.ts
sed -i '' "s/actions: \['auth.pin_failed', 'auth.pin_locked'\]/actions: \['login', 'auth.pin_failed', 'auth.pin_locked'\]/" apps/web/src/features/audit/action-labels.ts

# UX-24: Home page placeholder
sed -i '' 's/description="Dashboard tổng quan sẽ hiển thị khi có dữ liệu bán hàng."/description="Chào mừng đến với KiotViet Lite. Bạn có thể xem báo cáo chi tiết ở mục Báo cáo."/' apps/web/src/pages/home-page.tsx
sed -i '' 's/Chào mừng đến KiotViet Lite/Chào mừng đến với KiotViet Lite/' apps/web/src/pages/home-page.tsx

# UX-25: Dialog & Sheet Accessibility
sed -i '' 's/<DialogPrimitive.Close className/<DialogPrimitive.Close aria-label="Đóng" className/' apps/web/src/components/ui/dialog.tsx
sed -i '' 's/<SheetPrimitive.Close className/<SheetPrimitive.Close aria-label="Đóng" className/' apps/web/src/components/ui/sheet.tsx
sed -i '' 's/<Toaster /<Toaster closeButtonAriaLabel="Đóng" /' apps/web/src/router.tsx

# UX-25: purchase-order-form.tsx Accessibility
sed -i '' 's/<Input type="number" min={1} value={it.quantity}/<Input aria-label="Số lượng" type="number" min={1} value={it.quantity}/' apps/web/src/features/purchase-orders/purchase-order-form.tsx
sed -i '' 's/<CurrencyInput/<CurrencyInput aria-label="Giá trị" /' apps/web/src/features/purchase-orders/purchase-order-form.tsx
sed -i '' 's/<SelectTrigger className="w-20">/<SelectTrigger aria-label="Đơn vị" className="w-20">/g' apps/web/src/features/purchase-orders/purchase-order-form.tsx

# UX-25: ReportDateRangePicker.tsx
sed -i '' 's/<Input/<Input aria-label="Ngày" /' apps/web/src/features/reports/components/ReportDateRangePicker.tsx

