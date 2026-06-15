import { Image, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

let QuickScanWidget: ReturnType<typeof createWidget> | null = null;
try {
  QuickScanWidget = createWidget('QuickScanWidget', () => {
    'widget';

    return (
      <VStack
        spacing={10}
        modifiers={[
          padding({ all: 4 }),
          containerBackground('#D4874E', 'widget'),
          widgetURL('pantrypal://shopping?action=scan'),
        ]}>
        <Image systemName="camera.viewfinder" size={40} color="#FFFFFF" />
        <Text modifiers={[font({ size: 14, weight: 'bold', design: 'rounded' }), foregroundStyle('#FFFFFF')]}>
          Quick Scan
        </Text>
      </VStack>
    );
  });
} catch {
  // Native widget extension not present — widget silently disabled
}

export default QuickScanWidget;
