export function changedFields<T extends object>(
  current: T,
  patch: Partial<T>,
): Partial<T> {
  const changed: Partial<T> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (!Object.is(current[key], patch[key])) changed[key] = patch[key];
  }
  return changed;
}

export function hasChangedFields<T extends object>(
  current: T,
  patch: Partial<T>,
): boolean {
  return (Object.keys(patch) as (keyof T)[]).some(
    (key) => !Object.is(current[key], patch[key]),
  );
}
