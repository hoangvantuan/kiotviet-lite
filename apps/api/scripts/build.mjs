// GL-12: build API ra JavaScript để image production chạy bằng `node`, không cần tsx/TypeScript.
// Gộp mã workspace (@kiotviet-lite/*, vốn xuất thẳng mã TS) vào bundle; các gói npm giữ
// external và được cài bằng `pnpm install --prod` trong image.
import { build } from 'esbuild'
import { cp, readFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outdir = resolve(root, 'dist')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))

await rm(outdir, { recursive: true, force: true })
await build({
  absWorkingDir: root,
  entryPoints: { index: 'src/index.ts', migrate: 'src/db/migrate.ts' },
  outdir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'warning',
  plugins: [
    {
      name: 'external-npm-packages',
      setup(ctx) {
        ctx.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith('@kiotviet-lite/') || args.path.startsWith('node:')) return
          return { path: args.path, external: true }
        })
      },
    },
  ],
})
// Migration SQL đi cùng bản build: dist/migrate.js đọc ./migrations cạnh nó.
await cp(resolve(root, 'src/db/migrations'), resolve(outdir, 'migrations'), { recursive: true })
process.stdout.write(`built ${pkg.name} -> dist/\n`)
