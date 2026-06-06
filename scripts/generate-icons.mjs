/**
 * Generates crisp PNG home-screen / PWA icons from public/icon.svg.
 * The SVG embeds a raster image — exporting fixed sizes avoids blurry upscaling.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const publicDir = join(root, "public")
const appDir = join(root, "app")

function extractPngBuffer(svgPath) {
  const svg = readFileSync(svgPath, "utf8")
  const match = svg.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)
  if (!match) {
    throw new Error("Could not find embedded PNG in icon.svg")
  }
  return Buffer.from(match[1], "base64")
}

const SIZES = [
  { name: "icon-16x16.png", size: 16 },
  { name: "icon-32x32.png", size: 32 },
  { name: "icon-64x64.png", size: 64 },
  { name: "icon-128x128.png", size: 128 },
  { name: "icon-152x152.png", size: 152 },
  { name: "icon-167x167.png", size: 167 },
  { name: "icon-180x180.png", size: 180 },
  { name: "icon-192x192.png", size: 192 },
  { name: "icon-512x512.png", size: 512 },
]

async function main() {
  const source = extractPngBuffer(join(publicDir, "icon.svg"))
  const meta = await sharp(source).metadata()
  console.log(`Source embedded PNG: ${meta.width}x${meta.height}`)

  for (const { name, size } of SIZES) {
    const out = join(publicDir, name)
    await sharp(source)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: sharp.kernel.lanczos3,
      })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(out)
    console.log(`Wrote ${name}`)
  }

  // iOS "Add to Home Screen" — opaque apple-touch-icon (no transparency artifacts)
  const appleIcon = await sharp(source)
    .resize(180, 180, { fit: "contain", background: "#0f172a", kernel: sharp.kernel.lanczos3 })
    .flatten({ background: "#0f172a" })
    .png()
    .toBuffer()

  writeFileSync(join(publicDir, "apple-icon.png"), appleIcon)
  writeFileSync(join(appDir, "apple-icon.png"), appleIcon)
  console.log("Wrote apple-icon.png (180x180)")

  // Next.js file-based favicon/app icon
  const appIcon = await sharp(source)
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer()

  writeFileSync(join(appDir, "icon.png"), appIcon)
  console.log("Wrote app/icon.png (512x512)")

  // Android maskable icon — logo in center 80% safe zone
  const maskableSize = 512
  const logoSize = Math.round(maskableSize * 0.72)
  const logo = await sharp(source)
    .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer()

  await sharp({
    create: {
      width: maskableSize,
      height: maskableSize,
      channels: 4,
      background: "#0f172a",
    },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(join(publicDir, "icon-maskable-512x512.png"))

  console.log("Wrote icon-maskable-512x512.png")
  console.log("Done.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
