/** Reset cosmetic theme CSS injected on document (store themes, RGB chroma). */
export function resetCosmeticTheme(): void {
  if (typeof document === "undefined") return

  const root = document.documentElement
  const body = document.body

  body.classList.remove("theme-rgb-chroma")
  root.style.removeProperty("--primary")
  root.style.removeProperty("--primary-foreground")
}
