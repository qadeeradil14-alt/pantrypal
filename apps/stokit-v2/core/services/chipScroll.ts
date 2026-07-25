/** Leading/trailing peek kept around a chip scrolled into view. */
export const CHIP_SCROLL_INSET = 16;

/**
 * Horizontal offset that brings `chip` into view within a horizontally
 * scrolling chip row, or null when it is already fully visible (so tapping an
 * on-screen chip never jolts the row).
 *
 * A chip row scrolls, so a selection made anywhere other than by tapping a
 * visible chip — notably the Add Items sheet's bulk store selector writing
 * every selected item's store at once — can land off-screen. The row then
 * shows only unselected chips and reads as "the value didn't change", even
 * though it did.
 */
export function chipScrollOffset(
  chip: { x: number; width: number },
  viewportWidth: number,
  scrollX: number,
  inset: number = CHIP_SCROLL_INSET,
): number | null {
  if (viewportWidth <= 0) return null;
  if (chip.x < scrollX) return Math.max(0, chip.x - inset);
  if (chip.x + chip.width > scrollX + viewportWidth) {
    return Math.max(0, chip.x + chip.width - viewportWidth + inset);
  }
  return null;
}
