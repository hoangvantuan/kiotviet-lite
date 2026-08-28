/**
 * Tiện ích xử lý lỗi API và gán lỗi vào biểu mẫu (form) dùng chung cho Web.
 */
import { ApiClientError } from './api-client'
import { showError } from './toast'

export interface FormSetError {
  setError: (name: string, error: { message: string }) => void
}

/**
 * Chuyển đổi đối tượng form (như useForm từ react-hook-form) thành FormSetError.
 */
export function asFormSetError(form: { setError: (...args: never[]) => void }): FormSetError {
  return {
    setError: (name, error) => {
      ;(form.setError as unknown as (n: string, e: { message: string }) => void)(name, error)
    },
  }
}

export interface HandleApiErrorOptions {
  knownFields?: string[]
  fallbackMessage?: string
  skipToast?: boolean
}

/**
 * Xử lý lỗi API thống nhất:
 * 1. Nếu có form và lỗi VALIDATION_ERROR hoặc CONFLICT, gán lỗi trực tiếp vào trường tương ứng của form.
 * 2. Hiển thị toast lỗi thông qua showError (trừ khi skipToast=true).
 */
export function handleApiError(
  err: unknown,
  formOrOptions?:
    | FormSetError
    | { setError: (...args: never[]) => void }
    | HandleApiErrorOptions
    | null,
  knownFieldsOrOptions?: string[] | HandleApiErrorOptions,
): void {
  let form: FormSetError | null = null
  let options: HandleApiErrorOptions = {}

  if (formOrOptions) {
    if (typeof (formOrOptions as FormSetError).setError === 'function') {
      form = asFormSetError(formOrOptions as { setError: (...args: never[]) => void })
      if (Array.isArray(knownFieldsOrOptions)) {
        options.knownFields = knownFieldsOrOptions
      } else if (knownFieldsOrOptions && typeof knownFieldsOrOptions === 'object') {
        options = { ...knownFieldsOrOptions }
      }
    } else {
      options = { ...(formOrOptions as HandleApiErrorOptions) }
    }
  }

  const fallbackMessage = options.fallbackMessage ?? 'Đã xảy ra lỗi không xác định'

  if (err instanceof ApiClientError) {
    // 1. Xử lý CONFLICT field level
    if (err.code === 'CONFLICT') {
      const detail = err.details as { field?: string; variantIndex?: number } | undefined
      if (form && detail?.field) {
        if (!options.knownFields || options.knownFields.includes(detail.field)) {
          form.setError(detail.field, { message: err.message })
        }
      }
    }

    // 2. Xử lý VALIDATION_ERROR issues
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
      const issues = err.details as Array<{ path: string; message: string }>
      if (form) {
        for (const issue of issues) {
          if (!options.knownFields || options.knownFields.includes(issue.path)) {
            form.setError(issue.path, { message: issue.message })
          }
        }
      }
    }

    if (!options.skipToast) {
      showError(err.message || fallbackMessage)
    }
    return
  }

  if (err instanceof Error) {
    if (!options.skipToast) {
      showError(err.message || fallbackMessage)
    }
    return
  }

  if (!options.skipToast) {
    showError(fallbackMessage)
  }
}
