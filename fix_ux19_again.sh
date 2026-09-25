#!/bin/bash
sed -i '' 's/<TableHead>Mã khách hàng<\/TableHead>/<TableHead className="hidden md:table-cell">Mã KH<\/TableHead>/' apps/web/src/features/customers/components/CustomerList.tsx
sed -i '' 's/<TableHead>Email<\/TableHead>/<TableHead className="hidden md:table-cell">Email<\/TableHead>/' apps/web/src/features/customers/components/CustomerList.tsx
sed -i '' 's/<TableHead>Nhóm<\/TableHead>/<TableHead className="hidden md:table-cell">Nhóm<\/TableHead>/' apps/web/src/features/customers/components/CustomerList.tsx
sed -i '' 's/<TableHead className="text-right">Số đơn<\/TableHead>/<TableHead className="hidden md:table-cell text-right">Số đơn<\/TableHead>/' apps/web/src/features/customers/components/CustomerList.tsx
sed -i '' 's/<TableHead className="text-right">Tổng mua<\/TableHead>/<TableHead className="hidden md:table-cell text-right">Tổng mua<\/TableHead>/' apps/web/src/features/customers/components/CustomerList.tsx

sed -i '' 's/<TableCell className="font-mono text-sm">{customer.code}<\/TableCell>/<TableCell className="hidden md:table-cell font-mono text-sm">{customer.code}<\/TableCell>/' apps/web/src/features/customers/components/CustomerList.tsx
sed -i '' 's/<TableCell className="text-sm text-muted-foreground">/<TableCell className="hidden md:table-cell text-sm text-muted-foreground">/' apps/web/src/features/customers/components/CustomerList.tsx
sed -i '' 's/<TableCell className="text-right">{customer.purchaseCount}<\/TableCell>/<TableCell className="hidden md:table-cell text-right">{customer.purchaseCount}<\/TableCell>/' apps/web/src/features/customers/components/CustomerList.tsx
sed -i '' 's/<TableCell className="text-right">/<TableCell className="hidden md:table-cell text-right">/' apps/web/src/features/customers/components/CustomerList.tsx
