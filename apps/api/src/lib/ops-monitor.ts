import {
  createOpsAlerter,
  opsAlertConfigFromEnv,
  type OpsAlerter,
} from '@kiotviet-lite/notifications'
import type { MiddlewareHandler } from 'hono'

import type { Db } from '../db/index.js'
import { checkReadiness } from '../routes/health.routes.js'
import { isShuttingDown } from './lifecycle.js'
import { logger } from './logger.js'

// GL-13: giám sát trong tiến trình API. Kiểm từ bên ngoài (API chết hẳn, máy mất mạng) do
// uptime monitor gọi /api/v1/health và deploy/scripts/monitor.sh đảm nhận, xem docs/deploy.md.

let shared: OpsAlerter | undefined

export function opsAlerter(): OpsAlerter {
  if (!shared) {
    const { config, warnings } = opsAlertConfigFromEnv()
    for (const warning of warnings) logger.warn({ warning }, 'ops alert config ignored')
    shared = createOpsAlerter(config)
  }
  return shared
}

function report(alerter: OpsAlerter, alert: Parameters<OpsAlerter['send']>[0]): Promise<void> {
  return alerter
    .send(alert)
    .then((result) => {
      if (result.status === 'failed') {
        logger.error({ alertKey: alert.key, deliveries: result.deliveries }, 'ops alert failed')
      }
    })
    .catch(() => {})
}

/** Đếm phản hồi 5xx trong cửa sổ trượt; chạm ngưỡng thì cảnh báo (có throttle theo khóa). */
export function serverErrorSpikeAlert(args: {
  alerter: OpsAlerter
  threshold?: number
  windowMs?: number
  now?: () => number
}): MiddlewareHandler {
  const threshold = args.threshold ?? 20
  const windowMs = args.windowMs ?? 5 * 60_000
  const now = args.now ?? Date.now
  let hits: number[] = []
  return async (c, next) => {
    await next()
    if (c.res.status < 500 || !args.alerter.enabled) return
    const at = now()
    hits = hits.filter((time) => at - time < windowMs)
    hits.push(at)
    if (hits.length >= threshold) {
      const minutes = Math.round(windowMs / 60_000)
      void report(args.alerter, {
        key: 'http.5xx_spike',
        severity: 'error',
        title: 'Lỗi máy chủ 5xx tăng đột biến',
        body: `${hits.length} phản hồi 5xx trong ${minutes} phút gần nhất (ngưỡng ${threshold}). Xem log API theo requestId.`,
      })
    }
  }
}

/**
 * Tự kiểm readiness định kỳ. Hỏng `failuresBeforeAlert` lần liên tiếp thì cảnh báo critical,
 * phục hồi sau khi đã cảnh báo thì báo lại một lần.
 */
export function watchReadiness(args: {
  db: Db
  alerter: OpsAlerter
  intervalMs?: number
  failuresBeforeAlert?: number
}): { tick: () => Promise<void>; stop: () => void } {
  const failuresBeforeAlert = args.failuresBeforeAlert ?? 3
  let failures = 0
  let alerted = false
  const tick = async () => {
    if (isShuttingDown()) return
    const result = await checkReadiness(args.db)
    if (result.ready) {
      if (alerted) {
        await report(args.alerter, {
          key: 'health.readiness',
          severity: 'info',
          title: 'API đã sẵn sàng trở lại',
          body: 'Readiness trả 200: DB và migration bình thường.',
          force: true,
        })
      }
      failures = 0
      alerted = false
      return
    }
    failures++
    if (failures >= failuresBeforeAlert && !alerted) {
      alerted = true
      await report(args.alerter, {
        key: 'health.readiness',
        severity: 'critical',
        title: 'API không sẵn sàng',
        body: `Readiness lỗi ${failures} lần liên tiếp: db=${result.checks.db}, migrations=${result.checks.migrations}.`,
        force: true,
      })
    }
  }
  const timer = args.alerter.enabled
    ? setInterval(() => void tick().catch(() => {}), args.intervalMs ?? 60_000)
    : undefined
  timer?.unref()
  return { tick, stop: () => clearInterval(timer) }
}
