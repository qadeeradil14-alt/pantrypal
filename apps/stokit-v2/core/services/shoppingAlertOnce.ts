type ShoppingAlertResult = { ok: boolean; sent: number; result: string };

const DUPLICATE_WINDOW_MS = 10_000;
const recentAlerts = new Map<string, { startedAt: number; request: Promise<ShoppingAlertResult> }>();

export function sendShoppingAlertOnce(
  tripId: string,
  send: () => Promise<ShoppingAlertResult>,
  now = Date.now(),
): Promise<ShoppingAlertResult> {
  const existing = recentAlerts.get(tripId);
  if (existing && now - existing.startedAt < DUPLICATE_WINDOW_MS) {
    return existing.request;
  }

  const request = Promise.resolve()
    .then(send)
    .then((result) => {
      if (!result.ok && recentAlerts.get(tripId)?.request === request) {
        recentAlerts.delete(tripId);
      }
      return result;
    })
    .catch((error) => {
      if (recentAlerts.get(tripId)?.request === request) {
        recentAlerts.delete(tripId);
      }
      throw error;
    });

  recentAlerts.set(tripId, { startedAt: now, request });
  return request;
}

export function resetShoppingAlertGuard(): void {
  recentAlerts.clear();
}
