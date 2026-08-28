import re
import sys

with open('apps/api/src/services/orders.service.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add import for resolveProductPrice
if 'resolveProductPrice' not in content:
    content = content.replace(
        "import { verifyPin } from './pin.service.js'",
        "import { verifyPin } from './pin.service.js'\nimport { resolveProductPrice } from './pricing.service.js'"
    )

# 2. Add validation for priceOverridePin
pin_check_code = """
  // SF-1: Khi debtLimitOverridden=true, verify PIN server-side trước khi vào transaction.
  // Zod refine đã đảm bảo có debtLimitOverridePin khi debtLimitOverridden=true.
  if (input.debtLimitOverridden && input.debtLimitOverridePin) {
    await verifyPin({
      db,
      userId: actor.userId,
      storeId: actor.storeId,
      pin: input.debtLimitOverridePin,
      meta,
    })
  }

  // T10: Xác minh mã PIN sửa giá (priceOverridePin) nếu có
  const hasPriceOverride = input.items.some((i) => i.priceOverride)
  let verifiedPriceOverridePin = false
  if (hasPriceOverride) {
    if (input.priceOverridePin) {
      await verifyPin({
        db,
        userId: actor.userId,
        storeId: actor.storeId,
        pin: input.priceOverridePin,
        meta,
      })
      verifiedPriceOverridePin = true
    } else if (source === 'pos') {
      throw new ApiError('VALIDATION_ERROR', 'Sửa giá yêu cầu mã PIN')
    }
  }
"""
content = re.sub(r"(\s*// SF-1: Khi debtLimitOverridden=true.*?)(\s*const debtAmount = input\.debtAmount \?\? 0)", r"\1\n  // T10: Xác minh mã PIN sửa giá (priceOverridePin) nếu có\n  const hasPriceOverride = input.items.some((i) => i.priceOverride)\n  let verifiedPriceOverridePin = false\n  if (hasPriceOverride) {\n    if (input.priceOverridePin) {\n      await verifyPin({\n        db,\n        userId: actor.userId,\n        storeId: actor.storeId,\n        pin: input.priceOverridePin,\n        meta,\n      })\n      verifiedPriceOverridePin = true\n    } else if (source === 'pos') {\n      throw new ApiError('VALIDATION_ERROR', 'Sửa giá yêu cầu mã PIN')\n    }\n  }\n\2", content, flags=re.DOTALL)


# 3. Add variables for loop
loop_init = """
      // Process items: insert order_items + deduct stock
      const processedItems: OrderDetailItem[] = []
      let isPriceMismatchAdjusted = false
      let adjustedSubtotal = 0
"""
content = content.replace("      const processedItems: OrderDetailItem[] = []", loop_init)

# 4. Modify M16 block
m16_old = """        let effectiveUnitPrice = item.unitPrice
        let effectiveLineTotal = item.lineTotal

        // M16: Đơn vị quy đổi có giá 0 dẫn tới bán 0đ: BE tự tính lại giá thay vì tin client
        if (conv && !item.priceOverride) {
          const basePrice = variant ? Number(variant.sellingPrice) : Number(product.sellingPrice)
          const expectedConvPrice = calculateUnitConversionPrice({
            basePrice,
            conversionFactor: conv.conversionFactor,
            customSellingPrice: conv.sellingPrice,
          })
          if (effectiveUnitPrice <= 0 && expectedConvPrice > 0) {
            effectiveUnitPrice = expectedConvPrice
            const lineRes = calculateLineTotal({
              unitPrice: effectiveUnitPrice,
              quantity: item.quantity,
              discountType: item.discountType,
              discountValue: item.discountValue,
            })
            effectiveLineTotal = lineRes.lineTotal
          }
        }"""

m16_new = """        // T10: Máy chủ đối chiếu đơn giá với giá tự tính
        const resolvedPrice = await resolveProductPrice({
          db: txDb,
          storeId: actor.storeId,
          customerId: input.customerId ?? null,
          productId: item.productId,
          variantId: item.variantId ?? null,
          unitConversionId: item.unitConversionId ?? null,
          quantity: item.quantity,
        })

        if (item.priceOverride) {
          if (verifiedPriceOverridePin) {
            item.priceOverridePinUsed = true
          } else if (source === 'offline_sync') {
            item.priceOverride = false
            item.priceOverridePinUsed = false
          }
        } else {
          item.priceOverridePinUsed = false
        }

        let effectiveUnitPrice = item.unitPrice
        let effectiveLineTotal = item.lineTotal

        if (!item.priceOverride) {
          const expectedSysPrice = resolvedPrice.price
          if (effectiveUnitPrice !== expectedSysPrice) {
            if (source === 'pos') {
              throw new ApiError(
                'VALIDATION_ERROR',
                'Đơn giá không khớp giá hệ thống, vui lòng tải lại giỏ hàng',
                {
                  productId: item.productId,
                  clientPrice: item.unitPrice,
                  serverPrice: expectedSysPrice,
                }
              )
            } else {
              effectiveUnitPrice = expectedSysPrice
              const lineRes = calculateLineTotal({
                unitPrice: effectiveUnitPrice,
                quantity: item.quantity,
                discountType: item.discountType,
                discountValue: item.discountValue,
              })
              effectiveLineTotal = lineRes.lineTotal
              isPriceMismatchAdjusted = true
            }
          }
        }
        
        adjustedSubtotal += effectiveLineTotal"""
content = content.replace(m16_old, m16_new)

# 5. Insert price mismatch update block after items loop
end_loop_str = """      let oldDebt: number | null = null"""

end_loop_new = """      if (isPriceMismatchAdjusted) {
        const newTotal = Math.max(0, adjustedSubtotal - input.discountAmount)
        
        let newChange = 0
        if (input.paymentMethod === 'cash' && input.cashAmount != null) {
          newChange = input.cashAmount - newTotal
        } else if (input.paymentMethod === 'combined') {
          const cashPart = input.cashAmount ?? 0
          const transferPart = input.transferAmount ?? 0
          newChange = cashPart + transferPart - newTotal
        } else if (input.paymentMethod === 'debt' && input.cashAmount != null) {
          newChange = input.cashAmount - (newTotal - debtAmount)
        }
        newChange = Math.max(0, newChange)
        
        await tx
          .update(orders)
          .set({
            subtotal: adjustedSubtotal,
            total: newTotal,
            change: newChange
          })
          .where(eq(orders.id, createdId))
          
        await logAction({
          db: txDb,
          storeId: actor.storeId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'order.price_mismatch_adjusted',
          targetType: 'order',
          targetId: createdId,
          changes: {
            orderId: createdId,
            orderNumber,
            oldSubtotal: input.subtotal,
            newSubtotal: adjustedSubtotal,
            oldTotal: input.total,
            newTotal,
          },
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        })
        
        emitEvent(db, {
          storeId: actor.storeId,
          type: 'order.price_mismatch_adjusted',
          severity: 'warn',
          title: `Đơn ngoại tuyến điều chỉnh giá: ${orderNumber}`,
          body: `Đơn ${orderNumber} có sai lệch giá so với hệ thống. Tự động điều chỉnh tổng đơn từ ${formatVnd(input.total)} thành ${formatVnd(newTotal)}.`,
          context: {
            orderId: createdId,
            orderNumber,
            oldTotal: input.total,
            newTotal,
          },
        })
        
        input.subtotal = adjustedSubtotal
        input.total = newTotal
        change = newChange
      }

      let oldDebt: number | null = null"""

content = content.replace(end_loop_str, end_loop_new)

with open('apps/api/src/services/orders.service.ts', 'w', encoding='utf-8') as f:
    f.write(content)

