import { useMemo, useState } from 'react'
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight, GripVertical, MoreVertical, Pencil, Trash2 } from 'lucide-react'

import type { CategoryItem } from '@kiotviet-lite/shared'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMediaQuery } from '@/hooks/use-media-query'

import type { CategoryTreeNode } from './utils'

interface CategoryTreeProps {
  tree: CategoryTreeNode[]
  onEdit: (category: CategoryItem) => void
  onDelete: (category: CategoryItem) => void
  onReorder: (parentId: string | null, orderedIds: string[]) => void
}

export function CategoryTree({ tree, onEdit, onDelete, onReorder }: CategoryTreeProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  if (isDesktop) {
    return (
      <DesktopCategoryTree tree={tree} onEdit={onEdit} onDelete={onDelete} onReorder={onReorder} />
    )
  }
  return (
    <MobileCategoryTree tree={tree} onEdit={onEdit} onDelete={onDelete} onReorder={onReorder} />
  )
}

function DesktopCategoryTree({ tree, onEdit, onDelete, onReorder }: CategoryTreeProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const rootIds = useMemo(() => tree.map((n) => n.id), [tree])

  function handleRootDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = rootIds.indexOf(String(active.id))
    const newIndex = rootIds.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const newIds = arrayMove(rootIds, oldIndex, newIndex)
    onReorder(null, newIds)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRootDragEnd}>
      <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-1">
          {tree.map((node) => (
            <DesktopRootRow
              key={node.id}
              node={node}
              onEdit={onEdit}
              onDelete={onDelete}
              onReorder={onReorder}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

interface DesktopRootRowProps {
  node: CategoryTreeNode
  onEdit: (category: CategoryItem) => void
  onDelete: (category: CategoryItem) => void
  onReorder: (parentId: string | null, orderedIds: string[]) => void
}

function DesktopRootRow({ node, onEdit, onDelete, onReorder }: DesktopRootRowProps) {
  const [expanded, setExpanded] = useState(true)
  const sortable = useSortable({ id: node.id })
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  }

  const childIds = useMemo(() => node.children.map((c) => c.id), [node.children])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleChildDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = childIds.indexOf(String(active.id))
    const newIndex = childIds.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const newIds = arrayMove(childIds, oldIndex, newIndex)
    onReorder(node.id, newIds)
  }

  return (
    <li ref={sortable.setNodeRef} style={style} className="rounded-md border bg-card">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          aria-label="Kéo để sắp xếp"
          className="cursor-grab text-muted-foreground"
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Thu gọn' : 'Mở rộng'}
          className="text-muted-foreground"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className="flex-1 truncate font-medium">{node.name}</span>
        {node.children.length > 0 && (
          <Badge variant="secondary">{node.children.length} danh mục con</Badge>
        )}
        <Button variant="ghost" size="icon" onClick={() => onEdit(node)} aria-label="Sửa">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(node)}
          aria-label="Xoá"
          className="text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {expanded && node.children.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleChildDragEnd}
        >
          <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-1 border-t bg-muted/30 p-2 pl-8">
              {node.children.map((child) => (
                <DesktopChildRow key={child.id} child={child} onEdit={onEdit} onDelete={onDelete} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </li>
  )
}

interface DesktopChildRowProps {
  child: CategoryItem
  onEdit: (category: CategoryItem) => void
  onDelete: (category: CategoryItem) => void
}

function DesktopChildRow({ child, onEdit, onDelete }: DesktopChildRowProps) {
  const sortable = useSortable({ id: child.id })
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  }
  return (
    <li
      ref={sortable.setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded bg-card p-2"
    >
      <button
        type="button"
        aria-label="Kéo để sắp xếp"
        className="cursor-grab text-muted-foreground"
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 truncate">{child.name}</span>
      <Button variant="ghost" size="icon" onClick={() => onEdit(child)} aria-label="Sửa">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(child)}
        aria-label="Xoá"
        className="text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  )
}

function MobileCategoryTree({ tree, onEdit, onDelete, onReorder }: CategoryTreeProps) {
  const rootIds = useMemo(() => tree.map((n) => n.id), [tree])

  function moveRoot(id: string, dir: -1 | 1) {
    const idx = rootIds.indexOf(id)
    const newIdx = idx + dir
    if (idx < 0 || newIdx < 0 || newIdx >= rootIds.length) return
    const newIds = [...rootIds]
    const [item] = newIds.splice(idx, 1)
    newIds.splice(newIdx, 0, item!)
    onReorder(null, newIds)
  }

  function moveChild(parentId: string, childIds: string[], id: string, dir: -1 | 1) {
    const idx = childIds.indexOf(id)
    const newIdx = idx + dir
    if (idx < 0 || newIdx < 0 || newIdx >= childIds.length) return
    const newIds = [...childIds]
    const [item] = newIds.splice(idx, 1)
    newIds.splice(newIdx, 0, item!)
    onReorder(parentId, newIds)
  }

  return (
    <ul className="flex flex-col gap-1">
      {tree.map((node, rootIdx) => {
        const childIds = node.children.map((c) => c.id)
        return (
          <li key={node.id} className="rounded-md border bg-card">
            <div className="flex items-center gap-2 p-3">
              <span className="flex-1 truncate font-medium">{node.name}</span>
              {node.children.length > 0 && (
                <Badge variant="secondary">{node.children.length}</Badge>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Tuỳ chọn">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(node)}>Sửa</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDelete(node)}>Xoá</DropdownMenuItem>
                  <DropdownMenuItem disabled={rootIdx === 0} onClick={() => moveRoot(node.id, -1)}>
                    Chuyển lên
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={rootIdx === tree.length - 1}
                    onClick={() => moveRoot(node.id, 1)}
                  >
                    Chuyển xuống
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {node.children.length > 0 && (
              <ul className="flex flex-col gap-1 border-t bg-muted/30 p-2 pl-6">
                {node.children.map((child, childIdx) => (
                  <li key={child.id} className="flex items-center gap-2 rounded bg-card p-2">
                    <span className="flex-1 truncate">{child.name}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Tuỳ chọn">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(child)}>Sửa</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDelete(child)}>Xoá</DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={childIdx === 0}
                          onClick={() => moveChild(node.id, childIds, child.id, -1)}
                        >
                          Chuyển lên
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={childIdx === node.children.length - 1}
                          onClick={() => moveChild(node.id, childIds, child.id, 1)}
                        >
                          Chuyển xuống
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
