/**
 * Appends an alpha channel to a 6-digit hex color (e.g. "#FFCC33" + "26" ->
 * "#FFCC3326", ~15% opacity) for a tinted event background. Returns
 * undefined for anything that isn't a clean 6-digit hex so callers can fall
 * back to a neutral default instead of rendering garbage.
 */
export function hexWithAlpha(hex: string | undefined, alphaHex: string): string | undefined {
  if (!hex) return undefined;
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return undefined;
  return `#${m[1]}${alphaHex}`;
}

/** Badge/border color classes for UnoERP's txt_priorita ("---"/Bassa/Media/Alta/Altissima). */
export function unoErpPriorityClassName(priority: string | undefined): string {
  switch (priority) {
    case "Bassa":
      return "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100";
    case "Media":
      return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100";
    case "Alta":
      return "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-100";
    case "Altissima":
      return "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100";
    default:
      return "border-gray-300 bg-gray-50 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";
  }
}
