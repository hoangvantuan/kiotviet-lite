#!/bin/bash
# 1. purchase-order-form.tsx
sed -i '' 's/{s.name} {s.phone ? `· ${s.phone}` : '"''"'}/{s.name} {s.phone ? `· ${formatPhone(s.phone)}` : '"''"'}/' apps/web/src/features/purchase-orders/purchase-order-form.tsx
sed -i '' 's/import { parseVnd/import { formatPhone } from '"'"'@kiotviet-lite\/shared'"'"'\nimport { parseVnd/' apps/web/src/features/purchase-orders/purchase-order-form.tsx

# 2. supplier-manager.tsx
sed -i '' 's/{it.phone ?? '"'"'—'"'"'}/{it.phone ? formatPhone(it.phone) : '"'"'—'"'"'}/' apps/web/src/features/suppliers/supplier-manager.tsx
sed -i '' 's/{s.phone ?? '"'"'—'"'"'}/{s.phone ? formatPhone(s.phone) : '"'"'—'"'"'}/g' apps/web/src/features/suppliers/supplier-manager.tsx
sed -i '' 's/import { useDebounced/import { formatPhone } from '"'"'@kiotviet-lite\/shared'"'"'\nimport { useDebounced/' apps/web/src/features/suppliers/supplier-manager.tsx

# 3. purchase-order-detail-view.tsx
sed -i '' 's/{order.supplier.phone}/{formatPhone(order.supplier.phone)}/' apps/web/src/features/purchase-orders/purchase-order-detail-view.tsx
sed -i '' 's/import { formatDateTime/import { formatPhone } from '"'"'@kiotviet-lite\/shared'"'"'\nimport { formatDateTime/' apps/web/src/features/purchase-orders/purchase-order-detail-view.tsx
