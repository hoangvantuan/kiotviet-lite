import { useState } from 'react'

import { showError } from '@/lib/toast'
import { useAuthStore } from '@/stores/use-auth-store'

type CatalogKind = 'products' | 'customers' | 'suppliers'
type DownloadType = 'template' | 'export'

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'
const DOWNLOAD_ERROR = 'Không tải được tệp Excel. Vui lòng thử lại.'
const ACCESS_DENIED_ERROR =
  'Bạn không có quyền tải tệp này. Vui lòng đăng nhập bằng tài khoản chủ cửa hàng hoặc quản lý.'

async function downloadXlsx(
  kind: CatalogKind,
  type: DownloadType,
  filename: string,
  filters: Record<string, string | undefined> = {},
) {
  const params = new URLSearchParams()
  if (type === 'export') {
    for (const [key, value] of Object.entries(filters)) {
      if (value && (key === 'search' || value !== 'all')) params.set(key, value)
    }
  }
  const query = params.toString()
  const token = useAuthStore.getState().accessToken
  const response = await fetch(
    `${API_BASE_URL}/api/v1/bulk-export/${kind}/${type}${query ? `?${query}` : ''}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    },
  )
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(ACCESS_DENIED_ERROR)
    }
    throw new Error(DOWNLOAD_ERROR)
  }

  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function useBulkExportDownload(kind: CatalogKind, filename: string) {
  const [downloading, setDownloading] = useState<DownloadType | null>(null)

  async function download(type: DownloadType, filters?: Record<string, string | undefined>) {
    if (downloading) return
    setDownloading(type)
    try {
      await downloadXlsx(
        kind,
        type,
        `${type === 'template' ? 'mau-' : ''}${filename}.xlsx`,
        filters,
      )
    } catch (error) {
      showError(
        error instanceof Error && error.message === ACCESS_DENIED_ERROR
          ? error.message
          : DOWNLOAD_ERROR,
      )
    } finally {
      setDownloading(null)
    }
  }

  return { downloading, download }
}
