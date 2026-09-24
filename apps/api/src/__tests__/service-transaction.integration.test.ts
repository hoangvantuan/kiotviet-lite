import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  auditLogs,
  brands,
  categories,
  createProductSchema,
  customers,
  inventoryTransactions,
  products,
  suppliers,
} from '@kiotviet-lite/shared'

import { createBrand, updateBrand } from '../services/brands.service.js'
import { createCategory, updateCategory } from '../services/categories.service.js'
import { createCustomer, updateCustomer } from '../services/customers.service.js'
import { createProduct, updateProduct } from '../services/products.service.js'
import type { ServiceTransaction } from '../services/service-transaction.js'
import { createSupplier, updateSupplier } from '../services/suppliers.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

async function writeAll(env: TestEnv, transaction: ServiceTransaction) {
  const { db, owner } = env
  const actor = { userId: owner.id, storeId: owner.storeId, role: owner.role }
  const meta = { userAgent: 'bulk-import-test' }
  const category = await createCategory({
    db,
    transaction,
    actor,
    input: { name: 'Ống nhựa' },
    meta,
  })
  const brand = await createBrand({ db, transaction, actor, input: { name: 'Bình Minh' }, meta })
  const product = await createProduct({
    db,
    transaction,
    actor,
    input: createProductSchema.parse({
      name: 'Ống nhựa 21',
      sku: 'ONG-21',
      categoryId: category.id,
      brandId: brand.id,
      sellingPrice: 20000,
      trackInventory: true,
    }),
    meta,
  })
  const customer = await createCustomer({
    db,
    transaction,
    actor,
    input: { name: 'Khách lẻ', code: 'KH-01' },
    meta,
  })
  const supplier = await createSupplier({
    db,
    transaction,
    actor,
    input: { name: 'Nhà cung cấp A', code: 'NCC-01' },
    meta,
  })
  await updateCategory({
    db,
    transaction,
    actor,
    targetId: category.id,
    input: { name: 'Ống nhựa PVC' },
    meta,
  })
  await updateBrand({
    db,
    transaction,
    actor,
    targetId: brand.id,
    input: { name: 'Bình Minh mới' },
    meta,
  })
  await updateProduct({
    db,
    transaction,
    actor,
    productId: product.id,
    input: { sellingPrice: 24000 },
    meta,
  })
  await updateCustomer({
    db,
    transaction,
    actor,
    targetId: customer.id,
    input: { name: 'Khách mua sỉ' },
    meta,
  })
  await updateSupplier({
    db,
    transaction,
    actor,
    targetId: supplier.id,
    input: { name: 'Nhà cung cấp B' },
    meta,
  })
  return { actor, category, brand, product, customer, supplier }
}

const domainTables = {
  categories,
  brands,
  products,
  customers,
  suppliers,
  auditLogs,
  inventoryTransactions,
}

async function tableCounts(db: TestEnv['db']) {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(domainTables).map(async ([name, table]) => [
        name,
        (await db.select().from(table)).length,
      ]),
    ),
  )
}

describe('transaction-scoped domain service writes', () => {
  let env: TestEnv
  beforeEach(async () => {
    env = await createTestEnv()
  })
  afterEach(async () => {
    await env.close()
  })

  it('rolls back creations, updates and audit together after a later validation failure', async () => {
    await expect(
      env.db.transaction(async (tx) => {
        const transaction = tx as unknown as ServiceTransaction
        const { actor } = await writeAll(env, transaction)
        await createProduct({
          db: env.db,
          transaction,
          actor,
          input: createProductSchema.parse({ name: 'Trùng mã', sku: 'ong-21', sellingPrice: 1 }),
        })
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { field: 'sku' } })

    expect(await tableCounts(env.db)).toEqual({
      categories: 0,
      brands: 0,
      products: 0,
      customers: 0,
      suppliers: 0,
      auditLogs: 0,
      inventoryTransactions: 0,
    })
  })

  it('commits existing validations and audit while leaving inventory ledger unchanged', async () => {
    await env.db.transaction(async (tx) => {
      await writeAll(env, tx as unknown as ServiceTransaction)
    })

    const [product] = await env.db.select().from(products)
    const [customer] = await env.db.select().from(customers)
    const [supplier] = await env.db.select().from(suppliers)
    const [category] = await env.db.select().from(categories)
    const [brand] = await env.db.select().from(brands)
    expect(category?.name).toBe('Ống nhựa PVC')
    expect(brand?.name).toBe('Bình Minh mới')
    expect(product).toMatchObject({
      sku: 'ONG-21',
      sellingPrice: 24000,
      currentStock: 0,
      categoryId: category?.id,
      brandId: brand?.id,
    })
    expect(customer).toMatchObject({ code: 'KH-01', name: 'Khách mua sỉ' })
    expect(supplier).toMatchObject({ code: 'NCC-01', name: 'Nhà cung cấp B' })
    const audit = await env.db.select().from(auditLogs)
    expect(audit.map(({ action }) => action).sort()).toEqual(
      [
        'category.created',
        'brand.created',
        'category.updated',
        'brand.updated',
        'product.created',
        'customer.created',
        'supplier.created',
        'product.updated',
        'customer.updated',
        'supplier.updated',
      ].sort(),
    )
    expect(
      audit.every(({ actorId, storeId }) => actorId === env.owner.id && storeId === env.storeId),
    ).toBe(true)
    expect(await env.db.select().from(inventoryTransactions)).toEqual([])
  })

  it('rolls back a failed nested service savepoint without aborting the caller transaction', async () => {
    const actor = { userId: env.owner.id, storeId: env.storeId, role: env.owner.role }
    await env.db.transaction(async (tx) => {
      const transaction = tx as unknown as ServiceTransaction
      await expect(
        createProduct({
          db: env.db,
          transaction,
          actor,
          input: createProductSchema.parse({
            name: 'Invalid conversion',
            sku: 'FAIL-01',
            sellingPrice: 100,
            unitConversions: [{ unit: 'Cái', conversionFactor: 2, sellingPrice: 200 }],
          }),
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
      await createProduct({
        db: env.db,
        transaction,
        actor,
        input: createProductSchema.parse({
          name: 'Valid product',
          sku: 'OK-01',
          sellingPrice: 100,
        }),
      })
    })
    expect((await env.db.select().from(products)).map(({ sku }) => sku)).toEqual(['OK-01'])
    expect((await env.db.select().from(auditLogs)).map(({ action }) => action)).toEqual([
      'product.created',
    ])
    expect(await env.db.select().from(inventoryTransactions)).toEqual([])
  })
})
