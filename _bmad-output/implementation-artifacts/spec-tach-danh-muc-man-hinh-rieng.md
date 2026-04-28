---
title: 'Tách Quản lý danh mục thành màn hình riêng'
type: 'refactor'
created: '2026-04-28'
status: 'done'
route: 'one-shot'
---

## Intent

**Problem:** Quản lý danh mục chỉ truy cập được qua nút trong màn hình Sản phẩm, không có mục riêng trong sidebar navigation.

**Approach:** Thêm nav item "Danh mục" vào sidebar (sau "Hàng hóa"), xoá nút "Quản lý danh mục" khỏi trang Sản phẩm, sửa logic active state để tránh highlight 2 item cùng lúc khi route lồng nhau.

## Suggested Review Order

1. [nav-items.ts](../../apps/web/src/components/layout/nav-items.ts) — thêm `findActivePath` helper và nav item "Danh mục"
2. [sidebar.tsx](../../apps/web/src/components/layout/sidebar.tsx) — dùng `findActivePath` thay logic `startsWith` cũ
3. [bottom-tab-bar.tsx](../../apps/web/src/components/layout/bottom-tab-bar.tsx) — cùng fix active state
4. [products-manager.tsx](../../apps/web/src/features/products/products-manager.tsx) — xoá nút "Quản lý danh mục" và import thừa
