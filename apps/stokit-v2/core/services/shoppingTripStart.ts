type ShoppingTripStartOptions = {
  tripId: string;
  startTrip: () => void;
  notifyHousehold?: () => Promise<unknown>;
};

const startedTripIds = new Set<string>();

export function startShoppingTripOnce({
  tripId,
  startTrip,
  notifyHousehold,
}: ShoppingTripStartOptions): boolean {
  if (startedTripIds.has(tripId)) return false;
  startedTripIds.add(tripId);

  try {
    startTrip();
  } catch (error) {
    startedTripIds.delete(tripId);
    throw error;
  }

  if (notifyHousehold) {
    void Promise.resolve()
      .then(notifyHousehold)
      .catch(() => {});
  }

  return true;
}

export function resetShoppingTripStartGuard(tripId: string): void {
  startedTripIds.delete(tripId);
}
