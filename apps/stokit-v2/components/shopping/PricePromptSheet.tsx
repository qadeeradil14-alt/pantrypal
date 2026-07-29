import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Sheet } from '../shared/Sheet';
import { Button } from '../shared/ui';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { ShoppingEntry, Store } from '../../types';

export function PricePromptSheet({
  entry,
  store,
  lastPrice,
  onClose,
  onSave,
}: {
  entry: ShoppingEntry | null;
  store?: Store;
  lastPrice?: number;
  onClose: () => void;
  onSave: (price: number) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [value, setValue] = useState('');
  const price = Math.round((parseFloat(value.replace(/[^0-9.]/g, '')) || 0) * 100) / 100;

  useEffect(() => setValue(''), [entry?.entryId]);

  return (
    <Sheet visible={!!entry} title="Remember this price?" onClose={onClose}>
      <Text style={styles.item}>{entry?.name}</Text>
      <Text style={styles.store}>
        {store?.name ?? 'This store'}
        {lastPrice ? ` · last paid $${lastPrice.toFixed(2)}` : ''}
      </Text>
      <View style={styles.inputRow}>
        <Text style={styles.currency}>$</Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.faintText}
          autoFocus
          style={styles.input}
        />
      </View>
      <Text style={styles.hint}>Optional. Stokit uses this to compare what your household paid across stores.</Text>
      <Button label="Save price" disabled={price <= 0} onPress={() => onSave(price)} />
      <Button label="Not now" variant="ghost" onPress={onClose} style={{ marginTop: spacing.sm }} />
    </Sheet>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    item: { fontFamily: fonts.sansSemibold, fontSize: 20, color: colors.ink },
    store: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginTop: 4 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      backgroundColor: colors.surfaceRaised,
      paddingHorizontal: spacing.lg,
      marginVertical: spacing.xl,
    },
    currency: { fontFamily: fonts.mono, fontSize: 28, color: colors.primary },
    input: { flex: 1, fontFamily: fonts.mono, fontSize: 36, color: colors.ink, paddingVertical: spacing.lg },
    hint: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, color: colors.muted, marginBottom: spacing.lg },
  });
}
