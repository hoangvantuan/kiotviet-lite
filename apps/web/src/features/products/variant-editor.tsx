import { useState } from 'react'
import { Plus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  type AttributeDef,
  cartesianProduct,
  mergeVariants,
  type VariantsForm,
} from './variants-utils'

const MAX_VALUES = 20
const MAX_VARIANTS = 100

interface VariantEditorProps {
  value: VariantsForm
  onChange: (next: VariantsForm) => void
  parentSku: string
  defaultSellingPrice: number
  defaultCostPrice: number | null
}

export function VariantEditor({
  value,
  onChange,
  parentSku,
  defaultSellingPrice,
  defaultCostPrice,
}: VariantEditorProps) {
  const [v1Input, setV1Input] = useState('')
  const [v2Input, setV2Input] = useState('')
  const [name1, setName1] = useState(value.attribute1?.name ?? '')
  const [name2, setName2] = useState(value.attribute2?.name ?? '')

  function regenerate(attr1: AttributeDef | null, attr2: AttributeDef | null) {
    if (!attr1 || attr1.values.length === 0) {
      onChange({ attribute1: attr1, attribute2: attr2, variants: value.variants })
      return
    }
    const combos = cartesianProduct(attr1.values, attr2?.values)
    if (combos.length > MAX_VARIANTS) return
    const merged = mergeVariants({
      existing: value.variants,
      combos,
      parentSku,
      defaultSellingPrice,
      defaultCostPrice,
    })
    onChange({ attribute1: attr1, attribute2: attr2, variants: merged })
  }

  function addAttr1() {
    const trimmed = name1.trim()
    if (!trimmed) return
    const next: AttributeDef = value.attribute1
      ? { ...value.attribute1, name: trimmed }
      : { name: trimmed, values: [] }
    regenerate(next, value.attribute2)
  }

  function addAttr2() {
    const trimmed = name2.trim()
    if (!trimmed) return
    const next: AttributeDef = value.attribute2
      ? { ...value.attribute2, name: trimmed }
      : { name: trimmed, values: [] }
    regenerate(value.attribute1, next)
  }

  function removeAttr2() {
    setName2('')
    regenerate(value.attribute1, null)
  }

  function addValue1() {
    const v = v1Input.trim()
    if (!v || !value.attribute1) return
    const lower = v.toLowerCase()
    if (value.attribute1.values.some((x) => x.toLowerCase() === lower)) return
    if (value.attribute1.values.length >= MAX_VALUES) return
    setV1Input('')
    regenerate({ ...value.attribute1, values: [...value.attribute1.values, v] }, value.attribute2)
  }

  function removeValue1(idx: number) {
    if (!value.attribute1) return
    const next = value.attribute1.values.filter((_, i) => i !== idx)
    regenerate({ ...value.attribute1, values: next }, value.attribute2)
  }

  function addValue2() {
    const v = v2Input.trim()
    if (!v || !value.attribute2) return
    const lower = v.toLowerCase()
    if (value.attribute2.values.some((x) => x.toLowerCase() === lower)) return
    if (value.attribute2.values.length >= MAX_VALUES) return
    setV2Input('')
    regenerate(value.attribute1, {
      ...value.attribute2,
      values: [...value.attribute2.values, v],
    })
  }

  function removeValue2(idx: number) {
    if (!value.attribute2) return
    const next = value.attribute2.values.filter((_, i) => i !== idx)
    regenerate(value.attribute1, { ...value.attribute2, values: next })
  }

  const cartesianCount = value.attribute1
    ? value.attribute1.values.length * (value.attribute2?.values.length || 1)
    : 0

  return (
    <section className="space-y-4 rounded-md border border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Thuộc tính & giá trị</h3>
        <span className="text-xs text-muted-foreground">
          {cartesianCount}/{MAX_VARIANTS} biến thể
        </span>
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="va1-name">Thuộc tính 1</Label>
          <div className="flex gap-2">
            <Input
              id="va1-name"
              placeholder="VD: Màu sắc"
              maxLength={50}
              value={name1}
              onChange={(e) => setName1(e.target.value)}
              onBlur={addAttr1}
            />
          </div>
          {value.attribute1 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {value.attribute1.values.map((v, i) => (
                  <span
                    key={`${v}-${i}`}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
                  >
                    {v}
                    <button
                      type="button"
                      onClick={() => removeValue1(i)}
                      aria-label={`Xoá ${v}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Thêm giá trị (Enter để thêm)"
                  maxLength={50}
                  value={v1Input}
                  onChange={(e) => setV1Input(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addValue1()
                    }
                  }}
                />
                <Button type="button" size="sm" variant="outline" onClick={addValue1}>
                  Thêm
                </Button>
              </div>
            </div>
          )}
        </div>

        {value.attribute1 && !value.attribute2 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const trimmed = name2.trim() || 'Thuộc tính 2'
              setName2(trimmed)
              addAttr2()
            }}
          >
            <Plus className="mr-1 h-3 w-3" />
            Thêm thuộc tính 2
          </Button>
        )}

        {value.attribute2 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="va2-name">Thuộc tính 2</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={removeAttr2}
                className="text-destructive"
              >
                Xoá thuộc tính
              </Button>
            </div>
            <Input
              id="va2-name"
              placeholder="VD: Kích cỡ"
              maxLength={50}
              value={name2}
              onChange={(e) => setName2(e.target.value)}
              onBlur={addAttr2}
            />
            <div className="flex flex-wrap gap-2">
              {value.attribute2.values.map((v, i) => (
                <span
                  key={`${v}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
                >
                  {v}
                  <button
                    type="button"
                    onClick={() => removeValue2(i)}
                    aria-label={`Xoá ${v}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Thêm giá trị (Enter để thêm)"
                maxLength={50}
                value={v2Input}
                onChange={(e) => setV2Input(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addValue2()
                  }
                }}
              />
              <Button type="button" size="sm" variant="outline" onClick={addValue2}>
                Thêm
              </Button>
            </div>
          </div>
        )}
      </div>

      {cartesianCount > MAX_VARIANTS && (
        <p className="text-sm text-destructive">
          Tổng số biến thể vượt giới hạn {MAX_VARIANTS}. Vui lòng giảm số giá trị.
        </p>
      )}
    </section>
  )
}
