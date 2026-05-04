/**
 * Web Serial API service for thermal printer communication.
 * Chrome 89+, Edge 89+, Opera 75+. Safari/Firefox not supported.
 */

const STORAGE_KEY = 'kv_last_printer'
const CONNECT_TIMEOUT = 5000
const SEND_TIMEOUT = 10000
const DEFAULT_BAUD_RATE = 9600

interface StoredPrinterInfo {
  usbVendorId?: number
  usbProductId?: number
}

/** Check if Web Serial API is available in this browser */
export function isSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

/** Saved printer info from localStorage */
function getSavedPrinter(): StoredPrinterInfo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StoredPrinterInfo
  } catch {
    return null
  }
}

function savePrinterInfo(port: SerialPort): void {
  try {
    const info = port.getInfo()
    if (info.usbVendorId) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        usbVendorId: info.usbVendorId,
        usbProductId: info.usbProductId,
      }))
    }
  } catch {
    // Ignore storage errors
  }
}

function clearSavedPrinter(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore
  }
}

/** Wrap a promise with timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(msg)), ms)
    promise.then(
      (val) => { clearTimeout(timer); resolve(val) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

// ---- SerialPortService ----

let activePort: SerialPort | null = null

/**
 * Try to auto-reconnect to a previously paired printer.
 * Returns the port if found, null otherwise.
 * Does NOT show the device picker.
 */
export async function reconnect(baudRate = DEFAULT_BAUD_RATE): Promise<SerialPort | null> {
  if (!isSerialSupported()) return null

  // Hoist ra ngoài try/catch để catch block truy cập được (H1)
  let targetPort: SerialPort | null = null

  try {
    const ports = await navigator.serial.getPorts()
    if (ports.length === 0) return null

    const saved = getSavedPrinter()

    if (saved?.usbVendorId) {
      const found = ports.find((p) => {
        const info = p.getInfo()
        return info.usbVendorId === saved.usbVendorId
          && info.usbProductId === saved.usbProductId
      })
      if (found) targetPort = found
    }

    // Fallback: use first available port
    if (!targetPort && ports.length > 0) {
      const first = ports[0]
      if (first) targetPort = first
    }

    if (!targetPort) return null

    await withTimeout(
      targetPort.open({ baudRate }),
      CONNECT_TIMEOUT,
      'Không thể kết nối máy in (timeout)',
    )

    activePort = targetPort
    savePrinterInfo(targetPort)
    return targetPort
  } catch (err) {
    // InvalidStateError: port đã được open (có thể bởi tab khác hoặc lần gọi trước)
    // Reuse targetPort thay vì chỉ check activePort (có thể null)
    if (err instanceof DOMException && err.name === 'InvalidStateError') {
      if (targetPort) {
        activePort = targetPort
        return activePort
      }
      if (activePort) {
        return activePort
      }
    }
    return null
  }
}

/**
 * Open the device picker for the user to select a printer.
 * Requires user gesture (click handler).
 * Throws NotFoundError if user cancels.
 */
export async function connect(baudRate = DEFAULT_BAUD_RATE): Promise<SerialPort> {
  if (!isSerialSupported()) {
    throw new Error('Trình duyệt không hỗ trợ Web Serial API')
  }

  const port = await navigator.serial.requestPort()

  await withTimeout(
    port.open({ baudRate }),
    CONNECT_TIMEOUT,
    'Không thể kết nối máy in (timeout)',
  )

  activePort = port
  savePrinterInfo(port)
  return port
}

/**
 * Send binary data to the connected printer.
 * Retries once on NetworkError.
 */
export async function send(data: Uint8Array, port?: SerialPort): Promise<void> {
  const target = port ?? activePort
  if (!target || !target.writable) {
    throw new Error('Máy in chưa kết nối')
  }

  const doSend = async () => {
    const writer = target.writable!.getWriter()
    try {
      await withTimeout(writer.write(data), SEND_TIMEOUT, 'Máy in không phản hồi (timeout)')
    } finally {
      writer.releaseLock()
    }
  }

  try {
    await doSend()
  } catch (err) {
    // Retry once on network error: reconnect trước rồi mới send lại
    if (err instanceof DOMException && err.name === 'NetworkError') {
      try {
        const reconnected = await reconnect()
        if (!reconnected) {
          clearSavedPrinter()
          throw new Error('Mất kết nối máy in')
        }
        // Send lại trên port mới
        const retryWriter = reconnected.writable?.getWriter()
        if (!retryWriter) {
          clearSavedPrinter()
          throw new Error('Mất kết nối máy in')
        }
        try {
          await withTimeout(retryWriter.write(data), SEND_TIMEOUT, 'Máy in không phản hồi (timeout)')
        } finally {
          retryWriter.releaseLock()
        }
      } catch (retryErr) {
        clearSavedPrinter()
        if (retryErr instanceof Error && retryErr.message === 'Mất kết nối máy in') {
          throw retryErr
        }
        throw new Error('Mất kết nối máy in')
      }
    } else {
      throw err
    }
  }
}

/** Disconnect and close the active port */
export async function disconnect(): Promise<void> {
  if (!activePort) return
  try {
    await activePort.close()
  } catch {
    // Ignore close errors
  } finally {
    activePort = null
  }
}

/** Get current active port (for status check) */
export function getActivePort(): SerialPort | null {
  return activePort
}
