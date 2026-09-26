/**
 * Database Seeder - Tạo dữ liệu test đầy đủ cho KiotViet Lite
 *
 * Chạy: npx tsx src/db/seed.ts
 *
 * Dữ liệu seed:
 * - 1 cửa hàng + 3 user (owner/manager/staff)
 * - 5 danh mục (2 cha + 3 con)
 * - 15 sản phẩm (5 đơn giản, 5 có biến thể, 5 có quy đổi đơn vị)
 * - 10 biến thể sản phẩm
 * - 5 quy đổi đơn vị
 * - 3 nhóm khách hàng + 10 khách hàng
 * - 5 nhà cung cấp
 * - 2 bảng giá hợp lệ tạo qua service: Giá sỉ (direct) + Giá VIP giảm 5% so với giá sỉ (formula), gắn cho nhóm KH
 * - 3 phiếu nhập kho + items + inventory transactions
 *
 * Tồn kho chỉ sinh từ chứng từ (ADR 0006): mỗi mặt hàng có một dòng sổ tồn đầu kỳ
 * (type 'initial_stock') cộng các dòng nhập của phiếu nhập, nên current_stock luôn
 * bằng tổng sổ giao dịch kho. Seed không tạo đơn bán nên tổng mua của khách bằng 0.
 */

import bcrypt from 'bcryptjs'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { pathToFileURL } from 'node:url'
import postgres from 'postgres'
import { uuidv7 } from 'uuidv7'

import { createPriceListSchema, DEV_SEED_ACCOUNTS, DEV_SEED_PASSWORD } from '@kiotviet-lite/shared'
import * as schema from '@kiotviet-lite/shared/schema'

import { createPriceList } from '../services/price-lists.service.js'
import type { Db } from './index.js'
import { assertSeedSafe } from './seed-guard.js'

import 'dotenv/config'

const {
  stores,
  users,
  categories,
  products,
  productVariants,
  productUnitConversions,
  customerGroups,
  customers,
  suppliers,
  purchaseOrders,
  purchaseOrderItems,
  inventoryTransactions,
} = schema

async function hash(plain: string) {
  return bcrypt.hash(plain, 10)
}

export async function seed(db: Db) {
  await assertSeedSafe(db)
  console.log('🌱 Bắt đầu seed dữ liệu...\n')

  // Xoá toàn bộ dữ liệu cũ (thứ tự ngược quan hệ FK)
  console.log('🗑️  Xoá dữ liệu cũ...')
  await db.execute(sql`TRUNCATE TABLE
    notification_deliveries,
    notification_rules,
    notification_channels,
    audit_logs,
    refresh_tokens,
    inventory_transactions,
    purchase_order_items,
    purchase_orders,
    price_list_items,
    price_lists,
    customers,
    customer_groups,
    suppliers,
    product_unit_conversions,
    product_variants,
    products,
    categories,
    users,
    stores
    CASCADE`)

  // ─── 1. Store ───
  console.log('📦 Tạo cửa hàng...')
  const storeId = uuidv7()
  await db.insert(stores).values({
    id: storeId,
    name: 'KiotViet Demo Store',
    address: '123 Nguyễn Huệ, Q.1, TP.HCM',
    phone: '02812345678',
  })

  // ─── 2. Users ───
  console.log('👤 Tạo nhân viên...')
  const pwdHash = await hash(DEV_SEED_PASSWORD)
  const pinOwner = await hash('111111')
  const pinManager = await hash('222222')
  const pinStaff = await hash('333333')

  const ownerId = uuidv7()
  const managerId = uuidv7()
  const staffId = uuidv7()

  await db.insert(users).values([
    {
      id: ownerId,
      storeId,
      name: DEV_SEED_ACCOUNTS[0].name,
      phone: DEV_SEED_ACCOUNTS[0].phone,
      passwordHash: pwdHash,
      pinHash: pinOwner,
      role: 'owner',
    },
    {
      id: managerId,
      storeId,
      name: DEV_SEED_ACCOUNTS[1].name,
      phone: DEV_SEED_ACCOUNTS[1].phone,
      passwordHash: pwdHash,
      pinHash: pinManager,
      role: 'manager',
    },
    {
      id: staffId,
      storeId,
      name: DEV_SEED_ACCOUNTS[2].name,
      phone: DEV_SEED_ACCOUNTS[2].phone,
      passwordHash: pwdHash,
      pinHash: pinStaff,
      role: 'staff',
    },
  ])

  // ─── 3. Categories (10 danh mục: 4 cha + 6 con) ───
  console.log('📂 Tạo danh mục...')
  const cat = {
    thucPham: uuidv7(),
    doUong: uuidv7(),
    giaDung: uuidv7(),
    suaChe: uuidv7(),
    rauCu: uuidv7(),
    thit: uuidv7(),
    giaVi: uuidv7(),
    nuocNgot: uuidv7(),
    bia: uuidv7(),
    veSmh: uuidv7(),
  }

  await db.insert(categories).values([
    { id: cat.thucPham, storeId, name: 'Thực phẩm', sortOrder: 0 },
    { id: cat.doUong, storeId, name: 'Đồ uống', sortOrder: 1 },
    { id: cat.giaDung, storeId, name: 'Gia dụng', sortOrder: 2 },
    { id: cat.suaChe, storeId, name: 'Sữa & Chế phẩm', sortOrder: 3 },
  ])
  await db.insert(categories).values([
    { id: cat.rauCu, storeId, name: 'Rau củ quả', parentId: cat.thucPham, sortOrder: 0 },
    { id: cat.thit, storeId, name: 'Thịt & Hải sản', parentId: cat.thucPham, sortOrder: 1 },
    { id: cat.giaVi, storeId, name: 'Gia vị & Nước chấm', parentId: cat.thucPham, sortOrder: 2 },
    { id: cat.nuocNgot, storeId, name: 'Nước ngọt', parentId: cat.doUong, sortOrder: 0 },
    { id: cat.bia, storeId, name: 'Bia & Nước tăng lực', parentId: cat.doUong, sortOrder: 1 },
    { id: cat.veSmh, storeId, name: 'Vệ sinh & Chăm sóc', parentId: cat.giaDung, sortOrder: 0 },
  ])

  // ─── 4. Products (~55 sản phẩm) ───
  console.log('📦 Tạo sản phẩm...')

  // Mặt hàng giữ tồn (sản phẩm không biến thể hoặc từng biến thể), khoá theo SKU.
  // Dùng để ghi sổ tồn đầu kỳ và dòng phiếu nhập khớp đúng tồn cuối.
  type StockItem = {
    productId: string
    variantId: string | null
    name: string
    variantLabel: string | null
    sku: string
    cost: number
    stock: number
  }
  const stockItems = new Map<string, StockItem>()
  const productNames = new Map<string, string>()
  const productPricing = new Map<string, { price: number; cost: number }>()

  // Helper: insert 1 sản phẩm, trả về id
  async function addProduct(p: {
    name: string
    sku: string
    cat: string
    price: number
    cost: number
    unit: string
    stock: number
    hasVariants?: boolean
    barcode?: string
  }) {
    const id = uuidv7()
    await db.insert(products).values({
      id,
      storeId,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      categoryId: p.cat,
      sellingPrice: p.price,
      costPrice: p.cost,
      unit: p.unit,
      status: 'active',
      hasVariants: p.hasVariants ?? false,
      trackInventory: true,
      // Giống app: tồn cấp sản phẩm cha bằng tổng tồn biến thể, cập nhật sau khi tạo biến thể
      currentStock: p.hasVariants ? 0 : p.stock,
      minStock: 5,
    })
    productNames.set(id, p.name)
    productPricing.set(id, { price: p.price, cost: p.cost })
    if (!p.hasVariants) {
      stockItems.set(p.sku, {
        productId: id,
        variantId: null,
        name: p.name,
        variantLabel: null,
        sku: p.sku,
        cost: p.cost,
        stock: p.stock,
      })
    }
    return id
  }

  // ── Rau củ quả (8 SP) ──
  const simpleProducts = [
    {
      name: 'Cà rốt',
      sku: 'RC001',
      cat: cat.rauCu,
      price: 25000,
      cost: 18000,
      unit: 'Kg',
      stock: 50,
    },
    {
      name: 'Khoai tây',
      sku: 'KT001',
      cat: cat.rauCu,
      price: 30000,
      cost: 20000,
      unit: 'Kg',
      stock: 40,
    },
    {
      name: 'Bắp cải',
      sku: 'BC001',
      cat: cat.rauCu,
      price: 15000,
      cost: 10000,
      unit: 'Kg',
      stock: 30,
    },
    {
      name: 'Hành tây',
      sku: 'HT001',
      cat: cat.rauCu,
      price: 20000,
      cost: 14000,
      unit: 'Kg',
      stock: 35,
    },
    {
      name: 'Cà chua',
      sku: 'CT001',
      cat: cat.rauCu,
      price: 22000,
      cost: 15000,
      unit: 'Kg',
      stock: 45,
    },
    {
      name: 'Dưa leo',
      sku: 'DL001',
      cat: cat.rauCu,
      price: 18000,
      cost: 12000,
      unit: 'Kg',
      stock: 40,
    },
    {
      name: 'Ớt chuông đỏ',
      sku: 'OC001',
      cat: cat.rauCu,
      price: 55000,
      cost: 40000,
      unit: 'Kg',
      stock: 15,
    },
    {
      name: 'Nấm rơm',
      sku: 'NR001',
      cat: cat.rauCu,
      price: 45000,
      cost: 32000,
      unit: 'Kg',
      stock: 20,
    },
  ]
  const simpleProductIds: string[] = []
  for (const p of simpleProducts) simpleProductIds.push(await addProduct(p))

  // ── Thịt & Hải sản (7 SP) ──
  const meatProducts = [
    {
      name: 'Thịt heo ba chỉ',
      sku: 'TH001',
      cat: cat.thit,
      price: 120000,
      cost: 95000,
      unit: 'Kg',
      stock: 20,
    },
    {
      name: 'Thịt bò Úc',
      sku: 'TB001',
      cat: cat.thit,
      price: 280000,
      cost: 220000,
      unit: 'Kg',
      stock: 15,
    },
    {
      name: 'Thịt gà ta',
      sku: 'TG001',
      cat: cat.thit,
      price: 95000,
      cost: 75000,
      unit: 'Kg',
      stock: 25,
    },
    {
      name: 'Cá hồi phi lê',
      sku: 'CH001',
      cat: cat.thit,
      price: 350000,
      cost: 280000,
      unit: 'Kg',
      stock: 10,
    },
    {
      name: 'Tôm sú',
      sku: 'TS001',
      cat: cat.thit,
      price: 250000,
      cost: 200000,
      unit: 'Kg',
      stock: 12,
    },
    {
      name: 'Sườn non heo',
      sku: 'SN001',
      cat: cat.thit,
      price: 150000,
      cost: 120000,
      unit: 'Kg',
      stock: 18,
    },
    {
      name: 'Cá basa phi lê',
      sku: 'CB001',
      cat: cat.thit,
      price: 65000,
      cost: 48000,
      unit: 'Kg',
      stock: 30,
    },
  ]
  for (const p of meatProducts) simpleProductIds.push(await addProduct(p))

  // ── Gia vị & Nước chấm (6 SP) ──
  const seasoningProducts = [
    {
      name: 'Nước mắm Nam Ngư',
      sku: 'NM001',
      cat: cat.giaVi,
      price: 25000,
      cost: 17000,
      unit: 'Chai',
      stock: 60,
    },
    {
      name: 'Nước tương Maggi',
      sku: 'MG001',
      cat: cat.giaVi,
      price: 18000,
      cost: 12000,
      unit: 'Chai',
      stock: 50,
    },
    {
      name: 'Dầu hào Lee Kum Kee',
      sku: 'DH001',
      cat: cat.giaVi,
      price: 42000,
      cost: 30000,
      unit: 'Chai',
      stock: 35,
    },
    {
      name: 'Bột ngọt Ajinomoto',
      sku: 'BN001',
      cat: cat.giaVi,
      price: 32000,
      cost: 22000,
      unit: 'Gói',
      stock: 80,
    },
    {
      name: 'Hạt nêm Knorr',
      sku: 'HN001',
      cat: cat.giaVi,
      price: 28000,
      cost: 19000,
      unit: 'Gói',
      stock: 70,
    },
    {
      name: 'Tương ớt Chinsu',
      sku: 'TO001',
      cat: cat.giaVi,
      price: 15000,
      cost: 10000,
      unit: 'Chai',
      stock: 55,
    },
  ]
  for (const p of seasoningProducts) simpleProductIds.push(await addProduct(p))

  // ── Sữa & Chế phẩm (5 SP, có quy đổi ĐV) ──
  const unitProducts = [
    {
      name: 'Sữa tươi Vinamilk',
      sku: 'SV001',
      cat: cat.suaChe,
      price: 7000,
      cost: 4500,
      unit: 'Hộp',
      stock: 200,
    },
    {
      name: 'Sữa đặc Ông Thọ',
      sku: 'SD001',
      cat: cat.suaChe,
      price: 12000,
      cost: 8000,
      unit: 'Hộp',
      stock: 150,
    },
    {
      name: 'Sữa chua Vinamilk',
      sku: 'SC001',
      cat: cat.suaChe,
      price: 5000,
      cost: 3200,
      unit: 'Hộp',
      stock: 180,
    },
    {
      name: 'Sữa bột Ensure',
      sku: 'SE001',
      cat: cat.suaChe,
      price: 450000,
      cost: 350000,
      unit: 'Hộp',
      stock: 30,
    },
    {
      name: 'Phô mai Con Bò Cười',
      sku: 'PM001',
      cat: cat.suaChe,
      price: 35000,
      cost: 24000,
      unit: 'Hộp',
      stock: 60,
    },
  ]
  const unitProductIds: string[] = []
  for (const p of unitProducts) unitProductIds.push(await addProduct(p))

  // ── Nước ngọt (8 SP, 7 có biến thể; Trà xanh bán đơn giản) ──
  const variantProducts = [
    {
      name: 'Coca-Cola',
      sku: 'CC001',
      cat: cat.nuocNgot,
      price: 10000,
      cost: 7000,
      unit: 'Lon',
      stock: 100,
    },
    {
      name: 'Pepsi',
      sku: 'PP001',
      cat: cat.nuocNgot,
      price: 10000,
      cost: 7000,
      unit: 'Lon',
      stock: 100,
    },
    {
      name: 'Sting',
      sku: 'ST001',
      cat: cat.nuocNgot,
      price: 10000,
      cost: 7000,
      unit: 'Chai',
      stock: 80,
    },
    {
      name: 'Nước suối Aquafina',
      sku: 'AQ001',
      cat: cat.nuocNgot,
      price: 5000,
      cost: 3000,
      unit: 'Chai',
      stock: 150,
    },
    {
      name: '7-Up',
      sku: '7U001',
      cat: cat.nuocNgot,
      price: 10000,
      cost: 7000,
      unit: 'Lon',
      stock: 90,
    },
    {
      name: 'Fanta',
      sku: 'FT001',
      cat: cat.nuocNgot,
      price: 10000,
      cost: 7000,
      unit: 'Lon',
      stock: 85,
    },
    {
      name: 'Mirinda',
      sku: 'MR001',
      cat: cat.nuocNgot,
      price: 10000,
      cost: 7000,
      unit: 'Lon',
      stock: 80,
    },
    {
      name: 'Trà xanh Không Độ',
      sku: 'TX001',
      cat: cat.nuocNgot,
      price: 10000,
      cost: 6500,
      unit: 'Chai',
      stock: 120,
      hasVariants: false,
    },
  ]
  const variantProductIds: string[] = []
  for (const p of variantProducts)
    variantProductIds.push(await addProduct({ hasVariants: true, ...p }))

  // ── Bia & Nước tăng lực (5 SP, 3 có biến thể; Saigon Special và Red Bull bán đơn giản) ──
  const beerProducts = [
    {
      name: 'Bia Tiger',
      sku: 'BT001',
      cat: cat.bia,
      price: 15000,
      cost: 11000,
      unit: 'Lon',
      stock: 120,
    },
    {
      name: 'Bia Heineken',
      sku: 'BH001',
      cat: cat.bia,
      price: 18000,
      cost: 13000,
      unit: 'Lon',
      stock: 100,
    },
    {
      name: 'Bia Saigon Special',
      sku: 'BS001',
      cat: cat.bia,
      price: 14000,
      cost: 10000,
      unit: 'Lon',
      stock: 110,
      hasVariants: false,
    },
    {
      name: 'Red Bull',
      sku: 'RB001',
      cat: cat.bia,
      price: 10000,
      cost: 7000,
      unit: 'Lon',
      stock: 90,
      hasVariants: false,
    },
    {
      name: 'Bia 333',
      sku: 'B3001',
      cat: cat.bia,
      price: 12000,
      cost: 8500,
      unit: 'Lon',
      stock: 130,
    },
  ]
  for (const p of beerProducts)
    variantProductIds.push(await addProduct({ hasVariants: true, ...p }))

  // ── Gia dụng & Vệ sinh (6 SP, có quy đổi ĐV) ──
  const homeProducts = [
    {
      name: 'Bột giặt Omo',
      sku: 'BO001',
      cat: cat.veSmh,
      price: 85000,
      cost: 60000,
      unit: 'Túi',
      stock: 50,
    },
    {
      name: 'Nước rửa chén Sunlight',
      sku: 'SL001',
      cat: cat.veSmh,
      price: 28000,
      cost: 18000,
      unit: 'Chai',
      stock: 60,
    },
    {
      name: 'Nước lau sàn Vim',
      sku: 'VM001',
      cat: cat.veSmh,
      price: 35000,
      cost: 24000,
      unit: 'Chai',
      stock: 40,
    },
    {
      name: 'Giấy vệ sinh Pulppy',
      sku: 'GV001',
      cat: cat.veSmh,
      price: 65000,
      cost: 45000,
      unit: 'Bịch',
      stock: 45,
    },
    {
      name: 'Kem đánh răng P/S',
      sku: 'PS001',
      cat: cat.veSmh,
      price: 22000,
      cost: 14000,
      unit: 'Tuýp',
      stock: 70,
    },
    {
      name: 'Dầu gội Clear',
      sku: 'DG001',
      cat: cat.veSmh,
      price: 75000,
      cost: 52000,
      unit: 'Chai',
      stock: 35,
    },
  ]
  for (const p of homeProducts) unitProductIds.push(await addProduct(p))

  // ── Mì & Đồ ăn nhanh (5 SP, có quy đổi ĐV) ──
  const noodleProducts = [
    {
      name: 'Mì Hảo Hảo tôm chua cay',
      sku: 'MH001',
      cat: cat.thucPham,
      price: 4000,
      cost: 2800,
      unit: 'Gói',
      stock: 300,
    },
    {
      name: 'Mì 3 Miền tôm',
      sku: 'M3001',
      cat: cat.thucPham,
      price: 3500,
      cost: 2400,
      unit: 'Gói',
      stock: 250,
    },
    {
      name: 'Phở bò Vifon',
      sku: 'PB001',
      cat: cat.thucPham,
      price: 6000,
      cost: 4000,
      unit: 'Gói',
      stock: 200,
    },
    {
      name: 'Cháo gà Cháo Lý',
      sku: 'CG001',
      cat: cat.thucPham,
      price: 8000,
      cost: 5500,
      unit: 'Gói',
      stock: 100,
    },
    {
      name: 'Dầu ăn Neptune',
      sku: 'DN001',
      cat: cat.thucPham,
      price: 45000,
      cost: 32000,
      unit: 'Chai',
      stock: 40,
    },
  ]
  for (const p of noodleProducts) unitProductIds.push(await addProduct(p))

  // ── Bánh kẹo (5 SP đơn giản) ──
  const snackProducts = [
    {
      name: 'Bánh Oreo',
      sku: 'OR001',
      cat: cat.thucPham,
      price: 18000,
      cost: 12000,
      unit: 'Gói',
      stock: 80,
    },
    {
      name: 'Bánh Chocopie',
      sku: 'CP001',
      cat: cat.thucPham,
      price: 38000,
      cost: 26000,
      unit: 'Hộp',
      stock: 50,
    },
    {
      name: 'Snack Oishi',
      sku: 'OS001',
      cat: cat.thucPham,
      price: 8000,
      cost: 5500,
      unit: 'Gói',
      stock: 120,
    },
    {
      name: 'Kẹo Alpenliebe',
      sku: 'AL001',
      cat: cat.thucPham,
      price: 35000,
      cost: 24000,
      unit: 'Gói',
      stock: 60,
    },
    {
      name: 'Bánh quy Cosy',
      sku: 'CO001',
      cat: cat.thucPham,
      price: 25000,
      cost: 17000,
      unit: 'Hộp',
      stock: 45,
    },
  ]
  for (const p of snackProducts) simpleProductIds.push(await addProduct(p))

  const allProductIds = [...simpleProductIds, ...variantProductIds, ...unitProductIds]
  const totalProducts = allProductIds.length

  // ─── 5. Product Variants ───
  console.log('🔀 Tạo biến thể sản phẩm...')
  const variantData = [
    // Coca-Cola
    {
      productId: variantProductIds[0],
      a1: 'Dung tích',
      v1: '330ml',
      price: 10000,
      sku: 'CC001-330',
    },
    {
      productId: variantProductIds[0],
      a1: 'Dung tích',
      v1: '500ml',
      price: 15000,
      sku: 'CC001-500',
    },
    // Pepsi
    {
      productId: variantProductIds[1],
      a1: 'Dung tích',
      v1: '330ml',
      price: 10000,
      sku: 'PP001-330',
    },
    {
      productId: variantProductIds[1],
      a1: 'Dung tích',
      v1: '1.5L',
      price: 22000,
      sku: 'PP001-1500',
    },
    // Sting: hai biến thể cùng thuộc tính "Vị", hộp chọn biến thể ở POS mới khớp được
    {
      productId: variantProductIds[2],
      a1: 'Vị',
      v1: 'Nguyên bản',
      price: 10000,
      sku: 'ST001-330',
    },
    { productId: variantProductIds[2], a1: 'Vị', v1: 'Dâu', price: 10000, sku: 'ST001-DAU' },
    // Aquafina
    {
      productId: variantProductIds[3],
      a1: 'Dung tích',
      v1: '500ml',
      price: 5000,
      sku: 'AQ001-500',
    },
    {
      productId: variantProductIds[3],
      a1: 'Dung tích',
      v1: '1.5L',
      price: 12000,
      sku: 'AQ001-1500',
    },
    // 7-Up
    {
      productId: variantProductIds[4],
      a1: 'Dung tích',
      v1: '330ml',
      price: 10000,
      sku: '7U001-330',
    },
    {
      productId: variantProductIds[4],
      a1: 'Dung tích',
      v1: '500ml',
      price: 15000,
      sku: '7U001-500',
    },
    // Fanta
    {
      productId: variantProductIds[5],
      a1: 'Dung tích',
      v1: '330ml',
      price: 10000,
      sku: 'FT001-330',
    },
    {
      productId: variantProductIds[5],
      a1: 'Dung tích',
      v1: '1.5L',
      price: 20000,
      sku: 'FT001-1500',
    },
    // Mirinda
    { productId: variantProductIds[6], a1: 'Vị', v1: 'Cam', price: 10000, sku: 'MR001-CAM' },
    { productId: variantProductIds[6], a1: 'Vị', v1: 'Xá xị', price: 10000, sku: 'MR001-XAX' },
    // Tiger
    {
      productId: variantProductIds[8],
      a1: 'Loại',
      v1: 'Lon 330ml',
      price: 15000,
      sku: 'BT001-LON',
    },
    {
      productId: variantProductIds[8],
      a1: 'Loại',
      v1: 'Chai 330ml',
      price: 14000,
      sku: 'BT001-CHAI',
    },
    // Heineken
    {
      productId: variantProductIds[9],
      a1: 'Loại',
      v1: 'Lon 330ml',
      price: 18000,
      sku: 'BH001-LON',
    },
    {
      productId: variantProductIds[9],
      a1: 'Loại',
      v1: 'Chai 330ml',
      price: 17000,
      sku: 'BH001-CHAI',
    },
    // 333
    {
      productId: variantProductIds[12],
      a1: 'Loại',
      v1: 'Lon 330ml',
      price: 12000,
      sku: 'B3001-LON',
    },
    {
      productId: variantProductIds[12],
      a1: 'Loại',
      v1: 'Chai 330ml',
      price: 11000,
      sku: 'B3001-CHAI',
    },
  ]

  const VARIANT_STOCK = 50
  for (const v of variantData) {
    const id = uuidv7()
    const costPrice = Math.round(v.price * 0.7)
    await db.insert(productVariants).values({
      id,
      storeId,
      productId: v.productId!,
      sku: v.sku,
      attribute1Name: v.a1,
      attribute1Value: v.v1,
      sellingPrice: v.price,
      costPrice,
      stockQuantity: VARIANT_STOCK,
      status: 'active',
    })
    stockItems.set(v.sku, {
      productId: v.productId!,
      variantId: id,
      name: productNames.get(v.productId!)!,
      variantLabel: v.v1,
      sku: v.sku,
      cost: costPrice,
      stock: VARIANT_STOCK,
    })
  }

  // Tồn cấp sản phẩm cha = tổng tồn biến thể (giống orders.service sau mỗi lần bán)
  await db.execute(sql`UPDATE products p
    SET current_stock = COALESCE(
      (SELECT SUM(v.stock_quantity) FROM product_variants v
        WHERE v.product_id = p.id AND v.deleted_at IS NULL), 0)
    WHERE p.store_id = ${storeId} AND p.has_variants`)

  // ─── 6. Product Unit Conversions ───
  console.log('📐 Tạo quy đổi đơn vị...')
  const conversions = [
    // Sữa
    { productId: unitProductIds[0], unit: 'Thùng', factor: 48, price: 320000 },
    { productId: unitProductIds[1], unit: 'Thùng', factor: 48, price: 540000 },
    { productId: unitProductIds[2], unit: 'Lốc', factor: 4, price: 18000 },
    // Gia dụng
    { productId: unitProductIds[5], unit: 'Thùng', factor: 24, price: 1900000 },
    { productId: unitProductIds[6], unit: 'Thùng', factor: 24, price: 630000 },
    { productId: unitProductIds[7], unit: 'Thùng', factor: 12, price: 390000 },
    { productId: unitProductIds[8], unit: 'Lốc', factor: 10, price: 600000 },
    // Mì
    { productId: unitProductIds[11], unit: 'Thùng', factor: 30, price: 110000 },
    { productId: unitProductIds[12], unit: 'Thùng', factor: 30, price: 95000 },
    { productId: unitProductIds[13], unit: 'Thùng', factor: 30, price: 165000 },
  ]

  for (const c of conversions) {
    await db.insert(productUnitConversions).values({
      storeId,
      productId: c.productId!,
      unit: c.unit,
      conversionFactor: c.factor,
      sellingPrice: c.price,
      sortOrder: 0,
    })
  }

  // ─── 7. Customer Groups ───
  console.log('👥 Tạo nhóm khách hàng...')
  const groupIds = { vip: uuidv7(), si: uuidv7(), le: uuidv7() }

  await db.insert(customerGroups).values([
    {
      id: groupIds.vip,
      storeId,
      name: 'Khách VIP',
      description: 'Mua trên 10 triệu',
      debtLimit: 50_000_000,
    },
    {
      id: groupIds.si,
      storeId,
      name: 'Khách sỉ',
      description: 'Đại lý mua sỉ',
      debtLimit: 100_000_000,
    },
    {
      id: groupIds.le,
      storeId,
      // POS-20: "Khách lẻ" là đơn không gắn khách hàng, nhóm mẫu đặt tên khác để khỏi lẫn
      name: 'Khách thường',
      description: 'Khách mua lẻ thường xuyên',
      debtLimit: 5_000_000,
    },
  ])

  // ─── 8. Customers ───
  console.log('🧑 Tạo khách hàng...')
  const customerData = [
    {
      name: 'Phạm Thị Dung',
      phone: '0911000001',
      group: groupIds.vip,
    },
    {
      name: 'Hoàng Văn Em',
      phone: '0911000002',
      group: groupIds.vip,
    },
    {
      name: 'Vũ Thị Phương',
      phone: '0911000003',
      group: groupIds.si,
    },
    {
      name: 'Đặng Minh Quân',
      phone: '0911000004',
      group: groupIds.si,
    },
    { name: 'Bùi Thanh Hà', phone: '0911000005', group: groupIds.le },
    { name: 'Ngô Văn Sơn', phone: '0911000006', group: groupIds.le },
    { name: 'Lý Thị Thu', phone: '0911000007', group: groupIds.le },
    { name: 'Trịnh Đức Anh', phone: '0911000008' },
    { name: 'Mai Hương Giang', phone: '0911000009' },
    { name: 'Phan Văn Khánh', phone: '0911000010' },
  ]

  for (const [index, c] of customerData.entries()) {
    await db.insert(customers).values({
      storeId,
      code: `KH${String(index + 1).padStart(6, '0')}`,
      name: c.name,
      phone: c.phone,
      groupId: (c as Record<string, unknown>).group as string | undefined,
      // TIEN-105: tổng mua, số đơn tính từ đơn bán nên luôn truy ra chứng từ
      email: `${c.phone}@test.vn`,
      address: 'TP.HCM',
    })
  }

  // ─── 9. Suppliers ───
  console.log('🏭 Tạo nhà cung cấp...')
  const supplierData = [
    { name: 'Công ty TNHH Rau Sạch Đà Lạt', phone: '02631234567', email: 'rausach@test.vn' },
    { name: 'Công ty CP Thực phẩm Vissan', phone: '02812345670', email: 'vissan@test.vn' },
    { name: 'Đại lý Nước giải khát Sài Gòn', phone: '02898765432', email: 'nuocgk@test.vn' },
    { name: 'Công ty CP Vinamilk', phone: '02839401401', email: 'vinamilk@test.vn' },
    { name: 'Nhà phân phối Omo miền Nam', phone: '02854321098', email: 'omo@test.vn' },
  ]

  const supplierIds: string[] = []
  for (const [index, s] of supplierData.entries()) {
    const id = uuidv7()
    supplierIds.push(id)
    await db.insert(suppliers).values({
      id,
      storeId,
      code: `NCC${String(index + 1).padStart(6, '0')}`,
      name: s.name,
      phone: s.phone,
      email: s.email,
      address: 'TP.HCM',
    })
  }
  await db
    .update(stores)
    .set({
      customerCodeCounter: customerData.length,
      supplierCodeCounter: supplierData.length,
    })
    .where(eq(stores.id, storeId))

  // ─── 10. Price Lists ───
  // Tạo qua đúng service của app sau khi parse bằng schema dùng chung, nên bảng giá seed
  // luôn hợp lệ (quy tắc làm tròn, đơn vị công thức) và bảng công thức có sẵn dòng giá.
  console.log('💰 Tạo bảng giá...')
  const priceListActor = { userId: ownerId, storeId, role: 'owner' as const }

  // Giá sỉ: 85% giá bán lẻ của từng mặt hàng, không dưới giá vốn. 10 mặt hàng đầu.
  const wholesaleItems = allProductIds.slice(0, 10).map((productId) => {
    const pricing = productPricing.get(productId)!
    const price = Math.round(pricing.price * 0.85)
    if (price < pricing.cost) throw new Error(`Seed: giá sỉ dưới giá vốn (${productId})`)
    return { productId, price }
  })
  // POS-08: một dòng giá theo biến thể, biến thể còn lại của cùng sản phẩm không có dòng riêng
  const heinekenChai = stockItems.get('BH001-CHAI')!
  if (14_500 < heinekenChai.cost) throw new Error('Seed: giá sỉ biến thể dưới giá vốn')
  const wholesaleVariantItems = [
    { productId: heinekenChai.productId, variantId: heinekenChai.variantId!, price: 14_500 },
  ]
  const wholesaleList = await createPriceList({
    db,
    actor: priceListActor,
    input: createPriceListSchema.parse({
      method: 'direct',
      name: 'Giá sỉ',
      description: 'Bảng giá dành cho khách sỉ, bằng 85% giá bán lẻ',
      roundingRule: 'none',
      items: [...wholesaleItems, ...wholesaleVariantItems],
    }),
  })

  // formulaValue tính theo phần vạn (500 = 5%), giống ô nhập % trên màn bảng giá
  const vipList = await createPriceList({
    db,
    actor: priceListActor,
    input: createPriceListSchema.parse({
      method: 'formula',
      // Tên bảng giá không được chứa ký tự %, mức giảm ghi ở mô tả
      name: 'Giá VIP',
      description: 'Giảm 5% so với giá sỉ, làm tròn tới trăm đồng',
      baseListId: wholesaleList.id,
      formulaType: 'percent_decrease',
      formulaValue: 500,
      roundingRule: 'nearest_hundred',
    }),
  })

  await db
    .update(customerGroups)
    .set({ defaultPriceListId: wholesaleList.id })
    .where(eq(customerGroups.id, groupIds.si))
  await db
    .update(customerGroups)
    .set({ defaultPriceListId: vipList.id })
    .where(eq(customerGroups.id, groupIds.vip))

  // ─── 11. Tồn đầu kỳ + Purchase Orders ───
  // Phiếu nhập ghi theo SKU, giá nhập bằng giá vốn nên bình quân gia quyền không đổi.
  // Tồn đầu kỳ = tồn cuối - tổng nhập, để tồn cuối (E2E đang dựa vào) giữ nguyên.
  const poData = [
    {
      code: 'PN-0001',
      suppIdx: 0,
      items: [
        { sku: 'RC001', qty: 30 },
        { sku: 'KT001', qty: 20 },
      ],
    },
    {
      code: 'PN-0002',
      suppIdx: 1,
      items: [
        { sku: 'TH001', qty: 15 },
        { sku: 'TB001', qty: 10 },
      ],
    },
    {
      code: 'PN-0003',
      suppIdx: 2,
      items: [
        { sku: 'CC001-330', qty: 30 },
        { sku: 'PP001-330', qty: 30 },
        { sku: 'ST001-330', qty: 20 },
      ],
    },
  ]

  const DAY_MS = 24 * 60 * 60 * 1000
  const openingAt = new Date(Date.now() - 2 * DAY_MS)
  const purchaseAt = new Date(Date.now() - DAY_MS)

  const purchasedQty = new Map<string, number>()
  for (const po of poData) {
    for (const item of po.items) {
      if (!stockItems.has(item.sku)) throw new Error(`Seed: phiếu nhập dùng SKU lạ ${item.sku}`)
      purchasedQty.set(item.sku, (purchasedQty.get(item.sku) ?? 0) + item.qty)
    }
  }

  console.log('📊 Ghi sổ tồn đầu kỳ...')
  // Tồn đang chạy theo SKU, dùng cho stockAfter của từng dòng sổ
  const runningStock = new Map<string, number>()
  let openingCount = 0
  for (const item of stockItems.values()) {
    const opening = item.stock - (purchasedQty.get(item.sku) ?? 0)
    if (opening < 0) throw new Error(`Seed: tổng nhập vượt tồn cuối của ${item.sku}`)
    runningStock.set(item.sku, opening)
    if (opening === 0) continue
    await db.insert(inventoryTransactions).values({
      storeId,
      productId: item.productId,
      variantId: item.variantId,
      type: 'initial_stock',
      quantity: opening,
      unitCost: item.cost,
      costAfter: item.cost,
      stockAfter: opening,
      note: 'Tồn đầu kỳ (dữ liệu mẫu)',
      referenceType: 'product',
      referenceId: item.productId,
      createdBy: ownerId,
      createdAt: openingAt,
    })
    openingCount++
  }

  console.log('📥 Tạo phiếu nhập kho...')
  let purchaseTxCount = 0
  const supplierTotals = new Map<string, { count: number; total: number }>()
  for (const po of poData) {
    const poId = uuidv7()
    const supplierId = supplierIds[po.suppIdx]!
    const lines = po.items.map((it) => {
      const item = stockItems.get(it.sku)!
      const stockAfter = runningStock.get(it.sku)! + it.qty
      runningStock.set(it.sku, stockAfter)
      return { item, qty: it.qty, lineTotal: it.qty * item.cost, stockAfter }
    })
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0)

    await db.insert(purchaseOrders).values({
      id: poId,
      storeId,
      supplierId,
      code: po.code,
      subtotal,
      totalAmount: subtotal,
      paidAmount: subtotal,
      paymentStatus: 'paid',
      purchaseDate: purchaseAt,
      createdBy: ownerId,
      createdAt: purchaseAt,
    })

    for (const l of lines) {
      await db.insert(purchaseOrderItems).values({
        purchaseOrderId: poId,
        productId: l.item.productId,
        variantId: l.item.variantId,
        productNameSnapshot: l.item.name,
        productSkuSnapshot: l.item.sku,
        variantLabelSnapshot: l.item.variantLabel,
        quantity: l.qty,
        unitPrice: l.item.cost,
        lineTotal: l.lineTotal,
        costAfter: l.item.cost,
        stockAfter: l.stockAfter,
        createdAt: purchaseAt,
      })
      await db.insert(inventoryTransactions).values({
        storeId,
        productId: l.item.productId,
        variantId: l.item.variantId,
        type: 'purchase',
        quantity: l.qty,
        unitCost: l.item.cost,
        costAfter: l.item.cost,
        stockAfter: l.stockAfter,
        note: po.code,
        referenceType: 'purchase_order',
        referenceId: poId,
        createdBy: ownerId,
        createdAt: purchaseAt,
      })
      purchaseTxCount++
    }

    const prev = supplierTotals.get(supplierId) ?? { count: 0, total: 0 }
    supplierTotals.set(supplierId, { count: prev.count + 1, total: prev.total + subtotal })
  }

  // Phiếu nhập đã trả đủ nên công nợ NCC giữ 0, chỉ cộng số lần và tổng nhập như app
  for (const [supplierId, t] of supplierTotals) {
    await db
      .update(suppliers)
      .set({ purchaseCount: t.count, totalPurchased: t.total })
      .where(eq(suppliers.id, supplierId))
  }

  // Tự kiểm: tồn cuối sau khi ghi sổ phải đúng tồn đã khai báo
  for (const item of stockItems.values()) {
    if (runningStock.get(item.sku) !== item.stock) {
      throw new Error(`Seed: sổ kho lệch tồn của ${item.sku}`)
    }
  }

  console.log('\n✅ Seed hoàn tất!')
  console.log('─────────────────────────────')
  console.log(`  Cửa hàng:     1`)
  console.log(`  Nhân viên:    3 (owner/manager/staff)`)
  console.log(`  Danh mục:     10 (4 cha + 6 con)`)
  console.log(`  Sản phẩm:     ${totalProducts}`)
  console.log(`  Biến thể:     ${variantData.length}`)
  console.log(`  Quy đổi ĐV:  ${conversions.length}`)
  console.log(`  Nhóm KH:     3`)
  console.log(`  Khách hàng:   10`)
  console.log(`  NCC:          5`)
  console.log(
    `  Bảng giá:     2 (Giá sỉ ${wholesaleItems.length} mặt hàng, ${wholesaleVariantItems.length} dòng biến thể + VIP công thức)`,
  )
  console.log(`  Phiếu nhập:   3`)
  console.log(
    `  Giao dịch kho: ${openingCount + purchaseTxCount} (${openingCount} tồn đầu kỳ + ${purchaseTxCount} nhập)`,
  )
  console.log('─────────────────────────────')
  console.log(`\n🔑 Tài khoản đăng nhập:`)
  console.log(`  Owner:   0901000001 / matkhau123 (PIN: 111111)`)
  console.log(`  Manager: 0901000002 / matkhau123 (PIN: 222222)`)
  console.log(`  Staff:   0901000003 / matkhau123 (PIN: 333333)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL required')
  const client = postgres(databaseUrl)
  const db = drizzle(client, { schema, casing: 'snake_case' })

  seed(db)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Seed thất bại:', err)
      process.exit(1)
    })
}
