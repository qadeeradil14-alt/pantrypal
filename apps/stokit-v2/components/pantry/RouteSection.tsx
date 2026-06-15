/**
 * "Your store route" card content — store logo chips, item counts,
 * multi-coloured progress bars. Mirrors the reference image exactly.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { ROUTE_COLORS } from '../../core/services/storeBrands';
import { StoreChip } from '../shared/ui';
import type { Store } from '../../types';
import { useTheme } from '../../hooks/useTheme';

interface RouteStop {
  store: Store;
  count: number;
}

export function RouteSection({ stops }: { stops: RouteStop[] }) {
  const { colors } = useTheme();
  if (stops.length === 0) return null;

  const totalItems = stops.reduce((n, s) => n + s.count, 0);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View>
      {/* Top meta row */}
      <View style={styles.metaRow}>
        <View style={styles.routeGraphic}>
          <Ionicons name="location" size={18} color={colors.primary} />
          <View style={styles.routeLine} />
          <View style={styles.routeDot} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.metaStops}>
            {stops.length} stop{stops.length > 1 ? 's' : ''}
          </Text>
          <Text style={styles.metaItems}>{totalItems} items</Text>
        </View>
      </View>

      {/* Store chips row */}
      <View style={styles.stopsRow}>
        {stops.map(({ store, count }, i) => {
          const barColor = ROUTE_COLORS[i % ROUTE_COLORS.length];
          return (
            <React.Fragment key={store.id}>
              <View style={styles.stopCol}>
                <StoreChip store={store} size={52} />
                <Text style={styles.storeName} numberOfLines={1}>
                  {store.name}
                </Text>
                <Text style={[styles.itemCount, { color: barColor }]}>
                  {count} {count === 1 ? 'item' : 'items'}
                </Text>
              </View>

              {/* Arrow connector */}
              {i < stops.length - 1 && (
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.muted}
                  style={styles.arrow}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {/* Progress bars */}
      <View style={styles.barsRow}>
        {stops.map(({ store, count }, i) => {
          const barColor = ROUTE_COLORS[i % ROUTE_COLORS.length];
          const flex = totalItems > 0 ? count / totalItems : 1 / stops.length;
          return (
            <View
              key={store.id}
              style={[styles.bar, { flex, backgroundColor: barColor }]}
            />
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.xl,
    },
    routeGraphic: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 0,
    },
    routeLine: {
      width: 18,
      height: 2,
      backgroundColor: colors.border,
      marginHorizontal: 2,
    },
    routeDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.muted,
      borderWidth: 2,
      borderColor: colors.border,
    },
    metaStops: {
      fontFamily: fonts.sansSemibold,
      fontSize: 14,
      color: colors.ink,
    },
    metaItems: {
      fontFamily: fonts.mono,
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
    },
    stopsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 0,
      marginBottom: spacing.xl,
    },
    stopCol: {
      flex: 1,
      alignItems: 'center',
      gap: spacing.sm,
    },
    logoChip: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3,
    },
    logoAbbr: {
      fontFamily: fonts.sansSemibold,
      fontSize: 15,
      color: '#FFFFFF',
      letterSpacing: 0.5,
    },
    storeName: {
      fontFamily: fonts.sansMedium,
      fontSize: 12,
      color: colors.inkSoft,
      textAlign: 'center',
      maxWidth: 72,
    },
    itemCount: {
      fontFamily: fonts.mono,
      fontSize: 11,
      textAlign: 'center',
    },
    arrow: {
      marginTop: -spacing.xl,
      paddingHorizontal: 2,
    },
    barsRow: {
      flexDirection: 'row',
      gap: 3,
      borderRadius: radii.pill,
      overflow: 'hidden',
      height: 5,
    },
    bar: {
      height: 5,
      borderRadius: radii.pill,
    },
  });
}
