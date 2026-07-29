export function shoppingItineraryPreview(
  itemNames: string[],
  limit = 3,
): {
  visibleNames: string[];
  moreCount: number;
  label: string;
} {
  const visibleNames = itemNames.slice(0, Math.max(0, limit));
  const moreCount = Math.max(0, itemNames.length - visibleNames.length);
  const label = [
    visibleNames.join(' • '),
    moreCount > 0 ? `+${moreCount} more` : '',
  ].filter(Boolean).join(' • ');
  return { visibleNames, moreCount, label };
}
