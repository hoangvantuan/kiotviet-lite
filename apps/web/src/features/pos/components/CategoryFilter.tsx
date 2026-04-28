import { useQuery } from '@tanstack/react-query'

import type { CategoryItem } from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'

interface CategoryFilterProps {
  selectedId: string | undefined
  onSelect: (categoryId: string | undefined) => void
}

interface CategoriesResponse {
  data: CategoryItem[]
}

export function CategoryFilter({ selectedId, onSelect }: CategoryFilterProps) {
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.get<CategoriesResponse>('/api/v1/categories'),
    staleTime: 60_000,
    select: (res) => res.data,
  })

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      <ChipButton active={selectedId === undefined} onClick={() => onSelect(undefined)}>
        Tất cả
      </ChipButton>
      {categories?.map((cat) => (
        <ChipButton key={cat.id} active={selectedId === cat.id} onClick={() => onSelect(cat.id)}>
          {cat.name}
        </ChipButton>
      ))}
    </div>
  )
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      )}
    >
      {children}
    </button>
  )
}
