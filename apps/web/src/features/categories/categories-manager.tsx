import { useMemo, useState } from 'react'
import { FolderTree, Plus } from 'lucide-react'

import type { CategoryItem } from '@kiotviet-lite/shared'

import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { ApiClientError } from '@/lib/api-client'
import { showError } from '@/lib/toast'

import { CategoryFormDialog } from './category-form-dialog'
import { CategoryTree } from './category-tree'
import { DeleteCategoryDialog } from './delete-category-dialog'
import { useCategoriesQuery, useReorderCategoriesMutation } from './use-categories'
import { buildCategoryTree } from './utils'

export function CategoriesManager() {
  const query = useCategoriesQuery()
  const reorderMutation = useReorderCategoriesMutation()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CategoryItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CategoryItem | null>(null)

  const items = useMemo(() => query.data ?? [], [query.data])
  const tree = useMemo(() => buildCategoryTree(items), [items])
  const parentOptions = useMemo(() => items.filter((c) => c.parentId === null), [items])

  const editTargetHasChildren =
    editTarget !== null && items.some((c) => c.parentId === editTarget.id)

  async function handleReorder(parentId: string | null, orderedIds: string[]) {
    try {
      await reorderMutation.mutateAsync({ parentId, orderedIds })
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError(err.message)
      } else {
        showError('Không sắp xếp được danh mục')
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Danh mục sản phẩm</h2>
          <p className="text-sm text-muted-foreground">Tổ chức sản phẩm theo nhóm 2 cấp.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="self-start md:self-auto">
          <Plus className="h-4 w-4" />
          <span>Thêm danh mục</span>
        </Button>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải danh sách…</p>
      ) : query.isError ? (
        <p className="text-sm text-destructive">Không tải được danh mục.</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="Chưa có danh mục nào"
          description="Tạo danh mục để phân loại sản phẩm"
          actionLabel="Thêm danh mục đầu tiên"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <CategoryTree
          tree={tree}
          onEdit={(c) => setEditTarget(c)}
          onDelete={(c) => setDeleteTarget(c)}
          onReorder={handleReorder}
        />
      )}

      <CategoryFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        parentOptions={parentOptions}
      />
      {editTarget && (
        <CategoryFormDialog
          mode="edit"
          open={editTarget !== null}
          onOpenChange={(v) => {
            if (!v) setEditTarget(null)
          }}
          category={editTarget}
          parentOptions={parentOptions}
          categoryHasChildren={editTargetHasChildren}
        />
      )}
      <DeleteCategoryDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null)
        }}
        category={deleteTarget}
      />
    </div>
  )
}
