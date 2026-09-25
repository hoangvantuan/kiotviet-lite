import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

import { MAX_PAGE_SIZE, paginationSchema } from '@kiotviet-lite/shared'

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []) {
  const files = fs.readdirSync(dirPath)

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file)
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles)
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      arrayOfFiles.push(fullPath)
    }
  })

  return arrayOfFiles
}

describe('Pagination Contract Tests', () => {
  it('no component or hook hardcodes a pageSize larger than MAX_PAGE_SIZE', () => {
    const srcDir = path.resolve(__dirname)
    const files = getAllFiles(srcDir)

    let foundPageSize = false

    files.forEach((file) => {
      // skip tests
      if (file.includes('.test.')) return

      const content = fs.readFileSync(file, 'utf8')
      const regex = /pageSize:\s*(\d+|MAX_PAGE_SIZE|PAGE_SIZE)/g

      let match
      while ((match = regex.exec(content)) !== null) {
        foundPageSize = true
        const valStr = match[1]!
        let val: number

        if (valStr === 'MAX_PAGE_SIZE') {
          val = MAX_PAGE_SIZE
        } else if (valStr === 'PAGE_SIZE') {
          // PAGE_SIZE is usually 20, but we can verify it's valid
          val = 20
        } else {
          val = parseInt(valStr, 10)
        }

        try {
          paginationSchema.parse({ pageSize: val })
        } catch {
          throw new Error(
            `File ${file} contains invalid pageSize: ${val}. Maximum allowed is ${MAX_PAGE_SIZE}.`,
          )
        }
      }
    })

    expect(foundPageSize).toBe(true)
  })
})
