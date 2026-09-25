#!/bin/bash
sed -i '' 's/const isEmpty = !isLoading && items.length === 0/const isEmpty = !isLoading \&\& !isError \&\& items.length === 0/' apps/web/src/features/receipts/receipts-manager.tsx

sed -i '' '/<p className="text-sm text-destructive">Không tải được danh sách. Thử lại sau.<\/p>/c\
        <EmptyState\
          icon={AlertCircle}\
          title="Không tải được danh sách"\
          description="Vui lòng thử lại sau."\
          actionLabel="Thử lại"\
          onAction={() => receiptsQuery.refetch()}\
        />
' apps/web/src/features/receipts/receipts-manager.tsx

sed -i '' 's/HandCoins, Plus, SearchX/AlertCircle, HandCoins, Plus, SearchX/' apps/web/src/features/receipts/receipts-manager.tsx

