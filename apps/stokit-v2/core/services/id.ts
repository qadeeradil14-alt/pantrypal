/** Lightweight unique id generator (no native crypto dependency). */
let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export const now = () => Date.now();
