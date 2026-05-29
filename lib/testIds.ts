/** Stable Maestro / Detox-style ids derived from display names. */
export function slugTestIdSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  );
}

export function pantryItemTestId(name: string): string {
  return `pantry-item-${slugTestIdSegment(name)}`;
}

export function pantryItemDragHandleTestId(name: string): string {
  return `pantry-item-drag-${slugTestIdSegment(name)}`;
}

export function pantryItemStoreMetaTestId(name: string): string {
  return `pantry-item-store-${slugTestIdSegment(name)}`;
}

export function pantryStoreTargetTestId(name: string): string {
  return `pantry-store-target-${slugTestIdSegment(name)}`;
}

export function groceryItemTestId(name: string): string {
  return `grocery-item-${slugTestIdSegment(name)}`;
}
