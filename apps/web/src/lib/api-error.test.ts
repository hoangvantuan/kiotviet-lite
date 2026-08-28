import { describe, expect, it, vi } from 'vitest'

import { ApiClientError } from './api-client'
import { handleApiError } from './api-error'
import * as toast from './toast'

describe('handleApiError', () => {
  it('gán lỗi form khi gặp CONFLICT và gọi showError', () => {
    const showErrorSpy = vi.spyOn(toast, 'showError').mockImplementation(() => {})
    const setErrorSpy = vi.fn()
    const form = { setError: setErrorSpy }

    const conflictErr = new ApiClientError(409, {
      code: 'CONFLICT',
      message: 'Số điện thoại đã tồn tại',
      details: { field: 'phone' },
    })

    handleApiError(conflictErr, form, ['phone', 'name'])

    expect(setErrorSpy).toHaveBeenCalledWith('phone', {
      message: 'Số điện thoại đã tồn tại',
    })
    expect(showErrorSpy).toHaveBeenCalledWith('Số điện thoại đã tồn tại')
    showErrorSpy.mockRestore()
  })

  it('gán lỗi form khi gặp VALIDATION_ERROR mảng issue', () => {
    const showErrorSpy = vi.spyOn(toast, 'showError').mockImplementation(() => {})
    const setErrorSpy = vi.fn()
    const form = { setError: setErrorSpy }

    const validationErr = new ApiClientError(400, {
      code: 'VALIDATION_ERROR',
      message: 'Dữ liệu không hợp lệ',
      details: [
        { path: 'name', message: 'Tên không được để trống' },
        { path: 'price', message: 'Giá phải lớn hơn 0' },
      ],
    })

    handleApiError(validationErr, form, ['name', 'price'])

    expect(setErrorSpy).toHaveBeenCalledWith('name', {
      message: 'Tên không được để trống',
    })
    expect(setErrorSpy).toHaveBeenCalledWith('price', {
      message: 'Giá phải lớn hơn 0',
    })
    expect(showErrorSpy).toHaveBeenCalledWith('Dữ liệu không hợp lệ')
    showErrorSpy.mockRestore()
  })
})
