/**
 * Tính lại giá vốn đã bị thổi do chiết khấu phiếu nhập cũ chưa trừ vào giá vốn (KHO-04).
 *
 * Mặc định chỉ in báo cáo chênh lệch, không ghi gì (chạy thử).
 *   pnpm --filter @kiotviet-lite/api cost:recalc
 *   pnpm --filter @kiotviet-lite/api cost:recalc -- --store <storeId>
 *   pnpm --filter @kiotviet-lite/api cost:recalc -- --json
 * Áp dụng (sao lưu DB trước):
 *   --apply                  ghi giá vốn đã tính lại cho sản phẩm "Sửa được" (không biến thể)
 *   --apply-variant-parent   ghi đồng bộ tồn và giá vốn tóm tắt của sản phẩm cha "Có biến thể" theo
 *                            giá vốn biến thể hiện tại. Giá vốn biến thể cũ nhập tay có thể sai, chỉ
 *                            dùng sau khi đã kiểm tay từng biến thể.
 * Audit `inventory.cost_recalculated` ghi dưới tài khoản chủ cửa hàng, tác nhân "script cost:recalc".
 * Script không sửa giá vốn đã chụp trên dòng đơn bán cũ (order_items), nên lợi nhuận các đơn đã bán
 * trước đó giữ nguyên.
 */
import { closeDbPool, db } from '../db/index.js'
import {
  recalcInflatedPurchaseCosts,
  type RecalcRow,
} from '../services/purchase-cost-recalc.service.js'
import { parseRecalcArgs } from './recalc-purchase-cost.args.js'

const STATUS_LABEL: Record<RecalcRow['status'], string> = {
  fixable: 'Sửa được',
  manual_review: 'Xem tay',
  variant_parent: 'Có biến thể',
}

function vnd(n: number | null): string {
  return n === null ? '-' : n.toLocaleString('vi-VN')
}

async function main() {
  const { apply, applyVariantParent, json, storeId } = parseRecalcArgs(process.argv.slice(2))
  const result = await recalcInflatedPurchaseCosts({ db, storeId, apply, applyVariantParent })

  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (apply) console.log('ÁP DỤNG: ghi lại giá vốn các dòng "Sửa được"')
  if (applyVariantParent) {
    console.log('ÁP DỤNG: đồng bộ tồn và giá vốn cha các dòng "Có biến thể" theo biến thể')
  }
  if (!apply && !applyVariantParent) {
    console.log(
      'CHẠY THỬ: chỉ báo cáo, không ghi gì. --apply ghi dòng "Sửa được", --apply-variant-parent ghi dòng "Có biến thể".',
    )
  }
  console.log('Script không sửa giá vốn đã chụp trên đơn bán cũ.')
  if (result.rows.length === 0) {
    console.log('Không có phiếu nhập cũ nào làm sai giá vốn.')
    return
  }
  console.table(
    result.rows.map((r) => ({
      'Mã hàng': r.sku,
      'Trạng thái': STATUS_LABEL[r.status],
      'Tồn kho': r.currentStock,
      'Giá vốn hiện tại': vnd(r.currentCost),
      'Giá vốn đúng': vnd(r.correctedCost),
      'Lệch/đơn vị': vnd(r.diffPerUnit),
      'Giá trị tồn thổi': vnd(r.inflatedValue),
      'Chiết khấu bị bỏ': vnd(r.discountMissed),
      'Phiếu nhập': r.affectedPurchaseOrders.join(', '),
      'Đã ghi': r.applied ? 'có' : '',
    })),
  )
  for (const r of result.rows.filter((x) => x.reason)) {
    console.log(`- ${r.sku}: ${r.reason}`)
  }
  const fixable = result.rows.filter((r) => r.status === 'fixable')
  const totalInflated = fixable.reduce((s, r) => s + (r.inflatedValue ?? 0), 0)
  console.log(
    `Tổng: ${result.rows.length} sản phẩm, ${fixable.length} sửa được, giá trị tồn thổi ${vnd(totalInflated)} đ.`,
  )
}

main()
  .catch((err: unknown) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => closeDbPool())
