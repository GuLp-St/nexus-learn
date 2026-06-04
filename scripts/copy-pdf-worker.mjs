import { copyFileSync, existsSync, mkdirSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const src = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs")
const destDir = join(root, "public")
const dest = join(destDir, "pdf.worker.min.mjs")

if (!existsSync(src)) {
  console.warn("[copy-pdf-worker] pdfjs-dist worker not found, skipping")
  process.exit(0)
}

if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
copyFileSync(src, dest)
console.log("[copy-pdf-worker] copied to public/pdf.worker.min.mjs")
