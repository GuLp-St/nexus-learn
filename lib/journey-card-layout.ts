import type { JourneyViewType } from "./journey-settings-utils"

/** Uniform outer height for course + folder cards per view type */
export function journeyCardShellClass(viewType: JourneyViewType): string {
  switch (viewType) {
    case "list":
      return "h-14"
    case "icon-sm":
      return "h-[160px]"
    case "icon-md":
      return "h-[210px]"
    case "icon-lg":
    default:
      return "h-[260px]"
  }
}

export function journeyGridClass(viewType: JourneyViewType): string {
  switch (viewType) {
    case "list":
      return "flex flex-col gap-2"
    case "icon-sm":
      return "grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
    case "icon-md":
      return "grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
    case "icon-lg":
    default:
      return "grid gap-4 sm:grid-cols-2"
  }
}

/** Shared action button on course cards — fixed height for Publish / Push updates parity */
export const JOURNEY_CARD_ACTION_BTN =
  "w-full h-7 min-h-7 max-h-7 text-[10px] leading-none px-2 py-0 border-primary/30 text-primary hover:bg-primary/5 box-border"
