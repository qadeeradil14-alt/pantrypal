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

export function groceryItemTestId(name: string): string {
  return `grocery-item-${slugTestIdSegment(name)}`;
}
