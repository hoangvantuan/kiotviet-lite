import { useEffect, useState } from 'react'
import { Plus, Trash2, Wand2 } from 'lucide-react'

import type { UnitConversionInput } from '@kiotviet-lite/shared'

import { CurrencyInput } from '@/components/shared/currency-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiClientError } from '@/lib/api-client'
import { showError, showSuccess } from '@/lib/toast'

import { formatUnitDisplay, validateUnitNotConflict } from './unit-conversion-utils'
import {
  useCreateUnitConversionMutation,
  useDeleteUnitConversionMutation,
  useUnitConversionsQuery,
  useUpdateUnitConversionMutation,
} from './use-products'

export interface UnitConversionEditorCreateProps {
  mode: 'create'
  value: UnitConversionInput[]
  onChange: (next: UnitConversionInput[]) => void
  parentUnit: string
  parentSellingPrice: number
}

export interface UnitConversionEditorEditProps {
  mode: 'edit'
  productId: string
  parentUnit: string
  parentSellingPrice: number
}

export type UnitConversionEditorProps =
  | UnitConversionEditorCreateProps
  | UnitConversionEditorEditProps

const MAX_CONVERSIONS = 3

export function UnitConversionEditor(props: UnitConversionEditorProps) {
  if (props.mode === 'create') return <CreateEditor {...props} />
  return <EditEditor {...props} />
}

interface RowErrors {
  unit?: string
  conversionFactor?: string
  sellingPrice?: string
}

function validateRow(
  row: UnitConversionInput,
  parentUnit: string,
  others: { unit: string }[],
  selfIndex: number,
): RowErrors {
  const errs: RowErrors = {}
  const unitErr = validateUnitNotConflict(row.unit, parentUnit, others, selfIndex)
  if (unitErr) errs.unit = unitErr
  if (
    !Number.isInteger(row.conversionFactor) ||
    row.conversionFactor < 2 ||
    row.conversionFactor > 100_000
  ) {
    errs.conversionFactor = 'Hệ số phải là số nguyên 2-100.000'
  }
  if (!Number.isInteger(row.sellingPrice) || row.sellingPrice < 0) {
    errs.sellingPrice = 'Giá ≥ 0'
  }
  return errs
}

function CreateEditor({
  value,
  onChange,
  parentUnit,
  parentSellingPrice,
}: UnitConversionEditorCreateProps) {
  const canAdd = value.length < MAX_CONVERSIONS

  function addRow() {
    if (!canAdd) return
    onChange([
      ...value,
      { unit: '', conversionFactor: 2, sellingPrice: 0, sortOrder: value.length },
    ])
  }

  function removeRow(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  function updateRow(index: number, patch: Partial<UnitConversionInput>) {
    onChange(value.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Đơn vị quy đổi</h3>
          <p className="text-xs text-muted-foreground">
            Tối đa 3 đơn vị quy đổi (VD: Lốc, Thùng, Pallet). Đơn vị tính cơ bản:{' '}
            {parentUnit || 'Cái'}.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={!canAdd}>
          <Plus className="mr-1 size-4" />
          Thêm đơn vị quy đổi
        </Button>
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Chưa có đơn vị quy đổi nào.</p>
      ) : (
        <div className="space-y-3">
          {value.map((row, i) => {
            const errs = validateRow(row, parentUnit, value, i)
            return (
              <ConversionRow
                key={i}
                row={row}
                index={i}
                parentUnit={parentUnit}
                parentSellingPrice={parentSellingPrice}
                errors={errs}
                onChange={(patch) => updateRow(i, patch)}
                onRemove={() => removeRow(i)}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}

function EditEditor({ productId, parentUnit, parentSellingPrice }: UnitConversionEditorEditProps) {
  const query = useUnitConversionsQuery(productId)
  const createMut = useCreateUnitConversionMutation(productId)
  const updateMut = useUpdateUnitConversionMutation(productId)
  const deleteMut = useDeleteUnitConversionMutation(productId)

  const [draft, setDraft] = useState<UnitConversionInput | null>(null)
  const [draftErrors, setDraftErrors] = useState<RowErrors>({})
  const [editing, setEditing] = useState<Record<string, UnitConversionInput>>({})

  useEffect(() => {
    if (!query.data) return
    setEditing((prev) => {
      const next = { ...prev }
      const seen = new Set<string>()
      for (const item of query.data) {
        seen.add(item.id)
        if (!next[item.id]) {
          next[item.id] = {
            unit: item.unit,
            conversionFactor: item.conversionFactor,
            sellingPrice: item.sellingPrice,
            sortOrder: item.sortOrder,
          }
        }
      }
      // Drop entries for items that no longer exist (deleted)
      for (const id of Object.keys(next)) {
        if (!seen.has(id)) delete next[id]
      }
      return next
    })
  }, [query.data])

  const items = query.data ?? []
  const canAdd = items.length + (draft ? 1 : 0) < MAX_CONVERSIONS
  const others = items.map((it) => ({ unit: it.unit }))

  function startAdd() {
    if (!canAdd) return
    setDraft({
      unit: '',
      conversionFactor: 2,
      sellingPrice: 0,
      sortOrder: items.length,
    })
    setDraftErrors({})
  }

  async function submitDraft() {
    if (!draft) return
    const errs = validateRow(draft, parentUnit, [...others], -1)
    setDraftErrors(errs)
    if (Object.keys(errs).length > 0) return
    try {
      await createMut.mutateAsync(draft)
      showSuccess('Đã tạo đơn vị quy đổi')
      setDraft(null)
    } catch (err) {
      showError(err instanceof ApiClientError ? err.message : 'Không tạo được đơn vị quy đổi')
    }
  }

  async function commitItem(id: string) {
    const next = editing[id]
    const original = items.find((it) => it.id === id)
    if (!next || !original) return
    const others2 = items.filter((it) => it.id !== id).map((it) => ({ unit: it.unit }))
    const errs = validateRow(next, parentUnit, others2, -1)
    if (Object.keys(errs).length > 0) {
      const firstErr = Object.values(errs)[0]
      if (firstErr) showError(firstErr)
      return
    }
    const patch: Record<string, unknown> = {}
    if (next.unit !== original.unit) patch.unit = next.unit
    if (next.conversionFactor !== original.conversionFactor)
      patch.conversionFactor = next.conversionFactor
    if (next.sellingPrice !== original.sellingPrice) patch.sellingPrice = next.sellingPrice
    if (Object.keys(patch).length === 0) return
    try {
      await updateMut.mutateAsync({ conversionId: id, input: patch })
      showSuccess('Đã cập nhật đơn vị quy đổi')
    } catch (err) {
      showError(err instanceof ApiClientError ? err.message : 'Không cập nhật được')
    }
  }

  async function removeItem(id: string) {
    if (!window.confirm('Xoá đơn vị quy đổi này?')) return
    try {
      await deleteMut.mutateAsync(id)
      showSuccess('Đã xoá đơn vị quy đổi')
    } catch (err) {
      showError(err instanceof ApiClientError ? err.message : 'Không xoá được')
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Đơn vị quy đổi</h3>
          <p className="text-xs text-muted-foreground">
            Tối đa 3 đơn vị quy đổi. Đơn vị tính cơ bản: {parentUnit || 'Cái'}.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={startAdd} disabled={!canAdd}>
          <Plus className="mr-1 size-4" />
          Thêm đơn vị quy đổi
        </Button>
      </div>

      {query.isLoading && <p className="text-xs text-muted-foreground">Đang tải đơn vị quy đổi…</p>}

      {items.length === 0 && !draft && !query.isLoading && (
        <p className="text-xs italic text-muted-foreground">Chưa có đơn vị quy đổi nào.</p>
      )}

      <div className="space-y-3">
        {items.map((item) => {
          const editRow = editing[item.id] ?? {
            unit: item.unit,
            conversionFactor: item.conversionFactor,
            sellingPrice: item.sellingPrice,
            sortOrder: item.sortOrder,
          }
          const errs = validateRow(
            editRow,
            parentUnit,
            items.filter((it) => it.id !== item.id).map((it) => ({ unit: it.unit })),
            -1,
          )
          return (
            <div key={item.id} className="space-y-2">
              <ConversionRow
                row={editRow}
                index={0}
                parentUnit={parentUnit}
                parentSellingPrice={parentSellingPrice}
                errors={errs}
                onChange={(patch) =>
                  setEditing((prev) => ({
                    ...prev,
                    [item.id]: { ...editRow, ...patch },
                  }))
                }
                onRemove={() => removeItem(item.id)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setEditing((prev) => ({
                      ...prev,
                      [item.id]: {
                        unit: item.unit,
                        conversionFactor: item.conversionFactor,
                        sellingPrice: item.sellingPrice,
                        sortOrder: item.sortOrder,
                      },
                    }))
                  }
                  disabled={updateMut.isPending}
                >
                  Hoàn tác
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => commitItem(item.id)}
                  disabled={
                    updateMut.isPending ||
                    Object.keys(errs).length > 0 ||
                    (editRow.unit === item.unit &&
                      editRow.conversionFactor === item.conversionFactor &&
                      editRow.sellingPrice === item.sellingPrice)
                  }
                >
                  Lưu
                </Button>
              </div>
            </div>
          )
        })}

        {draft && (
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <ConversionRow
              row={draft}
              index={-1}
              parentUnit={parentUnit}
              parentSellingPrice={parentSellingPrice}
              errors={draftErrors}
              onChange={(patch) => setDraft({ ...draft, ...patch })}
              onRemove={() => setDraft(null)}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setDraft(null)}
                disabled={createMut.isPending}
              >
                Huỷ
              </Button>
              <Button type="button" size="sm" onClick={submitDraft} disabled={createMut.isPending}>
                {createMut.isPending ? 'Đang lưu…' : 'Tạo'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

interface ConversionRowProps {
  row: UnitConversionInput
  index: number
  parentUnit: string
  parentSellingPrice: number
  errors: RowErrors
  onChange: (patch: Partial<UnitConversionInput>) => void
  onRemove: () => void
}

function ConversionRow({
  row,
  parentUnit,
  parentSellingPrice,
  errors,
  onChange,
  onRemove,
}: ConversionRowProps) {
  const helperText =
    row.unit && row.conversionFactor >= 2
      ? formatUnitDisplay(row.unit, row.conversionFactor, parentUnit || 'Cái')
      : null

  function autoFillPrice() {
    const computed = parentSellingPrice * row.conversionFactor
    onChange({ sellingPrice: Math.max(0, Math.round(computed)) })
  }

  return (
    <div className="grid grid-cols-1 gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-12">
      <div className="sm:col-span-3">
        <Label className="text-xs">Đơn vị</Label>
        <Input
          value={row.unit}
          onChange={(e) => onChange({ unit: e.target.value })}
          placeholder="Thùng, Lốc..."
        />
        {errors.unit && <p className="mt-1 text-xs text-red-600">{errors.unit}</p>}
      </div>
      <div className="sm:col-span-3">
        <Label className="text-xs">Hệ số quy đổi</Label>
        <Input
          type="number"
          inputMode="numeric"
          min={2}
          value={row.conversionFactor}
          onChange={(e) => onChange({ conversionFactor: Number(e.target.value) || 0 })}
        />
        {errors.conversionFactor && (
          <p className="mt-1 text-xs text-red-600">{errors.conversionFactor}</p>
        )}
      </div>
      <div className="sm:col-span-5">
        <Label className="text-xs">Giá bán</Label>
        <div className="flex items-center gap-2">
          <CurrencyInput
            value={row.sellingPrice}
            onChange={(v) => onChange({ sellingPrice: v ?? 0 })}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={autoFillPrice}
            title="Tự tính: parent price × hệ số"
          >
            <Wand2 className="size-4" />
          </Button>
        </div>
        {errors.sellingPrice && <p className="mt-1 text-xs text-red-600">{errors.sellingPrice}</p>}
      </div>
      <div className="flex items-end justify-end sm:col-span-1">
        <Button type="button" size="icon" variant="ghost" onClick={onRemove}>
          <Trash2 className="size-4 text-red-600" />
        </Button>
      </div>
      {helperText && (
        <div className="sm:col-span-12">
          <p className="text-xs text-muted-foreground">{helperText}</p>
        </div>
      )}
    </div>
  )
}
