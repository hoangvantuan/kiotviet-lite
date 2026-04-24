# Starter Template Evaluation

## Primary Technology Domain

**SPA/PWA Web App** — không cần SSR/SSG (app nội bộ, không SEO), cần offline-first.

Next.js bị loại vì: SSR không cần, thêm complexity, khó control offline behavior. Vite + React là lựa chọn tối ưu cho SPA thuần.

## Starter đã chọn: Vite + React + TypeScript (manual setup)

**Lý do không dùng starter template có sẵn:**

- Dự án có yêu cầu đặc thù (PGlite offline, monorepo, Hono backend) — không starter nào cover đủ
- Setup thủ công với Vite 8 rất nhanh (< 5 phút)
- Kiểm soát hoàn toàn dependencies, không phải xóa thứ không cần

**Initialization Command:**

```bash
mkdir kiotviet-lite && cd kiotviet-lite
pnpm init
# Tạo monorepo structure
mkdir -p apps/web apps/api packages/shared
# Init Vite + React cho frontend
cd apps/web && pnpm create vite . --template react-ts
# Init Hono cho backend
cd ../api && pnpm init
```

**Quyết định kiến trúc do starter cung cấp:**

| Quyết định    | Giá trị                     |
| ------------- | --------------------------- |
| Language      | TypeScript (strict mode)    |
| Build tool    | Vite 8.0 (Rolldown bundler) |
| UI Framework  | React 19.2                  |
| Module system | ESM only                    |
| Dev server    | Vite dev server (HMR)       |


**Lưu ý:** Khởi tạo project = story đầu tiên trong sprint.

---
