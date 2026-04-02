/**
 * Universal File Processor
 * Extracts text and images from PDF, DOCX, and PPTX files
 * NOTE: This module should only be used client-side
 */

// Dynamic imports to avoid SSR issues
let pdfjsLib: any = null
let mammoth: any = null
let JSZip: any = null

async function ensureImports() {
  if (typeof window === "undefined") {
    throw new Error("File processor can only be used in browser environment")
  }
  
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist")
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
  }
  if (!mammoth) {
    mammoth = await import("mammoth")
  }
  if (!JSZip) {
    JSZip = await import("jszip")
  }
}

export interface ProcessedImage {
  index: number
  base64: string
}

export interface ProcessedFileResult {
  text: string
  images: ProcessedImage[]
}

/**
 * Process a file and extract text and images
 */
export async function processFile(file: File): Promise<ProcessedFileResult> {
  const fileType = file.name.toLowerCase()
  
  if (fileType.endsWith(".pdf")) {
    return await processPDF(file)
  } else if (fileType.endsWith(".docx")) {
    return await processDOCX(file)
  } else if (fileType.endsWith(".pptx")) {
    return await processPPTX(file)
  } else {
    throw new Error(`Unsupported file type: ${file.name}`)
  }
}

/**
 * Process PDF file
 */
async function processPDF(file: File): Promise<ProcessedFileResult> {
  await ensureImports()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  
  let text = ""
  const images: ProcessedImage[] = []
  
  // Process first 20 pages
  const maxPages = Math.min(20, pdf.numPages)
  let imageIndex = 0
  
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i)
    
    // Extract text content
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(" ")
    text += pageText + "\n\n"
    
    // Render page to canvas and convert to base64
    // Use lower scale and quality to reduce payload size
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    
    if (!context) {
      continue
    }
    
    canvas.height = viewport.height
    canvas.width = viewport.width
    
    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    }).promise
    
    // Convert canvas to base64 JPEG with lower quality to reduce size
    const imageData = canvas.toDataURL("image/jpeg", 0.6)
    images.push({ index: imageIndex++, base64: imageData })
  }
  
  return { text: text.trim(), images }
}

/**
 * Process DOCX file
 */
async function processDOCX(file: File): Promise<ProcessedFileResult> {
  await ensureImports()
  const arrayBuffer = await file.arrayBuffer()
  
  // Extract text using mammoth
  const { value: text } = await mammoth.extractRawText({ arrayBuffer })
  
  // Extract images using JSZip
  const images: ProcessedImage[] = []
  const zip = await JSZip.loadAsync(arrayBuffer)
  
  // Look for images in word/media/
  const mediaFolder = zip.folder("word/media")
  if (mediaFolder) {
    const imageFiles = Object.keys(mediaFolder.files).filter(
      (filename) => {
        const file = mediaFolder.files[filename]
        return !file.dir && /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filename)
      }
    )
    
    let imageIndex = 0
    for (const imagePath of imageFiles) {
      const imageFile = mediaFolder.files[imagePath]
      if (imageFile) {
        const blob = await imageFile.async("blob")
        const base64 = await blobToBase64(blob)
        images.push({ index: imageIndex++, base64 })
      }
    }
  }
  
  return { text: text.trim(), images }
}

/**
 * Process PPTX file
 */
async function processPPTX(file: File): Promise<ProcessedFileResult> {
  await ensureImports()
  const arrayBuffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)
  
  let text = ""
  const images: ProcessedImage[] = []
  
  // Extract text from slides
  const slidesFolder = zip.folder("ppt/slides")
  if (slidesFolder) {
    const slideFiles = Object.keys(slidesFolder.files).filter(
      (filename) => {
        const file = slidesFolder.files[filename]
        return !file.dir && filename.endsWith(".xml")
      }
    )
    
    for (const slidePath of slideFiles) {
      const slideFile = slidesFolder.files[slidePath]
      if (slideFile) {
        const xmlContent = await slideFile.async("text")
        // Extract text from <a:t> tags
        const parser = new DOMParser()
        const xmlDoc = parser.parseFromString(xmlContent, "text/xml")
        const textNodes = xmlDoc.getElementsByTagName("a:t")
        
        for (let i = 0; i < textNodes.length; i++) {
          const textNode = textNodes[i]
          if (textNode.textContent) {
            text += textNode.textContent + " "
          }
        }
        text += "\n\n"
      }
    }
  }
  
  // Extract images from ppt/media/
  const mediaFolder = zip.folder("ppt/media")
  if (mediaFolder) {
    const imageFiles = Object.keys(mediaFolder.files).filter(
      (filename) => {
        const file = mediaFolder.files[filename]
        return !file.dir && /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filename)
      }
    )
    
    let imageIndex = 0
    for (const imagePath of imageFiles) {
      const imageFile = mediaFolder.files[imagePath]
      if (imageFile) {
        const blob = await imageFile.async("blob")
        const base64 = await blobToBase64(blob)
        images.push({ index: imageIndex++, base64 })
      }
    }
  }
  
  return { text: text.trim(), images }
}

/**
 * Convert blob to base64 data URI
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
      } else {
        reject(new Error("Failed to convert blob to base64"))
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
