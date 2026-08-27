import { Hono } from 'hono'

import {
  dashboardQuerySchema,
  dashboardResponseSchema,
  debtAgingQuerySchema,
  debtSummaryQuerySchema,
  exportFormatSchema,
  inventoryReportQuerySchema,
  pricingReportQuerySchema,
  profitReportQuerySchema,
  revenueReportQuerySchema,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requirePermission } from '../middleware/rbac.middleware.js'
import {
  getDashboardMetrics,
  getLowStockAlerts,
  getOverdueDebts,
  getRevenueChart,
  getTopProducts,
} from '../services/dashboard.service.js'
import { buildCsv, buildXlsx } from '../services/export.service.js'
import {
  getInventoryCurrent,
  getInventoryReorder,
  getInventorySlow,
} from '../services/inventory-report.service.js'
import {
  getPriceComparison,
  getPriceHistory,
  getPriceOverrides,
} from '../services/pricing-report.service.js'
import { getProfitReport } from '../services/profit-report.service.js'
import {
  buildAgingCsv,
  buildSummaryCsv,
  getDebtAgingReport,
  getDebtSummaryReport,
} from '../services/reports.service.js'
import {
  getRevenueByCustomer,
  getRevenueByEmployee,
  getRevenueByProduct,
  getRevenueByTime,
} from '../services/revenue-report.service.js'

export function createReportsRoutes({ db }: { db: Db }) {
  const app = new Hono()

  app.use('*', requireAuth, requirePermission('reports.view'))

  app.get('/dashboard', async (c) => {
    const auth = c.get('auth')
    const raw = { period: c.req.query('period') }
    const query = dashboardQuerySchema.parse({
      period: raw.period || undefined,
    })
    const [metrics, revenueChart, topProducts, lowStockAlerts, overdueDebts] = await Promise.all([
      getDashboardMetrics(db, auth.storeId, query.period),
      getRevenueChart(db, auth.storeId),
      getTopProducts(db, auth.storeId, query.period),
      getLowStockAlerts(db, auth.storeId),
      getOverdueDebts(db, auth.storeId),
    ])
    const data = {
      metrics,
      revenueChart,
      topProducts,
      lowStockAlerts,
      overdueDebts,
    }
    dashboardResponseSchema.parse(data)
    return c.json({ data })
  })

  app.get('/debt-aging', async (c) => {
    const auth = c.get('auth')
    const raw = { from: c.req.query('from'), to: c.req.query('to') }
    const query = debtAgingQuerySchema.parse({
      from: raw.from || undefined,
      to: raw.to || undefined,
    })
    const data = await getDebtAgingReport({ db, storeId: auth.storeId, query })
    return c.json({ data })
  })

  app.get('/debt-aging/csv', async (c) => {
    const auth = c.get('auth')
    const raw = { from: c.req.query('from'), to: c.req.query('to') }
    const query = debtAgingQuerySchema.parse({
      from: raw.from || undefined,
      to: raw.to || undefined,
    })
    const report = await getDebtAgingReport({ db, storeId: auth.storeId, query })
    const csv = buildAgingCsv(report)
    const today = new Date().toISOString().slice(0, 10)
    c.header('Content-Type', 'text/csv; charset=utf-8')
    c.header('Content-Disposition', `attachment; filename="bao-cao-tuoi-no-${today}.csv"`)
    return c.body(csv)
  })

  app.get('/debt-summary', async (c) => {
    const auth = c.get('auth')
    const raw = { from: c.req.query('from'), to: c.req.query('to') }
    const query = debtSummaryQuerySchema.parse({
      from: raw.from || undefined,
      to: raw.to || undefined,
    })
    const data = await getDebtSummaryReport({ db, storeId: auth.storeId, query })
    return c.json({ data })
  })

  app.get('/debt-summary/csv', async (c) => {
    const auth = c.get('auth')
    const raw = { from: c.req.query('from'), to: c.req.query('to') }
    const query = debtSummaryQuerySchema.parse({
      from: raw.from || undefined,
      to: raw.to || undefined,
    })
    const report = await getDebtSummaryReport({ db, storeId: auth.storeId, query })
    const csv = buildSummaryCsv(report)
    const today = new Date().toISOString().slice(0, 10)
    c.header('Content-Type', 'text/csv; charset=utf-8')
    c.header('Content-Disposition', `attachment; filename="bao-cao-tong-hop-cong-no-${today}.csv"`)
    return c.body(csv)
  })

  // Revenue report
  app.get('/revenue', async (c) => {
    const auth = c.get('auth')
    const query = revenueReportQuerySchema.parse({
      tab: c.req.query('tab') || undefined,
      from: c.req.query('from') || undefined,
      to: c.req.query('to') || undefined,
      groupBy: c.req.query('groupBy') || undefined,
    })
    let data
    switch (query.tab) {
      case 'time':
        data = await getRevenueByTime(db, auth.storeId, query.from, query.to, query.groupBy)
        break
      case 'product':
        data = await getRevenueByProduct(db, auth.storeId, query.from, query.to)
        break
      case 'customer':
        data = await getRevenueByCustomer(db, auth.storeId, query.from, query.to)
        break
      case 'employee':
        data = await getRevenueByEmployee(db, auth.storeId, query.from, query.to)
        break
    }
    return c.json({ data })
  })

  // Revenue export
  app.get('/revenue/export', async (c) => {
    const auth = c.get('auth')
    const query = revenueReportQuerySchema.parse({
      tab: c.req.query('tab') || undefined,
      from: c.req.query('from') || undefined,
      to: c.req.query('to') || undefined,
      groupBy: c.req.query('groupBy') || undefined,
    })
    const format = exportFormatSchema.parse(c.req.query('format'))
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')

    let headers: string[]
    let rows: (string | number | null)[][]

    switch (query.tab) {
      case 'time': {
        const data = await getRevenueByTime(db, auth.storeId, query.from, query.to, query.groupBy)
        headers = ['Ngày', 'Số đơn', 'Doanh thu']
        rows = data.rows.map((r) => [r.date, r.orderCount, r.revenue])
        break
      }
      case 'product': {
        const data = await getRevenueByProduct(db, auth.storeId, query.from, query.to)
        headers = ['Sản phẩm', 'SKU', 'Số lượng', 'Doanh thu', '% Tổng']
        rows = data.rows.map((r) => [r.productName, r.sku, r.quantity, r.revenue, r.percentage])
        break
      }
      case 'customer': {
        const data = await getRevenueByCustomer(db, auth.storeId, query.from, query.to)
        headers = ['Khách hàng', 'SĐT', 'Số đơn', 'Doanh thu', 'Nợ hiện tại']
        rows = data.rows.map((r) => [
          r.customerName,
          r.phone,
          r.orderCount,
          r.revenue,
          r.currentDebt,
        ])
        break
      }
      case 'employee': {
        const data = await getRevenueByEmployee(db, auth.storeId, query.from, query.to)
        headers = ['Nhân viên', 'Số đơn', 'Doanh thu', '% Tổng']
        rows = data.rows.map((r) => [r.userName, r.orderCount, r.revenue, r.percentage])
        break
      }
    }

    const filename = `doanh-thu_${query.tab}_${today}`
    if (format === 'csv') {
      c.header('Content-Type', 'text/csv; charset=utf-8')
      c.header('Content-Disposition', `attachment; filename="${filename}.csv"`)
      return c.body(buildCsv(headers!, rows!))
    }
    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    c.header('Content-Disposition', `attachment; filename="${filename}.xlsx"`)
    return c.body(buildXlsx('Doanh thu', headers!, rows!))
  })

  // Profit report
  app.get('/profit', async (c) => {
    const auth = c.get('auth')
    const query = profitReportQuerySchema.parse({
      from: c.req.query('from') || undefined,
      to: c.req.query('to') || undefined,
    })
    const data = await getProfitReport(db, auth.storeId, query.from, query.to)
    return c.json({ data })
  })

  // Profit export
  app.get('/profit/export', async (c) => {
    const auth = c.get('auth')
    const query = profitReportQuerySchema.parse({
      from: c.req.query('from') || undefined,
      to: c.req.query('to') || undefined,
    })
    const format = exportFormatSchema.parse(c.req.query('format'))
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const data = await getProfitReport(db, auth.storeId, query.from, query.to)

    const headers = ['Sản phẩm', 'SKU', 'Số lượng', 'Doanh thu', 'Giá vốn', 'Lợi nhuận', 'Margin %']
    const rows = data.rows.map((r) => [
      r.productName,
      r.sku,
      r.quantity,
      r.revenue,
      r.cogs,
      r.profit,
      r.marginPercent,
    ])

    const filename = `loi-nhuan_${today}`
    if (format === 'csv') {
      c.header('Content-Type', 'text/csv; charset=utf-8')
      c.header('Content-Disposition', `attachment; filename="${filename}.csv"`)
      return c.body(buildCsv(headers, rows))
    }
    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    c.header('Content-Disposition', `attachment; filename="${filename}.xlsx"`)
    return c.body(buildXlsx('Lợi nhuận', headers, rows))
  })

  // Inventory report
  app.get('/inventory', async (c) => {
    const auth = c.get('auth')
    const query = inventoryReportQuerySchema.parse({
      tab: c.req.query('tab') || undefined,
      page: c.req.query('page') || undefined,
      pageSize: c.req.query('pageSize') || undefined,
    })
    let data
    switch (query.tab) {
      case 'current':
        data = await getInventoryCurrent(db, auth.storeId, query.page, query.pageSize)
        break
      case 'reorder':
        data = await getInventoryReorder(db, auth.storeId, query.page, query.pageSize)
        break
      case 'slow':
        data = await getInventorySlow(db, auth.storeId, query.page, query.pageSize)
        break
    }
    return c.json({ data })
  })

  // Inventory export
  app.get('/inventory/export', async (c) => {
    const auth = c.get('auth')
    const query = inventoryReportQuerySchema.parse({
      tab: c.req.query('tab') || undefined,
    })
    const format = exportFormatSchema.parse(c.req.query('format'))
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')

    let headers: string[]
    let rows: (string | number | null)[][]

    switch (query.tab) {
      case 'current': {
        const data = await getInventoryCurrent(db, auth.storeId)
        headers = ['Sản phẩm', 'SKU', 'Tồn kho', 'Giá vốn', 'Giá trị tồn']
        rows = data.rows.map((r) => [
          r.productName,
          r.sku,
          r.currentStock,
          r.costPrice,
          r.stockValue,
        ])
        break
      }
      case 'reorder': {
        const data = await getInventoryReorder(db, auth.storeId)
        headers = ['Sản phẩm', 'SKU', 'Tồn hiện tại', 'Định mức tối thiểu', 'Cần nhập']
        rows = data.rows.map((r) => [
          r.productName,
          r.sku,
          r.currentStock,
          r.minStock,
          r.reorderQuantity,
        ])
        break
      }
      case 'slow': {
        const data = await getInventorySlow(db, auth.storeId)
        headers = ['Sản phẩm', 'SKU', 'Tồn kho', 'Ngày bán cuối', 'Số ngày']
        rows = data.rows.map((r) => [
          r.productName,
          r.sku,
          r.currentStock,
          r.lastSoldDate,
          r.daysSinceLastSold,
        ])
        break
      }
    }

    const filename = `ton-kho_${query.tab}_${today}`
    if (format === 'csv') {
      c.header('Content-Type', 'text/csv; charset=utf-8')
      c.header('Content-Disposition', `attachment; filename="${filename}.csv"`)
      return c.body(buildCsv(headers!, rows!))
    }
    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    c.header('Content-Disposition', `attachment; filename="${filename}.xlsx"`)
    return c.body(buildXlsx('Tồn kho', headers!, rows!))
  })

  // Pricing report
  app.get('/pricing', async (c) => {
    const auth = c.get('auth')
    const query = pricingReportQuerySchema.parse({
      tab: c.req.query('tab') || undefined,
      from: c.req.query('from') || undefined,
      to: c.req.query('to') || undefined,
      productId: c.req.query('productId') || undefined,
    })
    let data
    switch (query.tab) {
      case 'overrides':
        data = await getPriceOverrides(db, auth.storeId, query.from, query.to)
        break
      case 'comparison':
        data = await getPriceComparison(db, auth.storeId)
        break
      case 'history':
        data = await getPriceHistory(db, auth.storeId, query.from, query.to, query.productId)
        break
    }
    return c.json({ data })
  })

  // Pricing export
  app.get('/pricing/export', async (c) => {
    const auth = c.get('auth')
    const query = pricingReportQuerySchema.parse({
      tab: c.req.query('tab') || undefined,
      from: c.req.query('from') || undefined,
      to: c.req.query('to') || undefined,
      productId: c.req.query('productId') || undefined,
    })
    const format = exportFormatSchema.parse(c.req.query('format'))
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')

    let headers: string[]
    let rows: (string | number | null)[][]

    switch (query.tab) {
      case 'overrides': {
        const data = await getPriceOverrides(db, auth.storeId, query.from, query.to)
        headers = [
          'Mã đơn',
          'Ngày',
          'Sản phẩm',
          'Giá gốc',
          'Giá sửa',
          'Chênh lệch',
          'Nhân viên',
          'Lý do',
        ]
        rows = data.rows.map((r) => [
          r.orderNumber,
          r.orderDate.slice(0, 10),
          r.productName,
          r.originalPrice,
          r.overridePrice,
          r.difference,
          r.userName,
          r.reason,
        ])
        break
      }
      case 'comparison': {
        const data = await getPriceComparison(db, auth.storeId)
        headers = ['Sản phẩm', 'SKU', 'Giá vốn', ...data.priceLists]
        rows = data.rows.map((r) => [r.productName, r.sku, r.costPrice, ...r.prices.map((p) => p)])
        break
      }
      case 'history': {
        const data = await getPriceHistory(db, auth.storeId, query.from, query.to, query.productId)
        headers = ['Sản phẩm', 'Ngày nhập', 'Nhà cung cấp', 'Giá nhập', 'Giá vốn sau']
        rows = data.rows.map((r) => [
          r.productName,
          r.purchaseDate,
          r.supplierName,
          r.unitPrice,
          r.costAfter,
        ])
        break
      }
    }

    const filename = `gia_${query.tab}_${today}`
    if (format === 'csv') {
      c.header('Content-Type', 'text/csv; charset=utf-8')
      c.header('Content-Disposition', `attachment; filename="${filename}.csv"`)
      return c.body(buildCsv(headers!, rows!))
    }
    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    c.header('Content-Disposition', `attachment; filename="${filename}.xlsx"`)
    return c.body(buildXlsx('Giá', headers!, rows!))
  })

  return app
}
