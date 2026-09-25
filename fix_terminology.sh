#!/bin/bash

# 1. nav-items.ts
sed -i '' "s/label: 'Hóa đơn'/label: 'Đơn hàng'/" apps/web/src/components/layout/nav-items.ts
sed -i '' "s/label: 'Hàng hóa'/label: 'Sản phẩm'/" apps/web/src/components/layout/nav-items.ts

# 2. order-list.tsx
sed -i '' "s/<h1 className=\"text-2xl font-semibold\">Hóa đơn<\/h1>/<h1 className=\"text-2xl font-semibold\">Đơn hàng<\/h1>/" apps/web/src/features/orders/order-list.tsx
sed -i '' "s/<p className=\"text-sm text-muted-foreground\">Danh sách hóa đơn bán hàng.<\/p>/<p className=\"text-sm text-muted-foreground\">Danh sách đơn hàng.<\/p>/" apps/web/src/features/orders/order-list.tsx
sed -i '' "s/placeholder=\"Tìm theo mã hóa đơn\"/placeholder=\"Tìm theo mã đơn hàng\"/" apps/web/src/features/orders/order-list.tsx
sed -i '' "s/<TableHead>Mã HĐ<\/TableHead>/<TableHead>Mã đơn hàng<\/TableHead>/" apps/web/src/features/orders/order-list.tsx

# 3. products-manager.tsx
sed -i '' "s/Quản lý danh sách hàng hoá của cửa hàng/Quản lý danh sách sản phẩm của cửa hàng/" apps/web/src/features/products/products-manager.tsx

# 4. DesktopCartTable.tsx
sed -i '' "s/>Tên hàng hóa</>Tên sản phẩm</" apps/web/src/features/pos/components/DesktopCartTable.tsx

# 5. PosSearchBar.tsx
sed -i '' "s/placeholder=\"Tìm sản phẩm, mã SKU, barcode...\"/placeholder=\"Tìm theo tên, mã hàng hoặc mã vạch\"/" apps/web/src/features/pos/components/PosSearchBar.tsx

# 6. product-filters.tsx
sed -i '' "s/placeholder=\"Tìm theo tên, SKU hoặc barcode\"/placeholder=\"Tìm theo tên, mã hàng hoặc mã vạch\"/" apps/web/src/features/products/product-filters.tsx

# 7. product-form-dialog.tsx
sed -i '' "s/<Label htmlFor=\"p-sku\">SKU<\/Label>/<Label htmlFor=\"p-sku\">Mã hàng<\/Label>/" apps/web/src/features/products/product-form-dialog.tsx
sed -i '' "s/<Label htmlFor=\"p-barcode\">Barcode<\/Label>/<Label htmlFor=\"p-barcode\">Mã vạch<\/Label>/" apps/web/src/features/products/product-form-dialog.tsx

# 8. variant-table.tsx
sed -i '' "s/<TableHead>SKU<\/TableHead>/<TableHead>Mã hàng<\/TableHead>/" apps/web/src/features/products/variant-table.tsx
sed -i '' "s/<TableHead>Barcode<\/TableHead>/<TableHead>Mã vạch<\/TableHead>/" apps/web/src/features/products/variant-table.tsx
sed -i '' "s/>SKU</>Mã hàng</g" apps/web/src/features/products/variant-table.tsx
sed -i '' "s/>Barcode</>Mã vạch</g" apps/web/src/features/products/variant-table.tsx

# 9. stock-check-product-picker.tsx
sed -i '' "s/placeholder=\"Tìm theo tên hoặc SKU\"/placeholder=\"Tìm theo tên hoặc mã hàng\"/" apps/web/src/features/stock-checks/stock-check-product-picker.tsx
sed -i '' "s/Nhập tên hoặc SKU để bắt đầu tìm./Nhập tên hoặc mã hàng để bắt đầu tìm./" apps/web/src/features/stock-checks/stock-check-product-picker.tsx

# 10. Reports
sed -i '' "s/<TableHead>SKU<\/TableHead>/<TableHead>Mã hàng<\/TableHead>/g" apps/web/src/features/reports/components/InventoryReport.tsx
sed -i '' "s/<TableHead>SKU<\/TableHead>/<TableHead>Mã hàng<\/TableHead>/g" apps/web/src/features/reports/components/ProfitReport.tsx
sed -i '' "s/<TableHead>SKU<\/TableHead>/<TableHead>Mã hàng<\/TableHead>/g" apps/web/src/features/reports/components/RevenueReport.tsx
sed -i '' "s/<TableHead>SKU<\/TableHead>/<TableHead>Mã hàng<\/TableHead>/g" apps/web/src/features/reports/components/PricingReport.tsx

# 11. print-settings-form.tsx
sed -i '' "s/label: 'Mã SKU'/label: 'Mã hàng'/" apps/web/src/features/settings/print-settings-form.tsx

