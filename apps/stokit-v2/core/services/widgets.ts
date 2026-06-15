import { Platform, NativeModules } from 'react-native';
import type { PantryItem } from '../../types';
import { buildLowStockWidgetData } from './widgetData';

/**
 * Update iOS home screen widgets.
 *
 * expo-widgets requires a native binary extension compiled into the app binary.
 * Pure OTA builds do not have this extension — the NativeModule won't exist.
 * We check for its presence before calling anything, so missing widgets
 * never crash the app.
 */
export async function refreshWidgets(items: PantryItem[]): Promise<void> {
  if (Platform.OS !== 'ios') return;

  // If the widget native module isn't registered, bail out silently.
  // This happens in OTA-only environments where the native binary
  // predates the widget extension.
  if (!NativeModules.ExpoWidgets) return;

  try {
    const data = buildLowStockWidgetData(items);
    // These require() calls are gated by the NativeModules check above,
    // so they only run when the native module is actually present.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ls = require('../../widgets/LowStockWidget').default;
    if (ls) ls.updateSnapshot(data);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const qs = require('../../widgets/QuickScanWidget').default;
    if (qs) qs.updateSnapshot({});
  } catch (error) {
    if (__DEV__) console.warn('[widgets] refresh failed', error);
  }
}
