/**
 * Developer Diagnostics — inline-panel visibility.
 *
 * Surfaces that embed a diagnostics panel directly in a production screen
 * (e.g. AddItemSheet) need two independent conditions before rendering
 * anything: the viewer must be AUTHORIZED (see access.ts), and the viewer
 * must have DELIBERATELY opened the panel this session — authorization alone
 * must never make a panel appear unprompted for an authorized user.
 */
export function shouldRenderInlineDiagnostics(
  authorized: boolean,
  deliberatelyOpened: boolean,
): boolean {
  return authorized && deliberatelyOpened;
}
