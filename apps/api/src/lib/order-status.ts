/**
 * Nguồn chân lý duy nhất cho các trạng thái đơn hàng tính doanh thu.
 *
 * H5: Đơn `partial_return` biến mất khỏi báo cáo vì 16+ chỗ lọc cứng
 * `status = 'completed'`. File này cung cấp hằng số và helper Drizzle
 * dùng chung để thay thế toàn bộ filter rải rác.
 *
 * Đơn `partial_return` vẫn tính doanh thu (trừ phần đã hoàn).
 * Đơn `full_return` KHÔNG tính doanh thu (đã hoàn toàn bộ).
 * Đơn `cancelled` KHÔNG tính doanh thu.
 */
import { inArray, type SQL, sql } from 'drizzle-orm'

import { orderItems, orderReturnItems, orderReturns, orders } from '@kiotviet-lite/shared'

/**
 * Các trạng thái đơn hàng được tính vào doanh thu/lợi nhuận/dashboard.
 * - `completed`: đơn hoàn thành bình thường
 * - `partial_return`: đơn đã trả một phần hàng (vẫn còn doanh thu)
 */
export const REVENUE_ORDER_STATUSES = ['completed', 'partial_return'] as const

/**
 * Điều kiện Drizzle lọc đơn hàng tính doanh thu.
 * Dùng thay cho `eq(orders.status, 'completed')` ở tất cả báo cáo.
 */
export function revenueStatusFilter(): SQL {
  return inArray(orders.status, [...REVENUE_ORDER_STATUSES])
}

/**
 * Subquery tính tổng tiền hoàn trả cho đơn hàng hiện tại (${orders.id}).
 */
export function orderRefundSubquery(): SQL<number> {
  return sql<number>`coalesce((
    SELECT sum(${orderReturns.totalAmount})
    FROM ${orderReturns}
    WHERE ${orderReturns.orderId} = ${orders.id}
  ), 0)`
}

/**
 * Biểu thức SQL tính doanh thu ròng của đơn hàng: orders.total - tổng hoàn trả.
 */
export function orderNetRevenueExpr(): SQL<number> {
  return sql<number>`(${orders.total} - ${orderRefundSubquery()})`
}

/**
 * Biểu thức SQL tính số lượng thực bán của một dòng hàng (order_item):
 * orderItems.quantity - tổng số lượng đã trả lại của dòng đó.
 */
export function orderItemNetQuantityExpr(): SQL<number> {
  return sql<number>`(${orderItems.quantity} - coalesce((
    SELECT sum(${orderReturnItems.quantity})
    FROM ${orderReturnItems}
    WHERE ${orderReturnItems.orderItemId} = ${orderItems.id}
  ), 0))`
}

/**
 * Biểu thức SQL tính doanh thu ròng của một dòng hàng (order_item):
 * orderItems.lineTotal - tổng giá trị đã hoàn lại của dòng đó.
 */
export function orderItemNetRevenueExpr(): SQL<number> {
  return sql<number>`(${orderItems.lineTotal} - coalesce((
    SELECT sum(${orderReturnItems.lineTotal})
    FROM ${orderReturnItems}
    WHERE ${orderReturnItems.orderItemId} = ${orderItems.id}
  ), 0))`
}
