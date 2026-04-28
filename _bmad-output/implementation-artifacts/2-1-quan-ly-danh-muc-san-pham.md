# Story 2.1: Quản lý Danh mục Sản phẩm

Status: done

## Story

As a Manager/Owner,
I want tổ chức sản phẩm theo danh mục 2 cấp (cha-con),
so that khách hàng và nhân viên dễ dàng tìm đúng sản phẩm khi bán hàng và Owner phân loại được hàng hoá có hệ thống.

## Acceptance Criteria (BDD)

### AC1: Schema bảng `categories` và ràng buộc 2 cấp

**Given** hệ thống đã có bảng `stores` và migration framework Drizzle
**When** chạy migration mới của story này
**Then** tạo bảng `categories` với cấu trúc:

| Column       | Type                       | Ràng buộc                                         |
| ------------ | -------------------------- | ------------------------------------------------- |
| `id`         | `uuid`                     | PK, default `uuidv7()`                            |
| `store_id`   | `uuid`                     | NOT NULL, FK → `stores.id`                        |
| `name`       | `varchar(100)`             | NOT NULL                                          |
| `parent_id`  | `uuid`                     | NULLABLE, FK → `categories.id` ON DELETE RESTRICT |
| `sort_order` | `integer`                  | NOT NULL, default 0                               |
| `created_at` | `timestamp with time zone` | NOT NULL, default `now()`                         |
| `updated_at` | `timestamp with time zone` | NOT NULL, default `now()`, auto-update            |

**And** index `idx_categories_store_parent_sort` trên `(store_id, parent_id, sort_order)` cho list query
**And** unique index `uniq_categories_store_parent_name` trên `(store_id, parent_id, name)` (case-insensitive `LOWER(name)`) để chặn trùng tên trong cùng cấp cha
**And** ràng buộc 2 cấp enforce ở application layer (service): từ chối tạo/sửa nếu `parent_id` của cha mới khác `null` (cha mới đã là cấp 2)
**And** unique constraint trên `(store_id, parent_id, LOWER(name))` còn dùng cho check trùng tên khi tạo/đổi tên/đổi cha

### AC2: Tạo danh mục cấp 1 (parent_id = null)

**Given** Owner/Manager đã đăng nhập (có permission `products.manage`)
**When** gọi `POST /api/v1/categories` với body `{ name: "Đồ uống" }` (parent_id không truyền hoặc `null`)
**Then** API validate qua `createCategorySchema` (Zod): `name` trim, 1-100 ký tự, `parentId` optional uuid hoặc null
**And** service `createCategory` insert record với `store_id = actor.storeId`, `parent_id = null`, `sort_order = MAX(sort_order WHERE parent_id IS NULL AND store_id = ?) + 1`
**And** trả 201 với `{ data: { id, storeId, name, parentId: null, sortOrder, createdAt, updatedAt } }`
**And** ghi audit `action='category.created'` với `targetType='category'`, `targetId=<id>`, `changes={ name, parentId: null }`
**And** UI hiển thị Toast success "Đã tạo danh mục", danh mục mới xuất hiện ngay trong cây không cần reload (TanStack Query invalidate `['categories']`)

### AC3: Tạo danh mục cấp 2 (parent_id = <id cấp 1>)

**Given** đã tồn tại danh mục cha cấp 1 (id = `parent-uuid`, `parent_id IS NULL`)
**When** gọi `POST /api/v1/categories` với `{ name: "Cà phê", parentId: "parent-uuid" }`
**Then** service load `parent` qua `db.query.categories.findFirst`, kiểm tra:

- `parent` tồn tại và `parent.storeId === actor.storeId` (multi-tenant safety) → nếu không → throw `ApiError('NOT_FOUND', 'Không tìm thấy danh mục cha')`
- `parent.parentId === null` (parent phải là cấp 1) → nếu không → throw `ApiError('BUSINESS_RULE_VIOLATION', 'Không thể tạo danh mục cấp 3')`
  **And** insert với `sort_order = MAX(sort_order WHERE parent_id = ? AND store_id = ?) + 1`
  **And** trả 201, ghi audit `category.created` với `changes={ name, parentId }`
  **And** không cho phép tạo cấp 3 (cha của cha) trong mọi trường hợp

### AC4: Sửa tên và đổi danh mục cha

**Given** danh mục đã tồn tại
**When** gọi `PATCH /api/v1/categories/:id` với `{ name?: string, parentId?: string | null }`
**Then** service kiểm tra:

- Target tồn tại và `target.storeId === actor.storeId` → nếu không → 404
- Nếu đổi `name` → trùng tên trong cùng `(storeId, parentId)` → 409 CONFLICT message "Tên danh mục đã tồn tại trong cùng cấp"
- Nếu đổi `parentId`: - `parentId === target.id` → 422 "Không thể đặt danh mục làm cha của chính nó" - `parentId !== null` → load parent, kiểm tra `parent.storeId === actor.storeId`, `parent.parentId === null` (parent mới phải là cấp 1) - Nếu `target` đang có danh mục con (`SELECT 1 FROM categories WHERE parent_id = target.id LIMIT 1`) VÀ `parentId !== null` (target đang là cấp 1 có con, đang chuyển xuống cấp 2) → 422 "Danh mục có danh mục con không thể chuyển thành cấp 2"
  **And** update các field thay đổi, recalculate `sort_order` nếu đổi parent (sort_order = MAX trong parent mới + 1)
  **And** trả 200 với category mới
  **And** ghi audit `category.updated` với `changes` là diff before/after (chỉ field thay đổi, dùng helper `diffObjects` đã có trong `audit.service.ts`)

### AC5: Sắp xếp thứ tự bằng drag-drop (reorder)

**Given** danh sách danh mục đang hiển thị trong cây
**When** gọi `POST /api/v1/categories/reorder` với body `{ parentId: string | null, orderedIds: string[] }`
**Then** service kiểm tra:

- Tất cả `id` trong `orderedIds` phải thuộc store của actor
- Tất cả phải có cùng `parent_id === parentId` (chỉ reorder trong cùng cấp)
- Nếu sai → 422 "Chỉ được sắp xếp các danh mục cùng cấp"
  **And** trong 1 transaction, update `sort_order = index` cho từng id theo thứ tự trong `orderedIds` (index 0, 1, 2, ...)
  **And** trả 200 `{ data: { ok: true } }`
  **And** ghi 1 audit `category.reordered` với `changes={ parentId, orderedIds }`
  **And** UI desktop cho drag-drop bằng thư viện `@dnd-kit/core` + `@dnd-kit/sortable` (hoặc giải pháp tương đương đã được approve), chỉ cho drag trong cùng cấp (cấp 1 với cấp 1, cấp 2 trong cùng cha)
  **And** UI mobile (<768px) ẨN drag-drop, thay bằng nút mũi tên lên/xuống trên mỗi item: tap → swap `sort_order` với neighbor → gọi cùng API `reorder` với `orderedIds` mới

### AC6: Xoá danh mục với ràng buộc

**Given** Owner muốn xoá danh mục
**When** gọi `DELETE /api/v1/categories/:id`
**Then** service kiểm tra:

- Target tồn tại và `target.storeId === actor.storeId` → nếu không → 404
- Nếu danh mục cấp 1 có con (`COUNT(*) FROM categories WHERE parent_id = target.id > 0`) → 422 "Vui lòng xoá danh mục con trước"
- Nếu danh mục đang chứa sản phẩm → 422 "Danh mục đang chứa X sản phẩm, không thể xoá" (X = số đếm). LƯU Ý: bảng `products` chưa tồn tại ở story này, dùng try-catch FK constraint hoặc bỏ check này tạm thời. Xem Dev Notes mục "Coupling với products"
  **And** xoá hard delete (categories không cần soft delete vì là metadata, không có lịch sử cần giữ)
  **And** ghi audit `category.deleted` với `changes={ name, parentId, sortOrder }` (snapshot trước khi xoá)
  **And** trả 200 `{ data: { ok: true } }`
  **And** UI hiển thị `<AlertDialog>` xác nhận trước khi gọi DELETE: "Xoá danh mục [tên]?". Nếu API trả 422 → hiển thị Toast error với message từ API

### AC7: Liệt kê danh mục dạng cây

**Given** Owner/Manager vào trang `/products/categories`
**When** API `GET /api/v1/categories` được gọi
**Then** service trả flat list tất cả danh mục của store, sort theo `(parent_id NULLS FIRST, sort_order ASC, name ASC)`
**And** mỗi item có shape `{ id, storeId, name, parentId, sortOrder, createdAt, updatedAt }`
**And** UI tự build cây trong client (helper `buildCategoryTree(items)` trong `apps/web/src/features/categories/utils.ts`):

- level 1: items có `parentId === null`
- level 2: items có `parentId !== null`, group theo parentId
  **And** render `<CategoryTree>` component:
- Desktop ≥768px: list dọc với indent 24px cho cấp 2, icon `ChevronRight` (rotate 90deg khi expanded) cho cấp 1, action buttons (Edit/Delete/drag handle) hiện inline khi hover
- Mobile <768px: list dọc, mỗi item có action menu (3-dot) mở Sheet với các action: Sửa, Xoá, Chuyển lên, Chuyển xuống
  **And** mặc định cây expand toàn bộ (không cần lưu state collapsed lần đầu)

### AC8: Empty state khi chưa có danh mục

**Given** cửa hàng vừa tạo, chưa có danh mục nào
**When** vào `/products/categories`
**Then** hiển thị `<EmptyState>` (component sẵn có `apps/web/src/components/shared/empty-state.tsx`):

- icon: `FolderTree` từ `lucide-react`
- title: "Chưa có danh mục nào"
- description: "Tạo danh mục để phân loại sản phẩm"
- actionLabel: "Thêm danh mục đầu tiên"
- onAction: mở dialog tạo danh mục cấp 1

### AC9: Validation và edge cases

**Given** form tạo/sửa danh mục đang mở
**When** người dùng submit
**Then** Zod schema enforce:

- `name`: trim, min 1, max 100, regex `^[\p{L}\p{N}\s\-_&()'./]+$/u` (cho phép chữ Unicode, số, khoảng trắng, vài ký tự đặc biệt phổ biến). Empty (sau trim) → "Vui lòng nhập tên danh mục"
- `parentId`: optional, `z.string().uuid()` hoặc `null`
  **And** UI hiển thị lỗi inline dưới field, nút "Lưu" disable khi `!form.formState.isValid`
  **And** API errors `CONFLICT` (trùng tên trong cùng cấp) map về `form.setError('name', ...)` (pattern từ Story 1.2/1.4)
  **And** input `name` autofocus khi mở dialog tạo, max length 100 (`maxLength={100}` HTML attr)

### AC10: Permission và Multi-tenant Safety

**Given** ma trận quyền hiện tại
**When** kiểm tra access
**Then** mọi route `/api/v1/categories/*` yêu cầu `requireAuth` + `requirePermission('products.manage')` (Owner và Manager, KHÔNG Staff)
**And** mọi service query CHẶT CHẼ filter theo `actor.storeId` — không tin client truyền storeId
**And** Frontend route `/products/categories` có `beforeLoad: requirePermissionGuard('products.manage')` (Staff bị redirect về `/`)
**And** Sidebar/BottomTabBar đã có `requiredPermission: 'products.manage'` cho item `/products` (Staff không thấy menu Hàng hóa) — không cần đổi

## Tasks / Subtasks

### Phase A: Backend Schema + Migration

- [x] Task 1: Tạo Drizzle schema `categories` (AC: #1)
  - [x] 1.1: Tạo `packages/shared/src/schema/categories.ts`:

    ```ts
    import {
      index,
      pgTable,
      integer,
      timestamp,
      uniqueIndex,
      uuid,
      varchar,
    } from 'drizzle-orm/pg-core'
    import { uuidv7 } from 'uuidv7'
    import { sql } from 'drizzle-orm'
    import { stores } from './stores.js'

    export const categories = pgTable(
      'categories',
      {
        id: uuid()
          .primaryKey()
          .$defaultFn(() => uuidv7()),
        storeId: uuid()
          .notNull()
          .references(() => stores.id),
        name: varchar({ length: 100 }).notNull(),
        parentId: uuid(),
        sortOrder: integer().notNull().default(0),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true })
          .notNull()
          .defaultNow()
          .$onUpdate(() => new Date()),
      },
      (table) => [
        index('idx_categories_store_parent_sort').on(
          table.storeId,
          table.parentId,
          table.sortOrder,
        ),
        uniqueIndex('uniq_categories_store_parent_name').on(
          table.storeId,
          table.parentId,
          sql`LOWER(${table.name})`,
        ),
      ],
    )
    ```

  - [x] 1.2: Self-FK `parent_id → categories.id` ON DELETE RESTRICT thêm bằng raw SQL trong migration sau (Drizzle self-ref tricky, dùng raw để rõ ràng)
  - [x] 1.3: Export `categories` từ `packages/shared/src/schema/index.ts`
  - [x] 1.4: Generate migration `pnpm --filter @kiotviet-lite/api db:generate` → kiểm tra file `0007_*.sql` đã có CREATE TABLE + 2 indexes
  - [x] 1.5: Append vào file migration generated:
    ```sql
    ALTER TABLE "categories"
      ADD CONSTRAINT "categories_parent_id_fkey"
      FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT;
    ```
  - [x] 1.6: Chạy `pnpm --filter @kiotviet-lite/api db:migrate` lên dev DB, verify SQL output đúng

- [x] Task 2: Zod schemas (AC: #1, #2, #3, #4, #5, #9)
  - [x] 2.1: Tạo `packages/shared/src/schema/category-management.ts`:

    ```ts
    import { z } from 'zod'

    const NAME_REGEX = /^[\p{L}\p{N}\s\-_&()'./]+$/u

    export const categoryNameSchema = z
      .string({ required_error: 'Vui lòng nhập tên danh mục' })
      .trim()
      .min(1, 'Vui lòng nhập tên danh mục')
      .max(100, 'Tên danh mục tối đa 100 ký tự')
      .regex(NAME_REGEX, 'Tên danh mục chứa ký tự không hợp lệ')

    export const createCategorySchema = z.object({
      name: categoryNameSchema,
      parentId: z.string().uuid('Danh mục cha không hợp lệ').nullable().optional(),
    })

    export const updateCategorySchema = z
      .object({
        name: categoryNameSchema.optional(),
        parentId: z.string().uuid().nullable().optional(),
      })
      .refine((d) => d.name !== undefined || d.parentId !== undefined, {
        message: 'Cần ít nhất một trường để cập nhật',
      })

    export const reorderCategoriesSchema = z.object({
      parentId: z.string().uuid().nullable(),
      orderedIds: z.array(z.string().uuid()).min(1, 'Cần ít nhất 1 danh mục để sắp xếp').max(200),
    })

    export const categoryItemSchema = z.object({
      id: z.string().uuid(),
      storeId: z.string().uuid(),
      name: z.string(),
      parentId: z.string().uuid().nullable(),
      sortOrder: z.number().int(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })

    export type CreateCategoryInput = z.infer<typeof createCategorySchema>
    export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
    export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>
    export type CategoryItem = z.infer<typeof categoryItemSchema>
    ```

  - [x] 2.2: Re-export từ `packages/shared/src/schema/index.ts`

- [x] Task 3: Cập nhật audit action enum (AC: #2-#6)
  - [x] 3.1: Sửa `packages/shared/src/schema/audit-log.ts` (file đã tồn tại): thêm vào `auditActionSchema` enum: `'category.created'`, `'category.updated'`, `'category.deleted'`, `'category.reordered'`
  - [x] 3.2: Cập nhật action label map ở `apps/web/src/features/audit/action-labels.ts` (file đã tồn tại): thêm tiếng Việt:
    - `'category.created': 'Tạo danh mục'`
    - `'category.updated': 'Sửa danh mục'`
    - `'category.deleted': 'Xoá danh mục'`
    - `'category.reordered': 'Sắp xếp danh mục'`

### Phase B: Backend Service + Routes

- [x] Task 4: Categories service (AC: #2-#7)
  - [x] 4.1: Tạo `apps/api/src/services/categories.service.ts` với các function:
    - `listCategories({ db, storeId })`: trả `CategoryItem[]` sort `(parentId NULLS FIRST, sortOrder, name)`. Dùng `db.query.categories.findMany` + JS sort hoặc raw SQL `ORDER BY`
    - `createCategory({ db, actor, input, meta })`: validate parent (nếu có), tính sortOrder (MAX + 1), insert trong transaction kèm audit
    - `updateCategory({ db, actor, targetId, input, meta })`: validate target trong store, validate constraints (đổi cha, có con, trùng tên), diff trước/sau, update + audit trong transaction
    - `reorderCategories({ db, actor, input, meta })`: validate ids cùng parent + cùng store trong 1 query, update sortOrder theo index, audit trong transaction
    - `deleteCategory({ db, actor, targetId, meta })`: load target, check children count (count danh mục con), check products count (try-catch FK error nếu products chưa có), delete + audit trong transaction
  - [x] 4.2: Helper `toCategoryItem(row)` map Drizzle row → `CategoryItem` (convert Date → ISO string)
  - [x] 4.3: Catch DB unique constraint error trên `(store_id, parent_id, LOWER(name))` → throw `ApiError('CONFLICT', 'Tên danh mục đã tồn tại trong cùng cấp', { field: 'name' })`. Pattern lấy từ `users.service.ts:createUser`
  - [x] 4.4: Catch DB FK violation (categories có sản phẩm liên kết) → throw `ApiError('BUSINESS_RULE_VIOLATION', 'Danh mục đang chứa sản phẩm, không thể xoá')`. Lưu ý: products table chưa có ở story này, FK chưa tồn tại; kiểm tra này CHỈ cần khi Story 2.2 thêm `products.category_id`. Code phòng thủ ngay từ bây giờ để Story 2.2 không cần sửa
  - [x] 4.5: Tất cả audit log call dùng helper `logAction` từ `audit.service.ts` với `actorRole: actor.role` (pattern Story 1.4 sau review fix)

- [x] Task 5: Categories routes (AC: #2-#7, #10)
  - [x] 5.1: Tạo `apps/api/src/routes/categories.routes.ts` theo pattern `users.routes.ts`:

    ```ts
    export function createCategoriesRoutes({ db }: { db: Db }) {
      const app = new Hono()
      app.onError(errorHandler)
      app.use('*', requireAuth)
      app.use('*', requirePermission('products.manage'))

      app.get('/', async (c) => {
        /* listCategories */
      })
      app.post('/', async (c) => {
        /* createCategory + parseJson(createCategorySchema) */
      })
      app.post('/reorder', async (c) => {
        /* reorderCategories */
      })
      app.patch('/:id', async (c) => {
        /* updateCategory + uuidParam */
      })
      app.delete('/:id', async (c) => {
        /* deleteCategory */
      })

      return app
    }
    ```

  - [x] 5.2: Mount vào `apps/api/src/index.ts`: `app.route('/api/v1/categories', createCategoriesRoutes({ db }))`. Đặt sau `users` để giữ thứ tự logic
  - [x] 5.3: Validate `:id` param bằng `z.string().uuid('ID không hợp lệ')` giống `users.routes.ts:6`

### Phase C: Frontend (apps/web)

- [x] Task 6: API client + TanStack Query hooks (AC: #2-#7)
  - [x] 6.1: Tạo `apps/web/src/features/categories/categories-api.ts`:

    ```ts
    import type {
      CategoryItem, CreateCategoryInput, ReorderCategoriesInput, UpdateCategoryInput,
    } from '@kiotviet-lite/shared'
    import { apiClient } from '@/lib/api-client'

    interface ApiEnvelope<T> { data: T }

    export function listCategoriesApi() {
      return apiClient.get<ApiEnvelope<CategoryItem[]>>('/api/v1/categories')
    }
    export function createCategoryApi(input: CreateCategoryInput) { ... }
    export function updateCategoryApi(id: string, input: UpdateCategoryInput) { ... }
    export function reorderCategoriesApi(input: ReorderCategoriesInput) { ... }
    export function deleteCategoryApi(id: string) {
      return apiClient.delete<ApiEnvelope<{ ok: true }>>(`/api/v1/categories/${id}`)
    }
    ```

  - [x] 6.2: Tạo `apps/web/src/features/categories/use-categories.ts` (pattern từ `use-users.ts`):
    - `useCategoriesQuery()` queryKey `['categories']`
    - `useCreateCategoryMutation()`, `useUpdateCategoryMutation()`, `useReorderCategoriesMutation()`, `useDeleteCategoryMutation()` → mỗi mutation invalidate `['categories']` on success
  - [x] 6.3: Kiểm tra `apiClient.delete` đã tồn tại ở `apps/web/src/lib/api-client.ts`. Nếu chưa → bổ sung method `delete<T>(path: string)` theo pattern `get/post/patch`

- [x] Task 7: Tree builder utility + types (AC: #7)
  - [x] 7.1: Tạo `apps/web/src/features/categories/utils.ts`:

    ```ts
    import type { CategoryItem } from '@kiotviet-lite/shared'

    export interface CategoryTreeNode extends CategoryItem {
      children: CategoryItem[]
    }

    export function buildCategoryTree(items: CategoryItem[]): CategoryTreeNode[] {
      const sorted = [...items].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
        return a.name.localeCompare(b.name, 'vi')
      })
      const roots = sorted.filter((c) => c.parentId === null)
      const childrenByParent = new Map<string, CategoryItem[]>()
      for (const c of sorted) {
        if (c.parentId !== null) {
          const list = childrenByParent.get(c.parentId) ?? []
          list.push(c)
          childrenByParent.set(c.parentId, list)
        }
      }
      return roots.map((r) => ({ ...r, children: childrenByParent.get(r.id) ?? [] }))
    }
    ```

  - [x] 7.2: Co-located test `utils.test.ts` cover: empty list, only roots, mixed levels, sort by sortOrder rồi name

- [x] Task 8: CategoryTree component (AC: #5, #7)
  - [x] 8.1: Tạo `apps/web/src/features/categories/category-tree.tsx`:
    - Props: `tree: CategoryTreeNode[]`, `onEdit(category)`, `onDelete(category)`, `onReorder(parentId, orderedIds)`
    - Desktop (≥768px) dùng `useMediaQuery`: render `@dnd-kit/sortable` với 2 cấp:
      - Outer SortableContext cho cấp 1 (parentId = null)
      - Mỗi root expand → inner SortableContext cho children của root đó (cùng parentId)
      - Drag handle: icon `GripVertical` từ `lucide-react` ở đầu mỗi row
    - Mobile (<768px): không drag, mỗi row có dropdown menu (`<DropdownMenu>` đã có ở `components/ui/dropdown-menu.tsx`) với items: Sửa, Xoá, Chuyển lên (disabled khi index 0), Chuyển xuống (disabled khi index cuối)
    - Action mũi tên trên mobile: build `orderedIds` mới (swap với neighbor) → gọi `onReorder(parentId, newOrderedIds)`
  - [x] 8.2: Cài đặt deps: `pnpm --filter @kiotviet-lite/web add @dnd-kit/core @dnd-kit/sortable`. Kiểm tra version stable mới nhất (npmjs.com/package/@dnd-kit/core hiện 6.x, @dnd-kit/sortable 8.x — tương thích React 19)
  - [x] 8.3: Visual layout mỗi row:
    - icon `ChevronRight` (cấp 1) rotate khi expanded, `ChevronDown` icon thay thế nếu prefer
    - text name (truncate)
    - badge số lượng con (`<Badge>` shadcn) cho cấp 1: ví dụ "3 danh mục con"
    - actions inline (desktop): icon button Edit (`Pencil`), Delete (`Trash2`), drag handle (`GripVertical`)
  - [x] 8.4: Indent cấp 2 bằng `pl-8` (32px) hoặc `ml-6` thuần Tailwind. Tránh mix custom CSS

- [x] Task 9: CategoryFormDialog (AC: #2, #3, #4, #9)
  - [x] 9.1: Tạo `apps/web/src/features/categories/category-form-dialog.tsx` theo pattern `staff-form-dialog.tsx`:
    - Mode `'create'` hoặc `'edit'`. Props: `open`, `onOpenChange`, `mode`, `category?: CategoryItem`, `parentOptions: CategoryItem[]` (chỉ truyền danh mục cấp 1)
    - Form react-hook-form + `zodResolver(createCategorySchema)` (create) hoặc `zodResolver(updateCategorySchema)` (edit)
    - Fields:
      - `name`: Input text, autofocus, max 100 ký tự, error inline
      - `parentId`: Select shadcn với options:
        - `null` value: "— Danh mục cấp 1 —"
        - Mỗi cấp 1 trong `parentOptions`: tên + id
      - Trong mode edit, nếu `category.parentId === null && categoryHasChildren` → disable Select parent, hiển thị helper text "Danh mục có danh mục con không thể chuyển thành cấp 2"
    - Submit:
      - Create: `useCreateCategoryMutation`, success → toast "Đã tạo danh mục", close dialog
      - Edit: `useUpdateCategoryMutation`, success → toast "Đã cập nhật danh mục"
      - Error: map theo pattern `staff-form-dialog.tsx:326-347` (handleApiError). CONFLICT field=name → setError name, BUSINESS_RULE_VIOLATION → showError toast
  - [x] 9.2: Edit mode pre-fill `defaultValues = { name: category.name, parentId: category.parentId }`, reset khi `category` change

- [x] Task 10: DeleteCategoryDialog (AC: #6)
  - [x] 10.1: Tạo `apps/web/src/features/categories/delete-category-dialog.tsx` dùng `<AlertDialog>` (đã có ở `components/ui/alert-dialog.tsx`):
    - Title "Xoá danh mục [tên]?"
    - Description "Hành động này không thể hoàn tác."
    - Action button "Xoá" variant destructive
    - Submit: `useDeleteCategoryMutation`, success → toast "Đã xoá danh mục", error 422 → showError(message từ API)

- [x] Task 11: CategoriesManager + page (AC: #2-#8, #10)
  - [x] 11.1: Tạo `apps/web/src/features/categories/categories-manager.tsx`:
    - Header: title "Danh mục sản phẩm", description "Tổ chức sản phẩm theo nhóm 2 cấp", nút "Thêm danh mục" (primary)
    - Body: nếu `query.isLoading` → skeleton; `isError` → text destructive; `data.length === 0` → `<EmptyState>` (AC8); else `<CategoryTree>`
    - Dialogs: state cho `createOpen`, `editTarget`, `deleteTarget` giống `staff-manager.tsx`
    - Build `tree = buildCategoryTree(query.data)` và `parentOptions = query.data.filter(c => c.parentId === null)`
  - [x] 11.2: Tạo trang `apps/web/src/pages/products-categories-page.tsx` render `<CategoriesManager>`
  - [x] 11.3: Cập nhật `apps/web/src/router.tsx`:
    - Tạo route con của `productsRoute`: path `'categories'`, component `ProductsCategoriesPage`, `beforeLoad: requirePermissionGuard('products.manage')`
    - Vì `ProductsPage` hiện chỉ hiển thị placeholder (sẽ làm Story 2.2), đổi `productsRoute` thành parent với `<Outlet />`. Chia thành:
      - `productsRoute` (path `/products`) component layout có Outlet
      - `productsIndexRoute` (path `'/'`) → render `ProductsPage` placeholder
      - `productsCategoriesRoute` (path `'categories'`) → render `ProductsCategoriesPage`
    - HOẶC giải pháp đơn giản hơn cho story này: tạo route flat `/products/categories` cùng cấp `/products` (KHÔNG nest), giữ `ProductsPage` nguyên placeholder. Recommendation: dùng giải pháp flat để giảm refactor (giữ Story 2.2 tự refactor sau khi cần)
  - [x] 11.4: Cập nhật `nav-items.ts`: GIỮ NGUYÊN `/products` (không thêm `/products/categories` vào nav). Người dùng truy cập danh mục qua nút "Quản lý danh mục" trong trang `/products` ở Story 2.2 hoặc qua URL trực tiếp ở story này. Cập nhật `ProductsPage` placeholder thêm nút link "Quản lý danh mục" → `/products/categories`

- [x] Task 12: Integrate ProductsPage placeholder (AC: #7)
  - [x] 12.1: Sửa `apps/web/src/pages/products-page.tsx`: thêm nút secondary "Quản lý danh mục" (icon `FolderTree`) link tới `/products/categories` để Owner có entry point. Giữ nguyên `<EmptyState>` chính
  - [x] 12.2: Comment trong file: `// Story 2.1: thêm link tới categories. Story 2.2 sẽ refactor toàn bộ ProductsPage`

### Phase D: Tests + Manual verify

- [x] Task 13: Unit tests (AC: #1, #2-#6, #9)
  - [x] 13.1: `packages/shared/src/schema/category-management.test.ts`: validate createCategorySchema/updateCategorySchema/reorderCategoriesSchema (valid + invalid: empty name, name >100, name có ký tự lạ, parentId không phải uuid, orderedIds rỗng/quá 200)
  - [x] 13.2: `apps/web/src/features/categories/utils.test.ts`: buildCategoryTree empty, only roots, mixed, sort theo sortOrder rồi name vi-VN

- [x] Task 14: API integration tests (AC: #2-#7, #10)
  - [x] 14.1: `apps/api/src/__tests__/categories.integration.test.ts` (Vitest + PGlite, pattern từ `users.integration.test.ts` đã có):
    - Owner tạo danh mục cấp 1 → 201, verify sortOrder = 1
    - Tạo cấp 1 thứ 2 → sortOrder = 2
    - Tạo cấp 2 dưới cấp 1 → 201, parentId đúng
    - Tạo cấp 3 (parentId của cấp 2) → 422 BUSINESS_RULE_VIOLATION
    - Tạo trùng tên cùng cấp cha → 409 CONFLICT (verify error.details.field === 'name')
    - Tạo trùng tên khác cấp cha → 201 (cho phép)
    - Manager tạo OK, Staff tạo → 403 FORBIDDEN
    - Sửa tên thành tên đã có trong cùng cấp → 409
    - Sửa parentId của danh mục cấp 1 (đang có con) thành cấp 2 → 422
    - Sửa parentId === self.id → 422
    - Reorder 3 danh mục cấp 1: orderedIds = [c, a, b] → sortOrder lần lượt 0, 1, 2
    - Reorder ids khác parent → 422
    - Reorder ids khác store → 422 (multi-tenant)
    - Xoá danh mục cấp 1 đang có con → 422
    - Xoá danh mục cấp 2 không có sản phẩm → 200
    - Audit log ghi 1 record cho mỗi action với đúng action name + actorRole
    - Cross-store: Owner store A không thể xem/sửa danh mục store B (test với 2 stores trong cùng test)
  - [x] 14.2: Đảm bảo migration test setup có chạy migration mới: kiểm tra `apps/api/test-setup.ts` hoặc helper test. Pattern hiện tại apply tất cả migration trong folder `migrations/`

- [x] Task 15: Frontend manual verify + lint/typecheck (AC: all)
  - [x] 15.1: `pnpm typecheck` pass cho tất cả packages
  - [x] 15.2: `pnpm lint` pass (0 errors)
  - [x] 15.3: `pnpm test` pass toàn bộ suite (không regression)
  - [x] 15.4: Manual flow Owner desktop: đăng nhập → /products/categories → empty state → tạo "Đồ uống" cấp 1 → tạo "Cà phê" cấp 2 (parent = Đồ uống) → drag-drop "Đồ uống" lên đầu → sửa "Cà phê" thành "Trà" → xoá "Trà" → cây cập nhật realtime
  - [x] 15.5: Manual flow mobile (DevTools 375px): thay drag-drop bằng nút mũi tên lên/xuống, dropdown menu Sửa/Xoá hiện đúng
  - [x] 15.6: Manual flow permission: đăng nhập Staff → URL `/products/categories` → redirect `/`. Manager → access OK
  - [x] 15.7: Manual flow audit: Owner thực hiện đủ 4 action (create/update/delete/reorder) → vào `/settings/audit` → thấy 4 record với label tiếng Việt đúng

## Dev Notes

### Pattern reuse từ Story 1.2/1.3/1.4 (BẮT BUỘC tuân thủ)

| Khu vực                  | File hiện có                                                                 | Cách dùng                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Drizzle schema           | `packages/shared/src/schema/users.ts`, `audit-logs.ts`                       | Pattern uuidv7 PK, timestamp `withTimezone`, index/uniqueIndex syntax                                                                     |
| Zod input validation     | `packages/shared/src/schema/user-management.ts`                              | trim, min/max + regex. Refine cho update schema tối thiểu 1 field                                                                         |
| Audit logging            | `apps/api/src/services/audit.service.ts`                                     | `logAction({ db, storeId, actorId, actorRole, action, targetType, targetId, changes, ipAddress, userAgent })`                             |
| Service transaction      | `apps/api/src/services/users.service.ts:createUser`                          | `db.transaction(async (tx) => { ... await logAction({ db: tx as unknown as Db, ... }) })`                                                 |
| Error pattern            | `apps/api/src/lib/errors.ts` + `error-handler.middleware.ts`                 | Throw `ApiError(code, message, details?)`. Codes: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, BUSINESS_RULE_VIOLATION |
| Auth + RBAC middleware   | `apps/api/src/middleware/auth.middleware.ts`, `rbac.middleware.ts`           | `requireAuth` set `c.get('auth') = { userId, storeId, role }`. `requirePermission('products.manage')`                                     |
| Route mount              | `apps/api/src/index.ts`, `apps/api/src/routes/users.routes.ts`               | Tạo factory function `createCategoriesRoutes({ db })` trả Hono app                                                                        |
| API client               | `apps/web/src/lib/api-client.ts`, `apps/web/src/features/users/users-api.ts` | `apiClient.get/post/patch/delete<T>(path, body?)`. Wrap envelope `{ data: T }`                                                            |
| TanStack Query hooks     | `apps/web/src/features/users/use-users.ts`                                   | `useQuery({ queryKey: ['categories'] })`. Mutation `onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] })`                  |
| Form pattern             | `apps/web/src/features/users/staff-form-dialog.tsx`                          | react-hook-form + zodResolver, mode `'onTouched'`, error inline `text-sm text-destructive`, mapping API error → form.setError             |
| Permission hook          | `apps/web/src/hooks/use-permission.ts`                                       | `usePermission('products.manage')` → boolean                                                                                              |
| Route guard              | `apps/web/src/router.tsx:requirePermissionGuard`                             | `beforeLoad: requirePermissionGuard('products.manage')` redirect home với search.error nếu thiếu quyền                                    |
| Toast                    | `apps/web/src/lib/toast.ts`                                                  | `showSuccess`, `showError`                                                                                                                |
| Empty state              | `apps/web/src/components/shared/empty-state.tsx`                             | Props `icon`, `title`, `description`, `actionLabel`, `onAction`                                                                           |
| Confirm dialog           | `apps/web/src/components/ui/alert-dialog.tsx`                                | Pattern từ `lock-confirm-dialog.tsx`                                                                                                      |
| Responsive switch        | `apps/web/src/hooks/use-media-query.ts`                                      | `useMediaQuery('(min-width: 768px)')`                                                                                                     |
| Action label map (audit) | `apps/web/src/features/audit/action-labels.ts`                               | Bổ sung 4 label `category.*`                                                                                                              |

### Files cần TẠO MỚI

**Schema (packages/shared/src/schema/):**

- `categories.ts` (Drizzle table)
- `category-management.ts` (Zod cho create/update/reorder)

**Backend (apps/api/src/):**

- `services/categories.service.ts`
- `routes/categories.routes.ts`
- `__tests__/categories.integration.test.ts`

**Frontend (apps/web/src/):**

- `features/categories/categories-api.ts`
- `features/categories/use-categories.ts`
- `features/categories/utils.ts` + `utils.test.ts`
- `features/categories/category-tree.tsx`
- `features/categories/category-form-dialog.tsx`
- `features/categories/delete-category-dialog.tsx`
- `features/categories/categories-manager.tsx`
- `pages/products-categories-page.tsx`

**Migration (apps/api/src/db/migrations/):**

- `0007_*.sql` (Drizzle generate + manual self-FK append)

### Files SỬA

- `packages/shared/src/schema/index.ts`: export 2 schema mới
- `packages/shared/src/schema/audit-log.ts`: thêm 4 action vào enum
- `apps/api/src/index.ts`: mount route mới
- `apps/web/src/router.tsx`: thêm route `/products/categories`
- `apps/web/src/features/audit/action-labels.ts`: thêm 4 label tiếng Việt
- `apps/web/src/pages/products-page.tsx`: thêm nút link "Quản lý danh mục"

### Quy ước naming nhất quán Story 1.x (KHÔNG đi theo architecture docs cũ)

- File component: kebab-case flat `category-tree.tsx` (KHÔNG `components/CategoryTree.tsx` như docs)
- File schema: kebab-case `category-management.ts`, `categories.ts`
- File service/route: `categories.service.ts`, `categories.routes.ts` (giống `auth.service.ts`)
- Page file: `products-categories-page.tsx`
- Trong file Drizzle: dùng helper Drizzle `casing: 'snake_case'` đã set ở `apps/api/src/db/index.ts:17` → property camelCase trong code, column snake_case trong DB tự động

### Coupling với products (Story 2.2)

Story 2.2 sẽ tạo bảng `products` với cột `category_id` FK. Story 2.1 KHÔNG tạo bảng products. Hệ quả:

- Service `deleteCategory` ở Task 4.4 cần check children (categories) — phần này có ở 2.1
- Check products count → KHÔNG kiểm tra trực tiếp ở 2.1 (chưa có table). Code defensive bằng try-catch raw FK error: nếu sau 2.2 có FK `products.category_id REFERENCES categories(id)`, DELETE category sẽ throw FK violation. Catch error → throw `BUSINESS_RULE_VIOLATION` với message gợi ý
- AC6 yêu cầu hiển thị "Danh mục đang chứa X sản phẩm". X là số lượng — cần `COUNT(*)`. Story 2.1 KHÔNG implement count vì products chưa có. Story 2.2 sẽ bổ sung COUNT logic. Note rõ trong code comment: `// TODO Story 2.2: count products in this category before delete`

### Permission matrix (story này)

| Permission        | Owner | Manager | Staff | Resource        |
| ----------------- | ----- | ------- | ----- | --------------- |
| `products.manage` | ✅    | ✅      | ❌    | CRUD categories |

`products.manage` đã có sẵn trong `packages/shared/src/constants/permissions.ts`. KHÔNG tạo permission mới riêng cho categories — categories là sub-resource của products.

### Validation đặc biệt

**Tên danh mục:**

- Trim trước khi validate (whitespace đầu/cuối)
- Min 1 ký tự (sau trim), max 100
- Regex `^[\p{L}\p{N}\s\-_&()'./]+$/u`: chữ Unicode (tiếng Việt OK), số, khoảng trắng, các ký tự `- _ & ( ) ' . /`. Tránh ký tự control, emoji, HTML tags
- Case-insensitive uniqueness trong cùng `(store_id, parent_id)`: dùng unique index `LOWER(name)` ở DB layer + check `findFirst` trước insert ở service layer (defense in depth)

**Sort order:**

- Integer ≥ 0
- Khi insert, `MAX(sort_order WHERE same parent) + 1`. Nếu chưa có item nào → 0 (hoặc 1; chọn 0 để đơn giản)
- Khi reorder, set theo index trong `orderedIds[]` (0, 1, 2, ...)

**Drag-drop ràng buộc:**

- Chỉ cho drag trong cùng `parentId`. Cấp 1 không drag vào trong cấp 1 khác (không tự thay đổi cấp). Nếu user muốn đổi cha → dùng dialog Edit
- Mobile: thay drag bằng arrow up/down — đơn giản, không cần thư viện touch drag

### Anti-patterns: TUYỆT ĐỐI KHÔNG

- KHÔNG tạo schema bảng `products` ở story này (Story 2.2)
- KHÔNG implement biến thể, tồn kho, đơn vị quy đổi (Story 2.3, 2.4)
- KHÔNG bypass `storeId` filter trong service queries (multi-tenant)
- KHÔNG cho phép cấp 3: validate ở service (parent.parentId === null), KHÔNG chỉ frontend
- KHÔNG cho self-reference parentId (id === self.id)
- KHÔNG hard delete cascade. Dùng FK ON DELETE RESTRICT cho self-FK + check children count ở service
- KHÔNG dùng soft delete cho categories (metadata table, không cần lịch sử)
- KHÔNG implement nested set / closure table cho 2 cấp. Adjacency list (`parent_id`) đủ vì depth tối đa 2. Tránh over-engineer
- KHÔNG re-fetch toàn bộ tree từ DB sau mỗi mutation. Mutation server trả category mới, frontend chỉ cần `invalidateQueries(['categories'])` để trigger refetch tự nhiên qua TanStack Query
- KHÔNG dùng REST verb sai: reorder dùng POST `/reorder` (không idempotent theo nghĩa thuần REST nhưng đơn giản, pattern đã thiết lập ở Story 1.4 với `/lock`, `/unlock`)
- KHÔNG mount `/api/v1/categories` không có `requirePermission('products.manage')` ở route group level (DRY, không cần lặp ở từng handler)
- KHÔNG tạo file `components/products/CategoryTree.tsx` (architecture docs PascalCase) — dùng kebab-case flat trong `features/categories/category-tree.tsx`
- KHÔNG dùng `any` hoặc `@ts-ignore`
- KHÔNG hard-code action label tiếng Việt trong service. Label chỉ ở frontend `action-labels.ts`. Backend chỉ ghi action key tiếng Anh `category.created`
- KHÔNG return `{ ok: true }` từ DELETE/reorder không có wrapper `{ data: ... }`. Mọi response API dùng envelope `{ data: T }` nhất quán

### Project Structure Notes

Tuân theo pattern hiện tại Story 1.x:

- Feature folder flat (KHÔNG nest `components/`): `features/categories/category-tree.tsx`
- Pages tại `apps/web/src/pages/*-page.tsx` (KHÔNG `routes/_authenticated/...` như docs)
- Code-based TanStack Router (KHÔNG file-based plugin)
- Schema files trong `packages/shared/src/schema/` kebab-case
- Service files `apps/api/src/services/*.service.ts` kebab-case

**Variance từ architecture docs đã chấp nhận** (giữ nguyên Story 1.4):

- Pages flat thay vì routes/\_authenticated nested
- Code-based router thay vì file-based plugin
- Feature folder kebab-case flat thay vì nested PascalCase

### Latest tech notes

- **@dnd-kit**: stack đã được khuyến nghị cho React 19. Phiên bản hiện tại `@dnd-kit/core@6.x`, `@dnd-kit/sortable@8.x`. License MIT, bundle size ~12kb gzipped, hỗ trợ keyboard accessibility (arrow keys, space để pick up). Tránh `react-beautiful-dnd` (deprecated) và `react-sortable-hoc` (cũ)
- **Drizzle self-FK**: cần raw SQL append vì Drizzle 0.45 chưa hỗ trợ self-reference đẹp. Pattern `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... REFERENCES <same_table>(...)` ổn định
- **PostgreSQL unique index trên LOWER(name)**: function-based index, hỗ trợ từ PG 7.4+. Drizzle expr API dùng `sql\`LOWER(${table.name})\``trong`uniqueIndex.on(...)`— kiểm tra Drizzle docs nếu version 0.45 hỗ trợ. Nếu không, fallback: dùng raw SQL trong migration`CREATE UNIQUE INDEX ... ON categories (store_id, parent_id, LOWER(name))`

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-2-qun-l-hng-ha.md#Story 2.1]
- [Source: _bmad-output/planning-artifacts/prd/functional-requirements.md#FR4 (danh mục 2 cấp + drag-drop)]
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#Hàng hóa]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Database Naming, API Naming, Code Naming, Enforcement Guidelines]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Multi-tenancy, #Audit Log]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/ux-consistency-patterns.md#Empty States, #Confirmation Patterns, #Form Patterns, #Feedback Patterns]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/component-strategy.md#Tabs, Dialog, Toast]
- [Source: _bmad-output/implementation-artifacts/1-4-quan-ly-nhan-vien-phan-quyen.md#Pattern audit, transaction, RBAC, form, mapping API error]
- [Source: _bmad-output/implementation-artifacts/1-3-layout-ung-dung-navigation.md#nav-items.ts, useMediaQuery, dropdown menu]
- [Source: packages/shared/src/schema/users.ts] (pattern uuidv7, timestamp withTimezone)
- [Source: packages/shared/src/schema/audit-logs.ts] (pattern table định nghĩa với index)
- [Source: packages/shared/src/schema/audit-log.ts] (auditActionSchema enum để extend)
- [Source: packages/shared/src/constants/permissions.ts] (`products.manage` đã có)
- [Source: apps/api/src/services/users.service.ts] (pattern transaction + audit, try-catch unique constraint)
- [Source: apps/api/src/services/audit.service.ts] (logAction signature, diffObjects helper)
- [Source: apps/api/src/routes/users.routes.ts] (pattern factory route + uuidParam)
- [Source: apps/api/src/middleware/rbac.middleware.ts] (`requirePermission`)
- [Source: apps/web/src/features/users/staff-form-dialog.tsx] (pattern form RHF + zodResolver + mapping CONFLICT API error)
- [Source: apps/web/src/features/users/staff-manager.tsx] (pattern manager component với search + filter + dialogs state)
- [Source: apps/web/src/features/users/lock-confirm-dialog.tsx] (pattern AlertDialog confirm)
- [Source: apps/web/src/router.tsx:82-89] (`requirePermissionGuard`)
- [Source: apps/web/src/components/shared/empty-state.tsx] (pattern EmptyState)
- [Web: @dnd-kit/sortable docs](https://docs.dndkit.com/presets/sortable) cho 2-level nested sortable
- [Web: PostgreSQL CREATE INDEX function-based](https://www.postgresql.org/docs/current/indexes-expressional.html) cho `LOWER(name)` unique
- [Web: Drizzle Indexes](https://orm.drizzle.team/docs/indexes-constraints) cho cú pháp index/uniqueIndex
- [Web: TanStack Router Outlet](https://tanstack.com/router/latest/docs/framework/react/api/router/Outlet) nếu cần nested route layout

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (claude-opus-4-7) trong khung BMAD `bmad-dev-story`.

### Debug Log References

- Migration 0007 generated bằng `pnpm --filter @kiotviet-lite/api db:generate` rồi append self-FK ON DELETE RESTRICT thủ công.
- Apply migration thành công: `pnpm --filter @kiotviet-lite/api db:migrate`.
- Test issue 1: PGlite không enforce unique index function-based `LOWER(name)` trong env test → bổ sung `ensureNameUnique` ở service layer (defense in depth) cho cả create và update.
- Test issue 2: Initial form types dùng local interface bị Resolver type không khớp với schema infer → đổi sang `useForm<CreateCategoryInput>` / `useForm<UpdateCategoryInput>`.

### Completion Notes List

- Hoàn thành đủ 10 AC + 15 task của story.
- Tổng 24 integration tests + 22 zod schema tests + 6 tree builder tests đều pass.
- Full test suite: 255/255 pass, không regression.
- Typecheck pass tất cả packages, lint còn 5 warning thuộc code có sẵn, không phát sinh warning mới từ story.
- Migration 0007 self-FK ON DELETE RESTRICT đã append thủ công, đã apply lên dev DB.
- Frontend dùng route flat `/products/categories` theo recommendation của Dev Notes (đỡ refactor cho Story 2.2).
- `deleteCategory` đã defensive try-catch FK violation chuẩn bị sẵn cho Story 2.2 thêm `products.category_id`.

### File List

**Schema (packages/shared):**

- `packages/shared/src/schema/categories.ts` (new)
- `packages/shared/src/schema/category-management.ts` (new)
- `packages/shared/src/schema/category-management.test.ts` (new)
- `packages/shared/src/schema/index.ts` (modified, export 2 schema mới)
- `packages/shared/src/schema/audit-log.ts` (modified, thêm 4 enum)

**Backend (apps/api):**

- `apps/api/src/services/categories.service.ts` (new)
- `apps/api/src/routes/categories.routes.ts` (new)
- `apps/api/src/__tests__/categories.integration.test.ts` (new)
- `apps/api/src/index.ts` (modified, mount route)
- `apps/api/src/db/migrations/0007_lyrical_joseph.sql` (new generated + manual append)

**Frontend (apps/web):**

- `apps/web/src/features/categories/categories-api.ts` (new)
- `apps/web/src/features/categories/use-categories.ts` (new)
- `apps/web/src/features/categories/utils.ts` (new)
- `apps/web/src/features/categories/utils.test.ts` (new)
- `apps/web/src/features/categories/category-tree.tsx` (new)
- `apps/web/src/features/categories/category-form-dialog.tsx` (new)
- `apps/web/src/features/categories/delete-category-dialog.tsx` (new)
- `apps/web/src/features/categories/categories-manager.tsx` (new)
- `apps/web/src/pages/products-categories-page.tsx` (new)
- `apps/web/src/pages/products-page.tsx` (modified, thêm link tới categories)
- `apps/web/src/router.tsx` (modified, thêm route `/products/categories`)
- `apps/web/src/features/audit/action-labels.ts` (modified, thêm 4 label tiếng Việt)
- `apps/web/package.json` (modified, thêm @dnd-kit/core, sortable, utilities)

### Change Log

- 2026-04-25: Implement Story 2.1 — Quản lý Danh mục Sản phẩm (10 AC, 15 task hoàn thành).
- 2026-04-25: Code review (BMAD adversarial 3 layers) — 4 patch, 6 defer, 4 dismiss.
- 2026-04-25: Apply 4 review patches: detector dùng pg error code chính xác (23505/23503 + constraint name), EditDialog disable theo isValid, Reorder error message phân biệt 2 case. Toàn bộ 255 test pass, không regression. Status → done.

## Senior Developer Review (AI)

**Reviewer:** code-reviewer agent (Claude Opus 4.7)
**Date:** 2026-04-25
**Method:** BMAD code-review skill, 3 layers (Blind Hunter / Edge Case Hunter / Acceptance Auditor)
**Diff scope:** 23 file mới + 6 file modified, ~2475 LOC mới + ~250 LOC sửa.

### Tổng kết

Story 2.1 đáp ứng đầy đủ 10 AC. Pattern multi-tenant, RBAC, audit log nhất quán với Story 1.4. Test coverage 24 integration + 22 schema + 6 tree builder, full suite 255 pass. Không có vấn đề HIGH/CRITICAL. 4 patch nhỏ + 6 defer.

### Review Findings

- [x] [Review][Patch] FK violation detector substring quá rộng, nguy cơ mismatch message khi self-FK race [apps/api/src/services/categories.service.ts:44-53] — đã thay bằng `classifyFkViolation` match `err.code === '23503'` + phân biệt `categories_parent_id_fkey` (self-parent) vs FK khác (vd products tương lai)
- [x] [Review][Patch] Unique violation detector substring quá rộng, nên match Postgres error code 23505 [apps/api/src/services/categories.service.ts:34-42] — đã thay bằng `isUniqueNameViolation` match `err.code === '23505'` + `constraint_name === 'uniq_categories_store_parent_name'`
- [x] [Review][Patch] EditDialog Save button không disable theo `form.formState.isValid`, ngược spec AC9 line 129 [apps/web/src/features/categories/category-form-dialog.tsx:265] — đã thêm `disabled={!form.formState.isValid || mutation.isPending}`
- [x] [Review][Patch] Reorder error message không phân biệt giữa "khác cấp" và "id không tồn tại" → UX khó debug [apps/api/src/services/categories.service.ts:380] — length mismatch + storeId khác → "Có danh mục không tồn tại hoặc khác cửa hàng"; parentId khác → "Chỉ được sắp xếp các danh mục cùng cấp"
- [x] [Review][Defer] Race condition: 2 concurrent updates đổi parent của 2 categories khác → 2 row cùng sortOrder (no constraint break) [apps/api/src/services/categories.service.ts:309-316] — deferred, không gây lỗi data integrity, chấp nhận
- [x] [Review][Defer] `asFormSetError` cast cồng kềnh, code smell type adapter [apps/web/src/features/categories/category-form-dialog.tsx:280-285] — deferred, không cản trở chức năng
- [x] [Review][Defer] Reorder không enforce orderedIds completeness → race với user khác thêm cấp 1 mới có thể tạo lỗ sortOrder [apps/api/src/services/categories.service.ts:374-389] — deferred, low frequency edge case
- [x] [Review][Defer] Reorder transaction sequential update loop, perf với N=200 không tối ưu [apps/api/src/services/categories.service.ts:392-396] — deferred, trong giới hạn chấp nhận
- [x] [Review][Defer] Migration 0007 cuối file không có statement-breakpoint [apps/api/src/db/migrations/0007_lyrical_joseph.sql:14] — deferred, hiện không gây lỗi
- [x] [Review][Defer] Schema name regex cho phép multiple internal whitespace, không collapse → "Cà phê" vs "Cà phê" coi là khác [packages/shared/src/schema/category-management.ts:5-10] — deferred, nice-to-have UX

### Dismissed (noise / handled)

- ensureNameUnique chạy ngoài transaction: production có DB unique index chặn, defense in depth ở service layer.
- UUID invalid trả 400 thay vì 404: pattern consistent với users.routes.
- Spec mâu thuẫn line 82 vs 108 mobile UX: code chọn theo spec line 108 (3-dot menu) hợp lý.
- Delete error message thiếu "X sản phẩm" số đếm: spec đã NOTE cho phép tạm hoãn tới Story 2.2.

### Risk Assessment

| Layer                        | Risk                                                              |
| ---------------------------- | ----------------------------------------------------------------- |
| Multi-tenant isolation       | LOW — verify ở mọi service query, có integration test cross-store |
| RBAC                         | LOW — middleware level, có test 403 cho Staff                     |
| Audit logging                | LOW — transaction wrap, có test verify actorRole                  |
| 2-cấp constraint             | LOW — service enforce ở create + update, có test 422 cho cấp 3    |
| Unique name case-insensitive | LOW — DB unique index + service defense                           |
| FK delete defense            | LOW — try-catch FK violation cho Story 2.2 sẵn sàng               |

Không vấn đề HIGH/CRITICAL.
