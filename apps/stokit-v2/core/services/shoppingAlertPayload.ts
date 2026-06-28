/** Pure, zero-dependency payload builder for household shopping alerts. */

export interface ShoppingAlertMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: { type: 'partner_arrival'; storeName: string; storeId?: string };
}

export function buildShoppingPayload(
  senderName: string,
  storeName: string,
  pushToken: string,
  storeId?: string,
): ShoppingAlertMessage {
  return {
    to: pushToken,
    sound: 'default',
    title: `${senderName} is shopping at ${storeName} 🛒`,
    body: "Add anything you need now — they're picking items live.",
    data: { type: 'partner_arrival', storeName, ...(storeId ? { storeId } : {}) },
  };
}
