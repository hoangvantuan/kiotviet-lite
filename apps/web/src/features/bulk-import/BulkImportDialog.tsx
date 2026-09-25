import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, FileSpreadsheet, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { showError, showSuccess } from '@/lib/toast'

import {
  cancelImportJob,
  confirmImport,
  downloadImportErrors,
  downloadImportFile,
  getImportJob,
  type ImportJob,
  type ImportKind,
  type ImportMode,
  type ImportPreview,
  isActiveJob,
  jobTypeForKind,
  listImportJobs,
  previewImport,
} from './bulk-import-api'

const MAX_FILE_SIZE = 8 * 1024 * 1024
const titles: Record<ImportKind, string> = {
  products: 'sản phẩm',
  customers: 'khách hàng',
  suppliers: 'nhà cung cấp',
}
const statuses: Record<ImportJob['status'], string> = {
  queued: 'Đang chờ xử lý',
  running: 'Đang xử lý',
  completed: 'Hoàn tất',
  failed: 'Thất bại',
  cancelled: 'Đã huỷ',
}

function needsConversionApproval(preview: ImportPreview) {
  return preview.conversions.some((item) => item.requiresConfirmation)
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : 'Không thể xử lý yêu cầu. Vui lòng thử lại.'
}

function JobDetails({
  job,
  onCancel,
  cancelling,
}: {
  job: ImportJob
  onCancel: (job: ImportJob) => void
  cancelling: boolean
}) {
  const progress =
    job.totalRows > 0 ? Math.min(100, Math.round((job.processedRows / job.totalRows) * 100)) : 0
  const fileExpired = new Date(job.expiresAt).getTime() <= Date.now()
  return (
    <section
      className="space-y-3 rounded-md border p-4"
      aria-label={`Lần nhập ${job.originalFilename}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-all font-medium">{job.originalFilename}</p>
          <p className="text-sm text-muted-foreground">
            {new Date(job.createdAt).toLocaleString('vi-VN')} ·{' '}
            {job.mode === 'upsert' ? 'Thêm hoặc cập nhật' : 'Chỉ thêm mới'}
          </p>
        </div>
        <span className="text-sm font-medium" role="status">
          {statuses[job.status]}
        </span>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-sm">
          <span>
            Đã xử lý {job.processedRows}/{job.totalRows} dòng
          </span>
          <span>{progress}%</span>
        </div>
        <progress
          className="h-2 w-full accent-primary"
          max={job.totalRows || 1}
          value={job.processedRows}
          aria-label="Tiến độ nhập"
        />
        <p className="text-sm text-muted-foreground">
          Thành công: {job.succeededRows} · Lỗi: {job.failedRows}
        </p>
      </div>
      {job.errorMessage && (
        <p className="text-sm text-destructive" role="alert">
          {job.errorMessage}
        </p>
      )}
      {job.status === 'cancelled' && (
        <p className="text-sm text-muted-foreground">Không có bản ghi nào được nhập.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={fileExpired}
          onClick={() =>
            void downloadImportFile(job).catch((error: unknown) => showError(messageFor(error)))
          }
        >
          <Download className="size-4" /> Tải tệp gốc
        </Button>
        {isActiveJob(job) && (
          <Button variant="outline" size="sm" disabled={cancelling} onClick={() => onCancel(job)}>
            {cancelling ? 'Đang huỷ…' : 'Huỷ lần nhập'}
          </Button>
        )}
      </div>
      {fileExpired && <p className="text-sm text-muted-foreground">Tệp gốc đã hết hạn lưu trữ.</p>}
    </section>
  )
}

export function BulkImportDialog({
  kind,
  open,
  onOpenChange,
}: {
  kind: ImportKind
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [view, setView] = useState<'upload' | 'preview' | 'job' | 'history'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<ImportMode>('create-only')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [approved, setApproved] = useState(false)
  const [approvedConversions, setApprovedConversions] = useState(false)
  const [pending, setPending] = useState<'preview' | 'confirm' | 'cancel' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const previewAbort = useRef<AbortController | null>(null)
  const completedJob = useRef<string | null>(null)
  const history = useQuery({
    queryKey: ['bulk-import-jobs'],
    queryFn: listImportJobs,
    enabled: open,
    refetchInterval: (query) => (query.state.data?.some(isActiveJob) ? 4000 : false),
  })
  const current = useQuery({
    queryKey: ['bulk-import-job', jobId],
    queryFn: () => getImportJob(jobId!),
    enabled: jobId !== null,
    refetchInterval: (query) => (query.state.data && isActiveJob(query.state.data) ? 3000 : false),
  })

  useEffect(() => {
    if (current.data?.status !== 'completed' || completedJob.current === current.data.id) return
    completedJob.current = current.data.id
    const key = kind === 'products' ? 'products' : kind === 'customers' ? 'customers' : 'suppliers'
    void queryClient.invalidateQueries({ queryKey: [key] })
    if (kind === 'products') {
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
      void queryClient.invalidateQueries({ queryKey: ['brands'] })
    }
  }, [current.data, kind, queryClient])

  useEffect(
    () => () => {
      requestVersion.current += 1
      previewAbort.current?.abort()
    },
    [],
  )

  function resetPreview() {
    requestVersion.current += 1
    previewAbort.current?.abort()
    previewAbort.current = null
    setPreview(null)
    setApproved(false)
    setApprovedConversions(false)
    setError(null)
    setPending((value) => (value === 'preview' ? null : value))
  }

  function changeOpen(next: boolean) {
    if (!next && pending === 'confirm') return
    if (!next) {
      resetPreview()
      setFile(null)
      setView(jobId ? 'job' : 'upload')
    }
    onOpenChange(next)
  }

  function selectFile(selected: File | null) {
    resetPreview()
    setFile(null)
    if (!selected) return
    if (!/\.xlsx$/i.test(selected.name)) {
      setError('Chỉ chấp nhận tệp Excel .xlsx.')
    } else if (selected.size > MAX_FILE_SIZE) {
      setError('Tệp vượt quá 8 MiB. Vui lòng chọn tệp nhỏ hơn.')
    } else {
      setFile(selected)
    }
  }

  async function startPreview() {
    if (!file || pending) return
    resetPreview()
    const version = requestVersion.current
    const controller = new AbortController()
    previewAbort.current = controller
    setPending('preview')
    try {
      const result = await previewImport(kind, file, mode, controller.signal)
      if (version !== requestVersion.current) return
      setPreview(result)
      setView('preview')
    } catch (cause) {
      if (version === requestVersion.current && !controller.signal.aborted)
        setError(messageFor(cause))
    } finally {
      if (version === requestVersion.current) setPending(null)
    }
  }

  async function startImport() {
    if (
      !file ||
      !preview ||
      pending ||
      preview.errors.length > 0 ||
      ((preview.newCategories.length > 0 || preview.newBrands.length > 0) && !approved) ||
      (needsConversionApproval(preview) && !approvedConversions)
    )
      return
    setPending('confirm')
    setError(null)
    try {
      const job = await confirmImport(
        kind,
        file,
        mode,
        preview.digest,
        approved,
        approvedConversions,
      )
      setJobId(job.id)
      queryClient.setQueryData(['bulk-import-job', job.id], job)
      void queryClient.invalidateQueries({ queryKey: ['bulk-import-jobs'] })
      setView('job')
      setFile(null)
      setPreview(null)
      showSuccess('Đã gửi tệp để nhập dữ liệu')
    } catch (cause) {
      setError(messageFor(cause))
    } finally {
      setPending(null)
    }
  }

  async function cancel(job: ImportJob) {
    setPending('cancel')
    setError(null)
    try {
      const result = await cancelImportJob(job.id)
      queryClient.setQueryData(['bulk-import-job', job.id], result)
      void queryClient.invalidateQueries({ queryKey: ['bulk-import-jobs'] })
      showSuccess('Đã huỷ lần nhập')
    } catch (cause) {
      setError(messageFor(cause))
    } finally {
      setPending(null)
    }
  }

  const jobs = (history.data ?? []).filter((job) => job.type === jobTypeForKind[kind])
  const needsApproval =
    preview && (preview.newCategories.length > 0 || preview.newBrands.length > 0)

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[min(90dvh,900px)] max-w-2xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Nhập {titles[kind]} từ Excel</DialogTitle>
          <DialogDescription>
            Kiểm tra dữ liệu trước khi xác nhận. Đóng cửa sổ hoặc quay lại sẽ không ghi dữ liệu.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2 border-b pb-3">
          <Button
            variant={view === 'history' ? 'outline' : 'secondary'}
            size="sm"
            onClick={() => setView(jobId ? 'job' : preview ? 'preview' : 'upload')}
          >
            Lần nhập hiện tại
          </Button>
          <Button
            variant={view === 'history' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => {
              if (pending === 'preview') resetPreview()
              setView('history')
            }}
          >
            Lịch sử nhập
          </Button>
          {view === 'job' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetPreview()
                setFile(null)
                setView('upload')
              }}
            >
              Nhập tệp khác
            </Button>
          )}
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {view === 'upload' && (
          <div className="space-y-5">
            <div className="space-y-2">
              <label htmlFor={`import-file-${kind}`} className="block text-sm font-medium">
                Tệp Excel (.xlsx, tối đa 8 MiB)
              </label>
              <p className="text-xs text-muted-foreground">
                Dùng tệp mẫu của hệ thống hoặc chọn thẳng tệp xuất từ KiotViet, không cần sửa cột.
              </p>
              <input
                id={`import-file-${kind}`}
                type="file"
                accept=".xlsx"
                className="block w-full min-w-0 text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-2 file:text-foreground"
                onChange={(event) => {
                  selectFile(event.target.files?.[0] ?? null)
                  event.target.value = ''
                }}
              />
              {file && (
                <p className="break-all text-sm text-muted-foreground">
                  <FileSpreadsheet className="mr-1 inline size-4" />
                  {file.name}
                </p>
              )}
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Cách nhập</legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  className="mt-1 accent-primary"
                  name={`import-mode-${kind}`}
                  checked={mode === 'create-only'}
                  onChange={() => {
                    resetPreview()
                    setMode('create-only')
                  }}
                />
                Chỉ thêm mới — mã đã tồn tại sẽ được báo lỗi, không ghi đè
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  className="mt-1 accent-primary"
                  name={`import-mode-${kind}`}
                  checked={mode === 'upsert'}
                  onChange={() => {
                    resetPreview()
                    setMode('upsert')
                  }}
                />
                Thêm hoặc cập nhật bản ghi đã tồn tại
              </label>
            </fieldset>
            {kind === 'products' && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Tồn kho trong tệp sẽ được bỏ qua; nhập kho bằng phiếu nhập hoặc điều chỉnh kho.
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => changeOpen(false)}>
                Đóng
              </Button>
              <Button disabled={!file || !!pending} onClick={() => void startPreview()}>
                {pending === 'preview' && <Loader2 className="size-4 animate-spin" />}Xem trước
              </Button>
            </DialogFooter>
          </div>
        )}
        {view === 'preview' && preview && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="size-4 shrink-0" />
              <span className="break-all">{preview.filename}</span>
            </div>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(
                [
                  ['Tổng dòng', preview.totalRows],
                  ['Thêm mới', preview.creates],
                  ['Cập nhật', preview.updates],
                  ['Không đổi', preview.noOps],
                  ['Lỗi', preview.errors.length],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-md border p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-xl font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            {kind === 'products' && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Tồn kho trong tệp sẽ được bỏ qua.
              </p>
            )}
            {preview.warnings.length > 0 && (
              <section>
                <h3 className="font-medium">Lưu ý</h3>
                <ul className="list-inside list-disc text-sm">
                  {preview.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </section>
            )}
            {preview.conversions.length > 0 && (
              <section className="space-y-2 rounded-md border p-3 text-sm">
                <h3 className="font-medium">
                  Thay đổi tự động
                  {preview.sourceFormat === 'kiotviet' && ' (tệp xuất từ KiotViet)'}
                </h3>
                <ul className="max-h-56 space-y-1 overflow-y-auto" aria-label="Thay đổi tự động">
                  {preview.conversions.map((item, index) => (
                    <li key={index}>
                      {item.message}
                      {item.count > 0 && (
                        <span className="text-muted-foreground">
                          {' '}
                          ({item.count} dòng
                          {item.rows.length > 0 &&
                            `: ${item.rows.join(', ')}${item.count > item.rows.length ? '…' : ''}`}
                          )
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {needsConversionApproval(preview) && (
                  <label className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-amber-950">
                    <input
                      type="checkbox"
                      checked={approvedConversions}
                      onChange={(event) => setApprovedConversions(event.target.checked)}
                      className="mt-1 accent-primary"
                    />
                    Tôi đã xem và đồng ý các thay đổi tự động trên.
                  </label>
                )}
              </section>
            )}
            {needsApproval && (
              <section className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-medium">Tên chưa có trong cửa hàng</p>
                {preview.newCategories.length > 0 && (
                  <p>Danh mục mới: {preview.newCategories.join(', ')}</p>
                )}
                {preview.newBrands.length > 0 && (
                  <p>Thương hiệu mới: {preview.newBrands.join(', ')}</p>
                )}
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={approved}
                    onChange={(event) => setApproved(event.target.checked)}
                    className="mt-1 accent-primary"
                  />
                  Tôi đồng ý tạo các danh mục và thương hiệu mới trên khi nhập.
                </label>
              </section>
            )}
            {preview.sample.length > 0 && (
              <section>
                <h3 className="mb-2 font-medium">Dữ liệu mẫu</h3>
                <div className="max-h-44 space-y-2 overflow-auto rounded-md border p-3">
                  {preview.sample.map((row, index) => (
                    <dl
                      key={index}
                      className="flex flex-wrap gap-x-4 gap-y-1 border-b pb-2 text-sm last:border-0"
                    >
                      {Object.entries(row).map(([key, value]) => (
                        <div key={key}>
                          <dt className="inline text-muted-foreground">{key}: </dt>
                          <dd className="inline">{value == null ? '—' : String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  ))}
                </div>
              </section>
            )}
            {preview.errors.length > 0 && (
              <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">Lỗi theo dòng ({preview.errors.length})</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void downloadImportErrors(preview.errors).catch((cause: unknown) =>
                        showError(messageFor(cause)),
                      )
                    }
                  >
                    <Download className="size-4" /> Tải Excel lỗi
                  </Button>
                </div>
                <ul
                  className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-3 text-sm"
                  aria-label="Tất cả lỗi trong tệp"
                >
                  {preview.errors.map((item, index) => (
                    <li key={index}>
                      <strong>
                        Dòng {item.row}, cột {item.column}:
                      </strong>{' '}
                      {item.message}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                disabled={!!pending}
                onClick={() => {
                  resetPreview()
                  setView('upload')
                }}
              >
                <ArrowLeft className="size-4" /> Quay lại
              </Button>
              <Button
                disabled={
                  !!pending ||
                  (!!needsApproval && !approved) ||
                  (needsConversionApproval(preview) && !approvedConversions) ||
                  preview.errors.length > 0 ||
                  preview.totalRows === 0
                }
                onClick={() => void startImport()}
              >
                {pending === 'confirm' ? 'Đang xác nhận…' : 'Xác nhận nhập'}
              </Button>
            </DialogFooter>
          </div>
        )}
        {view === 'job' && (
          <div className="space-y-3">
            {current.data ? (
              <JobDetails
                job={current.data}
                onCancel={(job) => void cancel(job)}
                cancelling={pending === 'cancel'}
              />
            ) : current.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {messageFor(current.error)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Đang tải trạng thái…</p>
            )}
            <p className="text-sm text-muted-foreground">
              Có thể đóng cửa sổ và xem lại tiến độ trong Lịch sử nhập.
            </p>
          </div>
        )}
        {view === 'history' && (
          <div className="space-y-3">
            {history.isLoading && (
              <p className="text-sm text-muted-foreground">Đang tải lịch sử…</p>
            )}
            {history.isError && (
              <p role="alert" className="text-sm text-destructive">
                {messageFor(history.error)}
              </p>
            )}
            {!history.isLoading && !history.isError && jobs.length === 0 && (
              <p className="text-sm text-muted-foreground">Chưa có lần nhập {titles[kind]} nào.</p>
            )}
            {jobs.map((job) => (
              <JobDetails
                key={job.id}
                job={job.id === current.data?.id ? current.data : job}
                onCancel={(item) => void cancel(item)}
                cancelling={pending === 'cancel'}
              />
            ))}
          </div>
        )}
        {(view === 'job' || view === 'history') && (
          <DialogFooter>
            <Button variant="outline" onClick={() => changeOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
