#!/bin/bash
# CustomerList.tsx
sed -i '' 's/AlertTriangle,/AlertCircle, AlertTriangle,/' apps/web/src/features/customers/components/CustomerList.tsx
sed -i '' '/<p className="text-sm text-muted-foreground">Đang tải danh sách…<\/p>/,/items.length === 0/c\
          {customersQuery.isLoading ? (\
            <p className="text-sm text-muted-foreground">Đang tải danh sách…</p>\
          ) : customersQuery.isError ? (\
            <EmptyState\
              icon={AlertCircle}\
              title="Không tải được danh sách khách hàng"\
              description="Vui lòng thử lại sau."\
              actionLabel="Thử lại"\
              onAction={() => customersQuery.refetch()}\
            />\
          ) : items.length === 0 \&\& !isFiltered ? (\
' apps/web/src/features/customers/components/CustomerList.tsx

# products-manager.tsx
sed -i '' 's/Download,/AlertCircle, Download,/' apps/web/src/features/products/products-manager.tsx
sed -i '' '/<p className="text-sm text-muted-foreground">Đang tải danh sách…<\/p>/,/items.length === 0/c\
          {productsQuery.isLoading ? (\
            <p className="text-sm text-muted-foreground">Đang tải danh sách…</p>\
          ) : productsQuery.isError ? (\
            <EmptyState\
              icon={AlertCircle}\
              title="Không tải được danh sách sản phẩm"\
              description="Vui lòng thử lại sau."\
              actionLabel="Thử lại"\
              onAction={() => productsQuery.refetch()}\
            />\
          ) : items.length === 0 \&\& !isFiltered ? (\
' apps/web/src/features/products/products-manager.tsx

# customer-detail-page.tsx
sed -i '' 's/ChevronLeft/AlertCircle, ChevronLeft/' apps/web/src/pages/customer-detail-page.tsx
sed -i '' '/<p className="text-sm text-destructive">Không tải được thông tin khách hàng.<\/p>/c\
        <EmptyState\
          icon={AlertCircle}\
          title="Không tải được thông tin khách hàng"\
          description="Vui lòng thử lại sau."\
          actionLabel="Thử lại"\
          onAction={() => detailQuery.refetch()}\
        />\
' apps/web/src/pages/customer-detail-page.tsx

# order-detail-view.tsx
sed -i '' 's/ChevronLeft,/AlertCircle, ChevronLeft,/' apps/web/src/features/orders/order-detail-view.tsx
sed -i '' '/<p className="text-sm text-destructive">Không tải được hóa đơn.<\/p>/c\
        <EmptyState\
          icon={AlertCircle}\
          title="Không tải được đơn hàng"\
          description="Vui lòng thử lại sau."\
          actionLabel="Thử lại"\
          onAction={() => query.refetch()}\
        />\
' apps/web/src/features/orders/order-detail-view.tsx

# RevenueReport.tsx - fix the closing brace manually
sed -i '' '/function formatVND/d' apps/web/src/features/reports/components/RevenueReport.tsx
sed -i '' '/return new Intl.NumberFormat/d' apps/web/src/features/reports/components/RevenueReport.tsx
