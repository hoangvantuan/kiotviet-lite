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
    parentId: z.string().uuid('Danh mục cha không hợp lệ').nullable().optional(),
  })
  .refine((d) => d.name !== undefined || d.parentId !== undefined, {
    message: 'Cần ít nhất một trường để cập nhật',
  })

export const reorderCategoriesSchema = z.object({
  parentId: z.string().uuid().nullable(),
  orderedIds: z
    .array(z.string().uuid())
    .min(1, 'Cần ít nhất 1 danh mục để sắp xếp')
    .max(200, 'Không thể sắp xếp quá 200 danh mục cùng lúc'),
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
