/**
 * Increment this OTA number before every OTA publish.
 * Bump this once per OTA push — the only place the sequence number lives.
 */
export const OTA_SEQ = 453;

/**
 * Recovery/preview-only publish counter — NEVER production OTA numbering.
 *
 * Scheme: R<recovery-baseline>.<publish count>, e.g. R453.1, R453.2, R453.3.
 * The recovery/golden-ota453 track forked production at OTA 453 and does not
 * advance OTA_SEQ (scripts/preflight-ota.sh requires it to stay exactly
 * latest-production-OTA + 1, so bumping it here would break every future
 * production publish). Every preview publish on this track instead bumps
 * THIS counter by hand before publishing.
 *
 * Deliberately shaped so it can never be mistaken for a production OTA
 * number ("R453.2" vs "OTA 475") even when read out of context (a
 * screenshot, a support message, a log line).
 *
 * scripts/preflight-preview-ota.sh reads the highest R453.N already live on
 * the "preview" EAS channel and aborts unless this is exactly one higher —
 * see that script for the guard.
 */
export const RECOVERY_PREVIEW_SEQ = 'R453.4';

/**
 * Last known production OTA sequence — for DISPLAY ONLY, never gating.
 *
 * Not queried live from the app (that would mean a network call just to
 * render a settings row). Update by hand from
 * `npx eas-cli update:list --branch production --limit 1` whenever it's
 * checked — scripts/preflight-ota.sh already re-derives the true live value
 * from EAS immediately before every production publish, so staleness here
 * can never affect what actually ships.
 */
export const LAST_KNOWN_PRODUCTION_OTA = 475;
