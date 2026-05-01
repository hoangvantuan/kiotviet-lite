# Story 4.3c: So sánh bảng giá

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **chủ cửa hàng**,
I want **so sánh 2 bảng giá cạnh nhau để thấy chênh lệch (số tiền + %), margin so với giá vốn WAC, và cảnh báo dưới vốn**,
so that **tôi ra quyết định điều chỉnh giá hợp lý dựa trên dữ liệu cụ thể, tránh bán dưới vốn và phát hiện chênh lệch bất thường**.

## Background

Story 4.3 (done) và 4.3b (review/done) đã hoàn thành toàn bộ CRUD bảng giá với 3 method `direct | formula | chain`. Story 4.3c là tính năng cuối cùng của **track bảng giá** trong Epic 4, bổ sung **chức năng đọc** (so sánh + export) mà không thêm mutation lên DB.

**Phạm vi hẹp**: chỉ thêm:

1. 1 endpoint mới `GET /api/v1/price-lists/compare?listAId=...&listBId=...` trả về dữ liệu so sánh
2. 1 trang/dialog UI mới `<ComparePriceListsDialog>` (hoặc trang `/pricing/compare` nếu cần share link) hiển thị bảng so sánh với highlight + filter
3. Nút export CSV phía client (không cần API endpoint riêng)

**KHÔNG làm**:

- KHÔNG thêm mutation/audit (vì là tính năng đọc, KHÔNG đổi state DB)
- KHÔNG thêm bảng DB mới
- KHÔNG đổi schema bảng giá hiện tại
- KHÔNG đổi pricing engine (Story 4.5)
- KHÔNG implement export Excel (CSV đủ cho MVP, theo AC3)
- KHÔNG implement background job (data ≤ tổng số SP của store, MVP ≤ ~500 SP, in-line đủ)

**Coupling notes (cho Story sau)**:

- Story 4.5 (POS) sẽ reuse helper `computeCompareRows` nếu cần preview giá theo nhiều bảng giá khi resolve 6-tier — KHÔNG bắt buộc.
- Khi Epic 8 (Báo cáo) làm tính năng export tổng quát, có thể migrate nút "Xuất CSV" này sang `<ExportButton>` chuẩn — story 4.3c chỉ cần một export đơn giản inline.

## Acceptance Criteria (BDD)

### AC1: Endpoint so sánh `GET /api/v1/price-lists/compare`

**Given** Owner/Manager đã đăng nhập (có permission `pricing.manage`), trong store có ≥ 2 bảng giá alive
**When** gọi `GET /api/v1/price-lists/compare?listAId=<uuid>&listBId=<uuid>`
**Then** API validate qua `comparePriceListsQuerySchema`:

- `listAId`: uuid bắt buộc (sẽ throw `VALIDATION_ERROR` nếu thiếu/không phải uuid)
- `listBId`: uuid bắt buộc
- `listAId` và `listBId` phải khác nhau, nếu giống → `VALIDATION_ERROR` "Hai bảng giá so sánh phải khác nhau"

**And** service `comparePriceLists`:

- Validate cả 2 price list cùng `actor.storeId` + `deletedAt IS NULL` → nếu sai → 404 NOT_FOUND "Không tìm thấy bảng giá để so sánh"
- Load metadata cả 2 (qua `getPriceList` reuse) → cấu thành `listA` / `listB` `PriceListDetail`
- Load `price_list_items` cả 2 bảng (FULL UNION outer-join trên `productId`):
  - Build `mapA: Map<productId, priceListItemRow>` từ items của bảng A
  - Build `mapB: Map<productId, priceListItemRow>` từ items của bảng B
  - Tập productId = `union(keys(mapA), keys(mapB))` → ≤ tổng SP của store
- Load product info cho TẤT CẢ productId trong tập union qua 1 query bulk:
  - `SELECT id, name, sku, image_url, selling_price, cost_price FROM products WHERE id IN (...) AND store_id = $1 AND deleted_at IS NULL`
  - Sản phẩm bị soft-delete sẽ KHÔNG xuất hiện trong kết quả (orphan items bị bỏ qua, dev note H8 từ Story 4.3 đã accept)

**Then** với mỗi product trong tập union (có row product alive), build `CompareRow`:

```typescript
{
  productId: uuid,
  productName: string,
  productSku: string,
  productImageUrl: string | null,
  productSellingPrice: number,           // giá lẻ chuẩn từ products
  productCostPrice: number | null,       // WAC, để tính margin + cảnh báo "dưới vốn"
  priceA: number | null,                 // null nếu SP không có trong bảng A
  priceB: number | null,                 // null nếu SP không có trong bảng B
  diffAmount: number | null,             // priceB - priceA. null nếu thiếu 1 trong 2 giá
  diffPercent: number | null,            // (priceB - priceA) / priceA * 100, làm tròn 2 chữ số. null nếu priceA = 0 hoặc thiếu giá
  marginA: number | null,                // ((priceA - costPrice) / priceA) * 100, làm tròn 2 chữ số. null nếu priceA = 0/null hoặc costPrice null
  marginB: number | null,                // tương tự cho B
  isBelowCostA: boolean,                 // priceA < costPrice (priceA != null && costPrice != null)
  isBelowCostB: boolean,                 // priceB < costPrice (tương tự)
  isMissingA: boolean,                   // priceA === null (SP không có trong bảng A)
  isMissingB: boolean,                   // priceB === null
}
```

**And** sort kết quả theo `productName ASC` (collation tiếng Việt — dùng `localeCompare('vi')` hoặc `ORDER BY name`).

**Then** trả 200 `{ data: ComparePriceListsResponse }`:

```typescript
{
  data: {
    listA: PriceListDetail,        // metadata bảng A (reuse type cũ)
    listB: PriceListDetail,
    rows: CompareRow[],            // mảng đã sort theo productName
    summary: {
      totalProducts: number,       // = rows.length
      bothCount: number,           // số dòng cả A và B đều có giá
      onlyACount: number,          // chỉ A có
      onlyBCount: number,          // chỉ B có
      diffOver10Count: number,     // số dòng |diffPercent| > 10 (chỉ tính dòng có cả 2 giá)
      belowCostBCount: number,     // số dòng B dưới vốn
      belowCostACount: number,     // số dòng A dưới vốn (hiển thị tham khảo)
    }
  }
}
```

**Validation phụ**:

- Nếu một trong 2 bảng có `effectiveActive = false` (chưa hiệu lực / hết hạn / bị tắt / bị xoá) → vẫn cho compare, nhưng UI cảnh báo (xem AC6).
- Service KHÔNG tạo audit log (đây là tính năng đọc).
- Performance: chỉ 3 query (2 LEFT JOIN price_list_items + 1 SELECT products bulk). Acceptable cho MVP với ≤ 1000 SP / store. Nếu cần optimize: 1 query với FULL OUTER JOIN trên `price_list_items` + JOIN `products`.

### AC2: Highlight chênh lệch > 10% và cảnh báo dưới vốn (UI)

**Given** đang xem dialog/trang `<ComparePriceListsView>` với data từ AC1
**When** render bảng so sánh
**Then** mỗi row có visual indicator theo rule:

| Điều kiện                                      | Visual                                                                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Math.abs(diffPercent) > 10` (cả 2 đều có giá) | Background row `bg-amber-50 dark:bg-amber-950/30` + cột `diffPercent` `font-semibold text-amber-700 dark:text-amber-400`           |
| `isBelowCostB === true`                        | Cột `priceB` thêm badge nhỏ `<Badge variant="destructive">Dưới vốn</Badge>` + cột `priceB` color `text-destructive font-semibold`  |
| `isBelowCostA === true` (hiếm, chỉ tham khảo)  | Cột `priceA` thêm badge `<Badge variant="outline" className="border-destructive text-destructive">Dưới vốn</Badge>` (subtle hơn B) |
| `isMissingA === true`                          | Cột `priceA` hiển thị "—" (em-dash) với `text-muted-foreground`                                                                    |
| `isMissingB === true`                          | Cột `priceB` hiển thị "—" với `text-muted-foreground`                                                                              |
| `diffPercent > 0` (giá B cao hơn A)            | Cột `diffPercent` prefix `+` (vd: `+12.50%`) với `text-emerald-700 dark:text-emerald-400` nếu ≤ 10%, override sang amber nếu > 10% |
| `diffPercent < 0` (giá B thấp hơn A)           | Cột `diffPercent` prefix `−` với `text-rose-700 dark:text-rose-400` nếu ≤ 10%, override sang amber nếu < −10%                      |

**And** dòng có `isMissingA && isMissingB === false`: bình thường (sản phẩm chỉ trong 1 bảng). Cảnh báo nhẹ trong cột `diffPercent` hiển thị `Chỉ có ở [A|B]` thay vì giá trị phần trăm.

**And** thứ tự cột ưu tiên hiển thị (desktop): Ảnh SP | Tên + SKU | Giá vốn (WAC) | Giá A | Margin A | Giá B | Margin B | Chênh lệch (số tiền) | Chênh lệch (%)

**And** mobile: gộp thành card 1 cột với 2 sub-section "Bảng A" / "Bảng B" + chip "Chênh lệch X%" trên đầu card.

### AC3: Filter "Chỉ hiện SP dưới vốn" + bộ lọc bổ sung

**Given** đang xem `<ComparePriceListsView>`
**When** click checkbox/toggle "Chỉ hiện SP dưới vốn (bảng B)"
**Then** chỉ hiển thị các row có `isBelowCostB === true` (filter ở client, không gọi lại API)

**And** thêm các filter bổ sung (client-side):

- Toggle "Chỉ hiện SP có chênh lệch > 10%" → filter `Math.abs(diffPercent) > 10`
- Toggle "Chỉ hiện SP có ở cả 2 bảng" → filter `!isMissingA && !isMissingB`
- Search box (debounce 300ms) → filter `productName.toLowerCase().includes(search) || productSku.toLowerCase().includes(search)`
- Các filter này AND với nhau

**And** badge tổng kết phía trên bảng (luôn hiển thị, dựa trên `summary` từ API + filter hiện tại):

- "Tổng: N sản phẩm"
- "Có ở cả 2 bảng: M"
- "Chỉ có ở A: X / Chỉ có ở B: Y"
- "Chênh lệch > 10%: Z"
- "Dưới vốn (B): W" (badge variant `destructive` nếu W > 0)

### AC4: Xuất CSV với đầy đủ cột

**Given** đang xem `<ComparePriceListsView>` với data đã filter
**When** click nút "Xuất CSV"
**Then** generate file CSV ở client (KHÔNG gọi API riêng) với:

- Encoding: **UTF-8 with BOM** (để Excel VN mở không lỗi diacritic). Prepend `﻿` vào string trước khi tạo Blob
- Newline: `\r\n` (Windows / Excel-friendly)
- Delimiter: dấu phẩy `,`
- Field nào chứa `,`, `"`, `\n` thì wrap trong `"` và escape `"` → `""`
- Header (tiếng Việt, lowercase snake_case không dấu để compatible với Excel cũ ưu tiên đọc):
  ```
  product_sku,product_name,cost_price,price_a,margin_a_percent,price_b,margin_b_percent,diff_amount,diff_percent,below_cost_a,below_cost_b
  ```
- Mỗi row format:
  - `cost_price`, `price_a`, `price_b`: integer hoặc rỗng nếu null. KHÔNG format thousands (Excel sẽ tự format)
  - `margin_*`, `diff_percent`: số float làm tròn 2 chữ số hoặc rỗng nếu null. Dùng dấu chấm `.` cho decimal (international, KHÔNG dùng dấu phẩy VN vì sẽ conflict với CSV delimiter)
  - `below_cost_a`, `below_cost_b`: `1` hoặc `0`
  - Nếu sản phẩm không có giá ở 1 bảng → cell tương ứng để rỗng (KHÔNG ghi `null` text)

**And** filename: `so-sanh-bang-gia-{slug-A}-vs-{slug-B}-{YYYY-MM-DD}.csv`. Slug tên bảng giá chuyển sang ASCII không dấu, lowercase, dash-separated, max 30 ký tự / bảng.

- Helper: `slugify(name)` dùng `.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30)` (đơn giản, không cần thư viện).

**And** trigger download bằng cách:

```ts
const blob = new Blob(['﻿' + csvText], { type: 'text/csv;charset=utf-8;' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = filename
document.body.appendChild(a)
a.click()
a.remove()
URL.revokeObjectURL(url)
```

**And** rows export = rows hiện tại sau khi áp filter UI (AC3). Nếu user filter "chỉ dưới vốn" → CSV chỉ chứa các row đó. Hiển thị toast: "Đã xuất N dòng" sau khi download trigger thành công.

**And** nút "Xuất CSV" disable khi `rows.length === 0` (sau filter) hoặc khi đang loading data từ API.

### AC5: Entry point trong UI để mở compare

**Given** Owner/Manager đang ở trang `/pricing` (PriceListsManager)
**When** xem header
**Then** thêm nút "So sánh bảng giá" (icon `GitCompareArrows` từ Lucide hoặc `ArrowLeftRight` nếu chưa có) bên cạnh nút "Bảng giá đã xoá":

- Nút outline, size sm
- onClick mở `<ComparePriceListsDialog>` (modal lớn, không phải full route)
- Disabled với tooltip "Cần ít nhất 2 bảng giá" khi `data.length < 2` (kiểm tra qua `useAllPriceListsQuery` hoặc total từ list query)

**And** Dialog có 2 step:

- **Step 1 — Chọn 2 bảng giá**: 2 dropdown Select (A và B). Options là toàn bộ bảng giá alive trong store (load qua `useAllPriceListsQuery`). Hiển thị tên + chip method ("Trực tiếp" / "Công thức" / "Nối chuỗi") + status (effective/inactive/expired/pending). Nút "So sánh" enable khi cả 2 selected và A ≠ B
- **Step 2 — Bảng so sánh**: hiển thị `<ComparePriceListsView>` với data từ AC1, các filter AC3, nút "Xuất CSV" AC4, nút "Đổi chiều" (swap A ↔ B) ở header step 2, nút "Quay lại" về step 1

**And** Dialog kích thước: `max-w-6xl` desktop (rộng hơn các dialog khác để bảng so sánh đủ cột), `h-[85vh]` để có scroll bên trong; mobile full-screen sheet.

**Alternative (optional, recommend)**: trang `/pricing/compare?a=<id>&b=<id>` cho phép share link. Nếu chọn alternative, vẫn giữ nút mở dialog làm UX nhanh, route compare làm bookmarkable. **Khuyến nghị Phase 1 chỉ implement Dialog**, Phase 2 (story sau) thêm route nếu user yêu cầu.

### AC6: Cảnh báo bảng giá không hiệu lực + edge cases

**Given** đang ở step 2 của dialog
**When** một trong 2 bảng có `effectiveActive === false`
**Then** hiển thị banner phía trên bảng:

- Icon `AlertTriangle` (vàng) + text:
  - "Bảng giá A ({tên}) đang không hiệu lực ({lý do}). Kết quả so sánh chỉ mang tính tham khảo."
  - Lý do tính theo logic AC4 của Story 4.3: "Đã tắt" / "Chưa hiệu lực từ {date}" / "Đã hết hạn từ {date}"

**And** nếu cả 2 bảng đều `effectiveActive === true` → KHÔNG hiển thị banner.

**Edge cases khác**:

- 2 bảng hoàn toàn không trùng productId nào → `rows.length === 0` (cả `summary.bothCount === 0`). UI hiển thị `<EmptyState>` "Hai bảng giá không có sản phẩm chung. Vẫn có {N} SP chỉ ở bảng A và {M} SP chỉ ở bảng B." → cho phép xem các SP một-bên này nếu user uncheck filter "chỉ có ở cả 2 bảng".
- Cả 2 bảng đều rỗng → API trả `rows: []`, `summary` toàn 0. UI hiển thị EmptyState "Cả 2 bảng giá đều chưa có sản phẩm. Hãy thêm sản phẩm rồi so sánh lại."
- `priceA === 0`: `diffPercent = null` (vì chia 0). UI hiển thị "—" thay vì NaN/Infinity. `marginA` cũng null tương ứng.
- `productCostPrice === null` (sản phẩm chưa setup giá vốn): `marginA`, `marginB`, `isBelowCostA`, `isBelowCostB` đều null/false. UI hiển thị margin "—" và KHÔNG hiển thị badge "Dưới vốn".
- 1 bảng bị xoá ở giữa flow (dialog đang mở, user khác xoá): API trả 404 cho lần fetch tiếp theo → UI toast destructive "Bảng giá đã bị xoá, vui lòng chọn lại" và quay về step 1.

### AC7: Permission, Multi-tenant, KHÔNG audit

**Given** ma trận permission
**When** kiểm tra access
**Then** endpoint `/compare` dùng `requireAuth + requirePermission('pricing.manage')` (giống các endpoint khác trong `price-lists.routes.ts`).

**And** Service `comparePriceLists` filter chặt chẽ theo `actor.storeId`. Cross-store access trả 404.

**And** **KHÔNG** ghi audit log (đây là tính năng đọc, không có audit action mới).

**And** Frontend route nếu có `/pricing/compare` (alternative) thì áp `beforeLoad: requirePermissionGuard('pricing.manage')`. Nếu chỉ Dialog (Phase 1 recommended) thì kế thừa permission của parent route `/pricing`.

### AC8: Test coverage

**Backend tests** (file mới `apps/api/src/services/price-lists.service.test.ts` extend hoặc file riêng `price-lists-compare.service.test.ts` co-located):

- ✅ Happy path: 2 bảng A (5 SP), B (4 SP), 3 SP overlap → rows = 6 (5 ∪ 4 = 5+4-3=6), summary chính xác
- ✅ `diffPercent > 10` đếm đúng (vd: priceA=10000, priceB=12000 → +20% → count)
- ✅ `isBelowCostB` đếm đúng khi priceB < costPrice
- ✅ Cross-store isolation: listAId thuộc store khác → 404
- ✅ Soft-deleted price list → 404
- ✅ Soft-deleted product → bị bỏ qua khỏi rows (orphan items skip)
- ✅ Validation: listAId === listBId → VALIDATION_ERROR
- ✅ priceA = 0 → diffPercent = null, marginA = null
- ✅ costPrice = null → margin null, isBelowCost = false
- ✅ Cả 2 bảng rỗng → rows = []

**Integration test** (extend `price-lists-extended.integration.test.ts` hoặc file mới `price-lists-compare.integration.test.ts`):

- Setup store + 5 products (1 không có cost_price) + 3 bảng giá: A direct (5 SP), B formula từ A giảm 10% (5 SP), C direct (3 SP)
- GET `/compare?listAId=A&listBId=B` → expect 200 với rows = 5, mỗi row có diffPercent ≈ -10% (sau rounding)
- GET `/compare?listAId=A&listBId=C` → expect 200 với rows = 5 (A có 5, C có 3, overlap tuỳ setup)
- GET `/compare?listAId=A&listBId=A` → expect VALIDATION_ERROR
- GET `/compare?listAId=<bị xoá>&listBId=A` → expect 404
- Cross-store: setup store2 + listX, GET với storeId của store1 → 404

**Frontend tests** (co-located component test hoặc integration):

- `slugify()` correctness với tiếng Việt: "Bảng giá VIP" → "bang-gia-vip"
- CSV escape: name chứa dấu `,` → wrap quote
- BOM prefix có ở blob output
- Filter logic: toggle "chỉ dưới vốn" → rows giảm đúng
- AC3 search debounce: nhập text → filter sau 300ms

### AC9: Schema response cho frontend type-safety

**Given** response shape ở AC1
**When** define types ở `packages/shared/src/schema/price-list-management.ts` (extend file hiện tại)
**Then** thêm:

```typescript
export const comparePriceListsQuerySchema = z
  .object({
    listAId: z.string().uuid('ID bảng giá A không hợp lệ'),
    listBId: z.string().uuid('ID bảng giá B không hợp lệ'),
  })
  .superRefine((data, ctx) => {
    if (data.listAId === data.listBId) {
      ctx.addIssue({
        code: 'custom',
        path: ['listBId'],
        message: 'Hai bảng giá so sánh phải khác nhau',
      })
    }
  })

export const compareRowSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  productSku: z.string(),
  productImageUrl: z.string().nullable(),
  productSellingPrice: z.number().int().min(0),
  productCostPrice: z.number().int().min(0).nullable(),
  priceA: z.number().int().min(0).nullable(),
  priceB: z.number().int().min(0).nullable(),
  diffAmount: z.number().int().nullable(),
  diffPercent: z.number().nullable(),
  marginA: z.number().nullable(),
  marginB: z.number().nullable(),
  isBelowCostA: z.boolean(),
  isBelowCostB: z.boolean(),
  isMissingA: z.boolean(),
  isMissingB: z.boolean(),
})

export const compareSummarySchema = z.object({
  totalProducts: z.number().int().min(0),
  bothCount: z.number().int().min(0),
  onlyACount: z.number().int().min(0),
  onlyBCount: z.number().int().min(0),
  diffOver10Count: z.number().int().min(0),
  belowCostBCount: z.number().int().min(0),
  belowCostACount: z.number().int().min(0),
})

export const comparePriceListsResponseSchema = z.object({
  listA: priceListDetailSchema,
  listB: priceListDetailSchema,
  rows: z.array(compareRowSchema),
  summary: compareSummarySchema,
})

export type ComparePriceListsQuery = z.infer<typeof comparePriceListsQuerySchema>
export type CompareRow = z.infer<typeof compareRowSchema>
export type CompareSummary = z.infer<typeof compareSummarySchema>
export type ComparePriceListsResponse = z.infer<typeof comparePriceListsResponseSchema>
```

**And** export từ `packages/shared/src/schema/index.ts` (auto-add bằng cách re-export `*` từ `price-list-management.ts`).

## Tasks / Subtasks

### Phase A: Shared schema & helpers

- [ ] **Task 1: Zod schemas + types cho compare** (AC: #1, #9)
  - [ ] 1.1: Mở `packages/shared/src/schema/price-list-management.ts`, append `comparePriceListsQuerySchema`, `compareRowSchema`, `compareSummarySchema`, `comparePriceListsResponseSchema` cùng types tương ứng (theo AC9). Đặt CUỐI file, sau các types hiện hữu.
  - [ ] 1.2: KHÔNG export thủ công ở `index.ts` (đã có `export *` bao trùm). Verify không break existing exports bằng `pnpm --filter shared run typecheck`.

- [ ] **Task 2: Helpers tính compare row** (AC: #1)
  - [ ] 2.1: Tạo file mới `packages/shared/src/utils/price-list-compare.ts` (pure function, dùng được cả backend + frontend nếu cần preview):
    - `computeCompareRow(input: { product, priceA, priceB }): CompareRow` — pure function, deterministic
    - `computeCompareSummary(rows: CompareRow[]): CompareSummary` — derive từ rows (used at backend; frontend filter UI tính riêng)
    - Logic:
      - `diffAmount = priceB !== null && priceA !== null ? priceB - priceA : null`
      - `diffPercent = priceA !== null && priceA > 0 && priceB !== null ? Math.round(((priceB - priceA) / priceA) * 10000) / 100 : null` (làm tròn 2 chữ số)
      - `marginA = priceA !== null && priceA > 0 && costPrice !== null ? Math.round(((priceA - costPrice) / priceA) * 10000) / 100 : null`
      - `marginB = priceB !== null && priceB > 0 && costPrice !== null ? Math.round(((priceB - costPrice) / priceB) * 10000) / 100 : null`
      - `isBelowCostA = priceA !== null && costPrice !== null && priceA < costPrice`
      - `isBelowCostB = priceB !== null && costPrice !== null && priceB < costPrice`
      - `isMissingA = priceA === null`, `isMissingB = priceB === null`
  - [ ] 2.2: Tạo co-located test `packages/shared/src/utils/price-list-compare.test.ts`:
    - Test diffPercent rounding 2 chữ số (10000 → 12345 = +23.45%)
    - Test priceA = 0 → diffPercent = null
    - Test costPrice = null → margin = null, isBelowCost = false
    - Test priceA = priceB → diffPercent = 0 (không null)
    - Test summary count tổng hợp đúng từ rows mock
  - [ ] 2.3: Export từ `packages/shared/src/utils/index.ts` (nếu có) hoặc thêm vào re-export pattern hiện hữu. Verify không trùng tên với `pricing-formulas.ts`.

### Phase B: Backend service + route

- [ ] **Task 3: Service `comparePriceLists`** (AC: #1, #6, #7)
  - [ ] 3.1: Mở `apps/api/src/services/price-lists.service.ts`, append function mới (sau `recalculatePriceList`, trước `clonePriceList`):
    ```typescript
    export interface ComparePriceListsDeps {
      db: Db
      storeId: string
      listAId: string
      listBId: string
    }
    export async function comparePriceLists({
      db,
      storeId,
      listAId,
      listBId,
    }: ComparePriceListsDeps): Promise<ComparePriceListsResponse> {
      /* ... */
    }
    ```
  - [ ] 3.2: Logic theo AC1:
    - Validate listAId !== listBId (defensive — Zod đã chặn nhưng service guard riêng cho trường hợp gọi internal)
    - Load 2 bảng giá metadata bằng `getPriceList({ db, storeId, targetId })` (reuse) — sẽ throw 404 nếu không tìm thấy
    - Load price_list_items cả 2 bảng song song (Promise.all):
      ```ts
      const [itemsA, itemsB] = await Promise.all([
        db.select().from(priceListItems).where(eq(priceListItems.priceListId, listAId)),
        db.select().from(priceListItems).where(eq(priceListItems.priceListId, listBId)),
      ])
      ```
    - Build maps: `mapA = new Map(itemsA.map((i) => [i.productId, Number(i.price)]))`, tương tự `mapB`
    - Tập productIds = `[...new Set([...mapA.keys(), ...mapB.keys()])]`
    - Nếu `productIds.length === 0`: return `{ listA, listB, rows: [], summary: {... toàn 0} }`
    - Load products bulk:
      ```ts
      const productRows = await db
        .select({
          id: products.id,
          name: products.name,
          sku: products.sku,
          imageUrl: products.imageUrl,
          sellingPrice: products.sellingPrice,
          costPrice: products.costPrice,
        })
        .from(products)
        .where(
          and(
            inArray(products.id, productIds),
            eq(products.storeId, storeId),
            isNull(products.deletedAt),
          ),
        )
      ```
    - Build rows bằng `computeCompareRow` từ helper Task 2 cho từng product alive
    - Sort rows bằng `rows.sort((a, b) => a.productName.localeCompare(b.productName, 'vi'))`
    - Compute summary bằng `computeCompareSummary(rows)`
    - Return `{ listA, listB, rows, summary }`
  - [ ] 3.3: Co-located test `apps/api/src/services/price-lists.service.test.ts` (extend hoặc tạo file mới `price-lists-compare.service.test.ts`):
    - Setup test data như AC8
    - Test 10 case theo AC8 (happy, cross-store, soft-delete, validation, edge cases)
    - Sử dụng PGlite test fixture (xem pattern trong `category-discounts.service.test.ts` dòng 1-50)

- [ ] **Task 4: Route `GET /api/v1/price-lists/compare`** (AC: #1, #7)
  - [ ] 4.1: Mở `apps/api/src/routes/price-lists.routes.ts`. **CRITICAL**: mount route `/compare` TRƯỚC `/:id` để không bị parse `compare` thành uuid. Đặt sau `/trashed` (đã pattern này):
    ```typescript
    app.get('/compare', async (c) => {
      const auth = c.get('auth')
      const query = comparePriceListsQuerySchema.parse(c.req.query())
      const data = await comparePriceLists({
        db,
        storeId: auth.storeId,
        listAId: query.listAId,
        listBId: query.listBId,
      })
      return c.json({ data })
    })
    ```
  - [ ] 4.2: Import `comparePriceListsQuerySchema` từ `@kiotviet-lite/shared` ở đầu file routes
  - [ ] 4.3: Import `comparePriceLists` từ services
  - [ ] 4.4: Verify middleware order: `requireAuth + requirePermission('pricing.manage')` đã apply ở `app.use('*', ...)` line 50-51 — không cần thêm

- [ ] **Task 5: Integration test** (AC: #8)
  - [ ] 5.1: Tạo file mới `apps/api/src/__tests__/price-lists-compare.integration.test.ts` theo pattern `price-lists-extended.integration.test.ts`
  - [ ] 5.2: Setup: store + 5 products (1 không có costPrice) + 3 price lists (A direct 5 SP, B formula 5 SP, C direct 3 SP)
  - [ ] 5.3: 6 test cases theo AC8 integration section
  - [ ] 5.4: Test cross-store: setup store2 + 1 product + 1 price list, GET với JWT của store1 → 404

### Phase C: Frontend API client + hooks

- [ ] **Task 6: API client** (AC: #1)
  - [ ] 6.1: Mở `apps/web/src/features/pricing/price-lists-api.ts`, thêm:
    ```typescript
    export function comparePriceListsApi(listAId: string, listBId: string) {
      const params = new URLSearchParams({ listAId, listBId })
      return apiClient.get<Envelope<ComparePriceListsResponse>>(
        `/api/v1/price-lists/compare?${params.toString()}`,
      )
    }
    ```
  - [ ] 6.2: Import `ComparePriceListsResponse` ở top imports

- [ ] **Task 7: TanStack Query hook** (AC: #1)
  - [ ] 7.1: Mở `apps/web/src/features/pricing/use-price-lists.ts`, thêm:
    ```typescript
    export function useComparePriceListsQuery(
      listAId: string | null,
      listBId: string | null,
      options?: { enabled?: boolean },
    ) {
      return useQuery({
        queryKey: [...PRICE_LISTS_KEY, 'compare', listAId, listBId],
        queryFn: async () =>
          (await comparePriceListsApi(listAId as string, listBId as string)).data,
        enabled: Boolean(listAId && listBId && listAId !== listBId && options?.enabled !== false),
        staleTime: 60_000, // 1 phút — data ít thay đổi
      })
    }
    ```
  - [ ] 7.2: KHÔNG cần invalidate ở mutation hiện tại vì compare là read-only và stale 1 phút là chấp nhận được. Nếu user vừa update bảng giá → có thể click lại trong dialog là refetch (queryKey thay đổi với combination listAId/listBId mới hoặc dialog mở lại trigger remount).

### Phase D: Frontend UI

- [ ] **Task 8: Helper CSV export** (AC: #4)
  - [ ] 8.1: Tạo file `apps/web/src/lib/csv.ts` (helper chung, dùng được cho story khác sau này) hoặc inline trong feature folder `apps/web/src/features/pricing/lib/compare-csv.ts`. **Khuyến nghị**: tạo `apps/web/src/lib/csv.ts` để Epic 8 reuse:
    ```typescript
    export function escapeCsvField(value: unknown): string {
      if (value === null || value === undefined) return ''
      const s = String(value)
      if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
      return s
    }
    export function buildCsv(headers: string[], rows: (string | number | null)[][]): string {
      const lines: string[] = []
      lines.push(headers.map(escapeCsvField).join(','))
      for (const row of rows) {
        lines.push(row.map(escapeCsvField).join(','))
      }
      return lines.join('\r\n')
    }
    export function downloadCsv(filename: string, csvText: string): void {
      const blob = new Blob(['﻿' + csvText], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    }
    export function slugify(input: string): string {
      return input
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30)
    }
    ```
  - [ ] 8.2: Co-located test `apps/web/src/lib/csv.test.ts`:
    - Test escapeCsvField với value chứa `,`, `"`, `\n`
    - Test buildCsv 2 row 3 col
    - Test slugify với tên có dấu tiếng Việt: "Bảng giá VIP — Đại lý" → "bang-gia-vip-dai-ly"
    - KHÔNG test downloadCsv (cần DOM, để integration test thay vì unit test)

- [ ] **Task 9: Component `<ComparePriceListsView>`** (AC: #2, #3, #4, #6)
  - [ ] 9.1: Tạo `apps/web/src/features/pricing/components/ComparePriceListsView.tsx`:
    - Props: `{ listAId: string; listBId: string; onSwap: () => void; onBack: () => void }`
    - Gọi `useComparePriceListsQuery(listAId, listBId)`
    - Loading: skeleton table với 8 dòng
    - Error 404 (1 trong 2 bảng đã xoá): toast destructive + onBack()
    - Error khác: text destructive với nút "Thử lại"
    - State filters local: `{ search, onlyBelowCostB, onlyDiffOver10, onlyBoth }`
    - Memo `filteredRows = useMemo(() => applyFilters(data.rows, filters), [data.rows, filters])`
    - Render:
      - Header: tên 2 bảng giá + chip method + status badge (reuse `PriceListStatusBadge`) + nút "Đổi chiều" (icon `ArrowLeftRight`) + nút "Quay lại" + nút "Xuất CSV"
      - Banner cảnh báo (AC6) nếu một trong 2 không effective active
      - Summary chips (AC3 cuối): luôn show summary tổng + summary sau filter (vd: "Hiển thị: M / N")
      - Filter row: Input search + 3 toggle (Switch hoặc Checkbox với label rõ)
      - Bảng so sánh (desktop) — `<ComparePriceListsTable>` — hoặc card list (mobile)
      - Empty states (AC6) tuỳ trường hợp
  - [ ] 9.2: Tạo `apps/web/src/features/pricing/components/ComparePriceListsTable.tsx`:
    - Props: `{ rows: CompareRow[] }`
    - Table với 9 cột: Ảnh, Tên + SKU, Giá vốn, Giá A, Margin A, Giá B, Margin B, Δ tiền, Δ %
    - Sticky header
    - Background row theo AC2 (`Math.abs(diffPercent) > 10` → amber)
    - Cells với badge "Dưới vốn" theo AC2
    - Format số bằng `formatVnd` từ `@/lib/currency`. Margin và Δ% dùng `formatPercent` (có thể tạo helper hoặc inline `value.toFixed(2) + '%'`)
    - "—" cho null
  - [ ] 9.3: Tạo `apps/web/src/features/pricing/components/ComparePriceListsCardList.tsx` (mobile):
    - Mỗi card: ảnh + tên + SKU + chip Δ% trên đầu + 2 sub-block "Bảng A" / "Bảng B" (giá + margin) + badge "Dưới vốn" nếu có
  - [ ] 9.4: Helper `applyCompareFilters(rows, filters)` đặt cùng file `ComparePriceListsView.tsx` hoặc tách `apps/web/src/features/pricing/lib/compare-filters.ts`:
    ```ts
    export function applyCompareFilters(
      rows: CompareRow[],
      filters: CompareFiltersState,
    ): CompareRow[] {
      const term = filters.search.trim().toLowerCase()
      return rows.filter((r) => {
        if (filters.onlyBelowCostB && !r.isBelowCostB) return false
        if (filters.onlyDiffOver10 && (r.diffPercent === null || Math.abs(r.diffPercent) <= 10))
          return false
        if (filters.onlyBoth && (r.isMissingA || r.isMissingB)) return false
        if (
          term &&
          !r.productName.toLowerCase().includes(term) &&
          !r.productSku.toLowerCase().includes(term)
        )
          return false
        return true
      })
    }
    ```
  - [ ] 9.5: Helper export CSV: `buildCompareCsv(rows: CompareRow[]): string` ở `apps/web/src/features/pricing/lib/compare-csv.ts`:
    - Headers theo AC4
    - Map rows sang array của giá trị
    - Dùng `buildCsv` từ Task 8

- [ ] **Task 10: Component `<ComparePriceListsDialog>`** (AC: #5)
  - [ ] 10.1: Tạo `apps/web/src/features/pricing/components/ComparePriceListsDialog.tsx`:
    - Props: `{ open: boolean; onOpenChange: (v: boolean) => void; initialAId?: string; initialBId?: string }`
    - State: `step: 1 | 2`, `listAId`, `listBId`
    - Step 1: 2 Select (load qua `useAllPriceListsQuery({ enabled: open })`). Nút "So sánh" disable khi `!listAId || !listBId || listAId === listBId`. Nút onClick: `setStep(2)`
    - Step 2: render `<ComparePriceListsView>` với `onSwap` (swap A<->B), `onBack` (setStep(1))
    - Khi đóng dialog (onOpenChange false): reset state về step 1 + clear ids
    - Dialog max-w-6xl, h-[85vh] với scroll bên trong
  - [ ] 10.2: Trong `<PriceListsManager>`:
    - Thêm state `compareOpen: boolean`
    - Thêm nút "So sánh bảng giá" (icon `ArrowLeftRight` từ Lucide) bên cạnh nút "Bảng giá đã xoá"
    - Disable + tooltip "Cần ít nhất 2 bảng giá" nếu `meta?.total < 2` (kiểm tra qua list query meta)
    - onClick: `setCompareOpen(true)`
    - Render `<ComparePriceListsDialog open={compareOpen} onOpenChange={setCompareOpen} />` cùng các dialog khác

- [ ] **Task 11: Frontend tests** (AC: #8)
  - [ ] 11.1: Co-located test `apps/web/src/features/pricing/lib/compare-filters.test.ts`:
    - Test `applyCompareFilters` với từng combo filter: empty filter trả nguyên rows, onlyBelowCostB lọc đúng, search lowercase + sku match, AND giữa các filter
  - [ ] 11.2: Co-located test `apps/web/src/features/pricing/lib/compare-csv.test.ts`:
    - Test `buildCompareCsv` với 3 row mock (1 missing A, 1 below cost B, 1 normal) → expect số dòng + header + escape
  - [ ] 11.3: Co-located test `apps/web/src/lib/csv.test.ts` (đã làm ở Task 8.2)
  - [ ] 11.4: Component test `apps/web/src/features/pricing/components/ComparePriceListsView.test.tsx` (optional, nếu thời gian cho phép):
    - Mount với mock useComparePriceListsQuery trả data → expect render summary + table
    - Toggle "Chỉ dưới vốn" → expect filter
    - Click "Xuất CSV" → expect URL.createObjectURL được gọi (mock)

### Phase E: Verification

- [ ] **Task 12: Run full quality gate**
  - [ ] 12.1: `pnpm typecheck` → 0 error toàn bộ workspaces
  - [ ] 12.2: `pnpm lint` → 0 error mới (warning pre-existing OK)
  - [ ] 12.3: `pnpm test` → toàn bộ test pass (existing 978 + ~15 mới = ~993)
  - [ ] 12.4: `pnpm --filter web run build` → success (lưu ý dependency mismatch zod/resolvers từ 4.3b — KHÔNG fix trong story này, ghi nhận ở Dev Notes)
  - [ ] 12.5: Manual QA trên dev server:
    - Tạo 2 bảng giá test với data hợp lệ + có overlap SP
    - Open dialog So sánh, chọn 2 bảng, verify highlight + summary
    - Toggle filter, verify rows update
    - Click Xuất CSV, mở file Excel verify diacritic không lỗi (BOM hoạt động)
    - Test edge case: 2 bảng không overlap, 1 bảng rỗng, 1 bảng không hiệu lực
  - [ ] 12.6: Run `npx gitnexus analyze --embeddings` (preserve embeddings) sau khi commit để update graph cho stories sau

## Dev Notes

### Architecture & Patterns

**Source files quan trọng cần đọc trước khi code (theo thứ tự):**

1. `_bmad-output/implementation-artifacts/4-3-bang-gia-direct-formula.md` (1182 lines) — predecessor story, đặc biệt section "Coupling notes" (lines 912-918)
2. `_bmad-output/implementation-artifacts/4-3b-chain-formula-clone-import-bang-gia.md` (570 lines) — pattern extend service/route/dialog đã established
3. `apps/api/src/services/price-lists.service.ts` (~1000 lines, hiện tại có direct/formula/chain/clone/import/recalculate)
4. `apps/api/src/routes/price-lists.routes.ts` (242 lines, mount order: `/trashed` trước `/:id`)
5. `apps/api/src/services/price-list-items.service.ts` (~250 lines, pattern join với products để lấy cost/selling price)
6. `packages/shared/src/schema/price-list-management.ts` (~244 lines, đã có discriminated union, types)
7. `packages/shared/src/utils/pricing-formulas.ts` (~99 lines, applyFormula/applyRounding/computeFinalPrice)
8. `apps/web/src/features/pricing/components/PriceListsManager.tsx` (151 lines, parent container thêm nút compare)
9. `apps/web/src/features/pricing/components/PriceListDetail.tsx` — pattern detail page
10. `apps/web/src/features/pricing/use-price-lists.ts` — pattern hooks

**Patterns đã có sẵn — REUSE, KHÔNG VIẾT LẠI:**

- `getPriceList({ db, storeId, targetId })` — load metadata + ownership check + 404 throw — REUSE cho load listA/listB
- `escapeLikePattern` từ `apps/api/src/lib/strings.ts` — KHÔNG cần ở story này (search ở client)
- `ApiError('NOT_FOUND' | 'VALIDATION_ERROR', message)` từ `apps/api/src/lib/errors.ts`
- `useAllPriceListsQuery({ enabled })` — load toàn bộ price lists alive cho dropdown chọn (đã có trong `use-price-lists.ts`)
- `<PriceListStatusBadge>` — render status badge theo AC4 của Story 4.3 — REUSE trong banner cảnh báo và header step 2
- `formatVnd` từ `@/lib/currency` — format số tiền VND
- `<EmptyState>` từ `@/components/shared/empty-state` — empty cases AC6
- `useDebounced` từ `@/hooks/use-debounced` — debounce search trong filter

**Pattern KHÔNG-có nhưng cần tạo mới:**

- `apps/web/src/lib/csv.ts` — helpers `escapeCsvField`, `buildCsv`, `downloadCsv`, `slugify` (Task 8). Project hiện chưa có CSV export — file này là FOUNDATION cho Epic 8 (Báo cáo) sau này. Đặt ở `lib/` chứ KHÔNG `features/pricing/` để dùng chung.
- `packages/shared/src/utils/price-list-compare.ts` — pure functions tính compare row + summary. Pure để dùng được cả backend (Task 3) và frontend test (Task 11).

**Multi-tenant isolation pattern:**
Mọi query MUST filter `storeId = actor.storeId AND deletedAt IS NULL`. KHÔNG có ngoại lệ. Test cross-store mọi function mới (Task 5.4).

**Read-only nature:**
Story 4.3c là tính năng đọc thuần. KHÔNG transaction, KHÔNG audit log, KHÔNG mutation. Mọi service function `async` chỉ select.

### Quan trọng — KHÔNG làm

- **KHÔNG** thêm bảng DB mới hoặc sửa schema price_lists/price_list_items
- **KHÔNG** thêm audit action mới (đây là read operation)
- **KHÔNG** implement export Excel (.xlsx) — chỉ CSV. Excel cần thư viện (exceljs) — defer Epic 8
- **KHÔNG** implement background job/queue — data ≤ 1000 rows, in-line đủ
- **KHÔNG** đổi response shape của các endpoint cũ trong `price-lists.routes.ts`
- **KHÔNG** thêm field mới vào `priceListDetailSchema` — reuse nguyên trạng cho `listA`/`listB`
- **KHÔNG** cache CSV ở backend — sinh CSV ở client từ JSON response
- **KHÔNG** bypass `requirePermission('pricing.manage')` — endpoint `/compare` cần permission như các endpoint khác
- **KHÔNG** mount route `/compare` SAU `/:id` (sẽ bị Hono parse "compare" thành uuid → 400 lỗi). PHẢI trước.
- **KHÔNG** dùng `Math.round((priceB - priceA) / priceA * 100)` rồi divide 100 cho percent — sẽ mất precision. Dùng pattern `Math.round(value * 100) / 100` để giữ 2 chữ số đúng cách.
- **KHÔNG** rely vào `effectiveActive` để filter ra bảng giá khỏi compare — vẫn cho phép so sánh bảng đã tắt/hết hạn (AC6 chỉ banner cảnh báo)
- **KHÔNG** tạo audit log frontend feature mới — chỉ tận dụng existing pattern

### Field naming conventions

- DB columns: snake_case (`product_id`, `price_list_id`)
- Drizzle: camelCase với column mapping tự động (`productId`, `priceListId`)
- Zod / API JSON: camelCase (`listAId`, `listBId`, `priceA`, `priceB`)
- Frontend types: PascalCase (`CompareRow`, `ComparePriceListsResponse`)
- Helper file: kebab-case (`price-list-compare.ts`, `compare-filters.ts`, `compare-csv.ts`)
- Component: PascalCase (`ComparePriceListsDialog.tsx`, `ComparePriceListsView.tsx`)

### CSV Format chi tiết

- **Encoding**: UTF-8 with BOM (`﻿` prefix). Lý do: Excel VN trên Windows mở UTF-8 không BOM sẽ corrupted diacritic → lỗi `Bảng giá VIP` thành `BÃ¡ng giÃ¡ VIP`. BOM fix triệt để.
- **Newline**: `\r\n` (CRLF). Excel ưu tiên CRLF; LF có thể gộp dòng trên Windows.
- **Decimal separator**: dấu chấm `.` (international standard). KHÔNG dùng dấu phẩy VN vì conflict với CSV delimiter.
- **Number format**: integer cho VND, float 2 chữ số cho margin/diffPercent. KHÔNG thousands separator (Excel sẽ tự apply theo locale của user).
- **Empty cell**: hoàn toàn rỗng (KHÔNG `null`, `N/A`, hay `--`).
- **Boolean**: `1` / `0` (KHÔNG `true` / `false`, KHÔNG empty cho false). Excel filter cột số dễ hơn.

### Performance Considerations

- 1 query products bulk + 2 query price_list_items + 1 query mỗi metadata = max 5 queries / 1 compare. Acceptable.
- Tổng data tối đa MVP: 1 store ≤ 1000 SP × 2 bảng = 2000 items + 1000 product rows ≈ 100KB JSON. In-line OK.
- Frontend filter ở client trên rows ≤ 1000 — virtual scroll KHÔNG cần thiết. Nếu > 5000 trong tương lai, switch sang `react-virtual`.
- CSV size: 1000 rows × 11 columns × ~30 bytes = ~330KB. Browser download instant.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-4-khch-hng-h-thng-n-gi.md#Story-4.3c` (lines 154-175)]
- [Source: `_bmad-output/implementation-artifacts/4-3-bang-gia-direct-formula.md` AC4 effectiveActive logic (lines 156-180)]
- [Source: `_bmad-output/implementation-artifacts/4-3b-chain-formula-clone-import-bang-gia.md` Pattern extend service (lines 200-400)]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification/export-ui-specification.md` (CSV format guidelines)]
- [Source: `_bmad-output/project-context.md` (Anti-patterns, naming conventions, integer arithmetic VND)]
- [Source: `apps/api/src/services/price-lists.service.ts` (full file, đặc biệt `getPriceList`)]
- [Source: `apps/api/src/services/price-list-items.service.ts` (pattern JOIN products để lấy cost/selling)]
- [Source: `apps/web/src/features/pricing/components/PriceListsManager.tsx` (parent container thêm nút compare)]
- [Source: `apps/web/src/features/pricing/components/CreatePriceListDialog.tsx` ImportForm (pattern xử lý CSV ở client, dòng 940-1130)]
- [Source: `packages/shared/src/utils/pricing-formulas.ts` (pattern pure helper)]

### Project Structure Notes

Story tuân thủ structure đã establish ở Story 4.3 và 4.3b:

```
packages/shared/src/
├── schema/price-list-management.ts        # Extend: thêm comparePriceListsQuerySchema, types (Task 1)
└── utils/
    ├── pricing-formulas.ts                # Đã có
    └── price-list-compare.ts              # NEW (Task 2): pure helpers compare row/summary

apps/api/src/
├── services/price-lists.service.ts        # Extend: thêm comparePriceLists (Task 3)
├── routes/price-lists.routes.ts           # Extend: thêm GET /compare (Task 4)
└── __tests__/price-lists-compare.integration.test.ts  # NEW (Task 5)

apps/web/src/
├── lib/csv.ts                             # NEW (Task 8): foundation CSV export reuse Epic 8
├── features/pricing/
│   ├── price-lists-api.ts                 # Extend: thêm comparePriceListsApi (Task 6)
│   ├── use-price-lists.ts                 # Extend: thêm useComparePriceListsQuery (Task 7)
│   ├── components/
│   │   ├── ComparePriceListsDialog.tsx    # NEW (Task 10)
│   │   ├── ComparePriceListsView.tsx      # NEW (Task 9)
│   │   ├── ComparePriceListsTable.tsx     # NEW (Task 9)
│   │   ├── ComparePriceListsCardList.tsx  # NEW (Task 9)
│   │   └── PriceListsManager.tsx          # Edit: thêm nút "So sánh" (Task 10.2)
│   └── lib/                               # NEW folder nếu chưa có
│       ├── compare-filters.ts             # NEW (Task 9.4)
│       └── compare-csv.ts                 # NEW (Task 9.5)
```

**Lưu ý**: Folder `apps/web/src/features/pricing/lib/` có thể chưa tồn tại. Nếu chưa, tạo mới — pattern này hợp lý vì 4.3c có nhiều helper, KHÔNG nhét tất cả vào `components/`.

### Dependencies trên các stories khác

- **Yêu cầu Story 4.3 đã done** ✅ (sprint-status: 4-3 = done)
- **Yêu cầu Story 4.3b đã done/review** ✅ (sprint-status: 4-3b = done) — cần `useAllPriceListsQuery`, schema chain method, status filter
- **KHÔNG block story nào** (Story 4.4, 4.5 đã done — story 4.3c là tính năng độc lập, không trên critical path Epic 4)

### Open Questions / Notes for Dev

1. **Có nên thêm route `/pricing/compare?a=&b=` cho shareable link không?** Decision: Phase 1 chỉ làm Dialog (đơn giản, nhanh, đủ AC). Phase 2 (story sau) thêm route nếu user request feature share.

2. **CSV có nên export phần summary (totalProducts, bothCount, ...) không?** Decision: KHÔNG. Chỉ export rows. Summary là metadata UI, user có thể tự đếm trong Excel. Giữ format CSV đơn giản, parse dễ.

3. **Khi 1 trong 2 bảng đã xoá giữa flow, có nên fallback hiển thị partial data không?** Decision: KHÔNG. Trả 404 sạch, UI redirect về step 1 + toast lỗi rõ ràng.

4. **Margin formula nên là `(price - cost) / price` (margin) hay `(price - cost) / cost` (markup)?** Decision: dùng **margin** = `(price - cost) / price`. Đây là chuẩn kinh doanh bán lẻ VN (lợi nhuận trên doanh thu). Markup (lợi nhuận trên giá vốn) là khái niệm khác và ít thông dụng hơn. NẾU user feedback yêu cầu cả 2 → bổ sung sau.

5. **`diffPercent` reference base là priceA hay priceB?** Decision: `(priceB - priceA) / priceA * 100`. Nghĩa là "B chênh lệch X% so với A". Ngược lại sẽ confuse. Cần document rõ trong tooltip cột UI và header CSV: "diff_percent (vs A)".

6. **Khi user swap A ↔ B, có nên invalidate query cũ không?** Decision: KHÔNG cần — queryKey thay đổi (vị trí listAId/listBId hoán đổi) → tự động fetch query mới. Cache query cũ giữ lại để tăng tốc nếu user swap qua lại.

7. **Có cần i18n cho label "Bảng A" / "Bảng B" không?** Decision: KHÔNG. Project hiện chỉ dùng tiếng Việt, KHÔNG có i18n framework. Hardcode tiếng Việt.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

(Để trống — dev điền khi gặp vấn đề)

### Completion Notes List

(Để trống — dev điền sau khi hoàn thành)

### File List

(Để trống — dev điền danh sách file modified/new sau khi hoàn thành)

### Review Findings

- [ ] [Review][Patch] Nút "So sánh bảng giá" disable sai khi user filter list — `meta.total` lấy từ filtered list query, làm button bị disable khi search/filter dù store có ≥ 2 bảng. Cần dùng count tổng số bảng giá thực tế. [apps/web/src/features/pricing/components/PriceListsManager.tsx:80-81]
- [ ] [Review][Patch] EmptyState không phân biệt "không có chung" vs "cả 2 rỗng" — AC6 yêu cầu 2 message khác nhau, code chỉ check `rows.length === 0` nên cả 2 trường hợp ra cùng message. Cần thêm logic dùng `summary` để chọn message phù hợp. [apps/web/src/features/pricing/components/ComparePriceListsView.tsx:248-253]
- [ ] [Review][Patch] Integration test thiếu 3 case AC8 yêu cầu — soft-deleted product (orphan items skip), priceA = 0, cả 2 bảng rỗng. [apps/api/src/__tests__/price-lists-compare.integration.test.ts]
- [x] [Review][Defer] Banner reason 'Đã bị xoá' là dead path do getPriceList throw 404 trước — defensive code, giữ lại an toàn. [apps/web/src/features/pricing/components/ComparePriceListsView.tsx:45] — deferred, defensive
