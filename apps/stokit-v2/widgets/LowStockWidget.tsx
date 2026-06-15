import { Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';
import type { LowStockWidgetData } from '../core/services/widgetData';

// createWidget() calls requireNativeModule('ExpoWidgets') at evaluation time.
// If the native binary doesn't include the widget extension (e.g. OTA-only builds),
// it throws. We catch it here so the whole app doesn't crash on startup.
let LowStockWidget: ReturnType<typeof createWidget<LowStockWidgetData>> | null = null;
try {
  LowStockWidget = createWidget<LowStockWidgetData>(
    'LowStockWidget',
    (props, { widgetFamily }) => {
      'widget';

      if (widgetFamily === 'accessoryInline') {
        return <Text>{props.count === 0 ? 'Stokit: all stocked' : `Stokit: ${props.count} running low`}</Text>;
      }

      if (widgetFamily === 'accessoryRectangular') {
        return (
          <VStack alignment="leading" spacing={2} modifiers={[widgetURL('pantrypal://shopping')]}>
            <Text modifiers={[font({ weight: 'bold' })]}>
              {props.count === 0 ? 'All stocked' : `${props.count} running low`}
            </Text>
            <Text modifiers={[lineLimit(1)]}>{props.itemSummary || 'Nothing to buy right now'}</Text>
          </VStack>
        );
      }

      return (
        <VStack
          alignment="leading"
          spacing={6}
          modifiers={[
            padding({ all: 4 }),
            containerBackground('#15110C', 'widget'),
            widgetURL('pantrypal://shopping'),
          ]}>
          <Text modifiers={[font({ size: 14, weight: 'bold', design: 'rounded' }), foregroundStyle('#D4874E')]}>
            STOKIT
          </Text>
          <Text modifiers={[font({ size: 34, weight: 'bold', design: 'rounded' }), foregroundStyle('#FFFFFF')]}>
            {props.count.toString()}
          </Text>
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle('#FFFFFF')]}>
            {props.count === 1 ? 'item running low' : 'items running low'}
          </Text>
          <Text modifiers={[font({ size: 11 }), foregroundStyle('#D8C7B5'), lineLimit(widgetFamily === 'systemMedium' ? 2 : 1)]}>
            {props.itemSummary || 'Everything is stocked'}
          </Text>
        </VStack>
      );
    }
  );
} catch {
  // Native widget extension not present — widget silently disabled
}

export default LowStockWidget;
