/**
 * Convert a number to Vietnamese words.
 * Example: 1200000 → "Một triệu hai trăm nghìn đồng"
 * Supports up to hàng tỷ (billions).
 */

const DIGITS: string[] = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']

function digit(n: number): string {
  return DIGITS[n] ?? 'không'
}

function readGroup(hundreds: number, tens: number, units: number, showZeroHundred: boolean): string {
  const parts: string[] = []

  if (hundreds > 0) {
    parts.push(`${digit(hundreds)} trăm`)
  } else if (showZeroHundred) {
    parts.push('không trăm')
  }

  if (tens > 1) {
    parts.push(`${digit(tens)} mươi`)
    if (units === 1) {
      parts.push('mốt')
    } else if (units === 4) {
      parts.push('tư')
    } else if (units === 5) {
      parts.push('lăm')
    } else if (units > 0) {
      parts.push(digit(units))
    }
  } else if (tens === 1) {
    parts.push('mười')
    if (units === 5) {
      parts.push('lăm')
    } else if (units > 0) {
      parts.push(digit(units))
    }
  } else if (units > 0) {
    // tens === 0
    if (hundreds > 0 || showZeroHundred) {
      parts.push(`linh ${digit(units)}`)
    } else {
      parts.push(digit(units))
    }
  }

  return parts.join(' ')
}

function splitToGroups(n: number): number[] {
  const groups: number[] = []
  if (n === 0) {
    groups.push(0)
    return groups
  }
  let remaining = n
  while (remaining > 0) {
    groups.push(remaining % 1000)
    remaining = Math.floor(remaining / 1000)
  }
  return groups.reverse()
}

const UNITS = ['', 'nghìn', 'triệu', 'tỷ']

export function numberToVietnameseWords(n: number): string {
  if (n === 0) return 'Không đồng'

  const isNegative = n < 0
  const absN = Math.abs(Math.round(n))

  const groups = splitToGroups(absN)
  const len = groups.length

  if (len > 4) {
    // Handle numbers larger than 999,999,999,999 by recursive splitting at tỷ boundary
    // For POS purposes this is extremely rare
    return `${absN.toLocaleString('vi-VN')} đồng`
  }

  const wordParts: string[] = []

  for (let i = 0; i < len; i++) {
    const group = groups[i] ?? 0
    const unitIndex = len - 1 - i

    if (group === 0) {
      continue
    }

    const hundreds = Math.floor(group / 100)
    const tens = Math.floor((group % 100) / 10)
    const units = group % 10

    // Show zero hundred when this isn't the first group and group < 100
    const showZeroHundred = i > 0 && group < 100

    const groupText = readGroup(hundreds, tens, units, showZeroHundred)
    const unitText = UNITS[unitIndex] ?? ''

    wordParts.push(unitText ? `${groupText} ${unitText}` : groupText)
  }

  let result = wordParts.join(' ')

  // Capitalize first letter
  result = result.charAt(0).toUpperCase() + result.slice(1)

  if (isNegative) {
    result = `Âm ${result.charAt(0).toLowerCase()}${result.slice(1)}`
  }

  return `${result} đồng`
}
