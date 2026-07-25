/**
 * Developer Diagnostics — reusable presentational panel.
 *
 * Renders collected sections as collapsible, read-only, selectable rows.
 * Purely presentational: it holds only collapse state, performs no I/O, and
 * exposes no action that could mutate anything.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { DiagnosticSection } from '../../core/services/diagnostics/types';

/**
 * Cap on rows rendered per section. A large household can put hundreds of
 * pantry items in the Shopping section; rendering all of them as sibling
 * Text nodes is real jank. The cap only limits what's drawn on screen — the
 * exported report (built separately, on demand) still includes every row.
 */
const MAX_VISIBLE_ROWS_PER_SECTION = 40;

export function DiagnosticsPanel({
  sections,
  initiallyExpanded,
  compact = false,
}: {
  sections: DiagnosticSection[];
  /** Section ids expanded on first render. Defaults to all. */
  initiallyExpanded?: string[];
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (!initiallyExpanded) return {};
    const next: Record<string, boolean> = {};
    for (const section of sections) {
      if (!initiallyExpanded.includes(section.id)) next[section.id] = true;
    }
    return next;
  });

  return (
    <View style={compact ? styles.compactWrap : undefined}>
      {sections.map((section) => {
        const isCollapsed = collapsed[section.id] === true;
        return (
          <View key={section.id} style={styles.section}>
            <Pressable
              onPress={() => setCollapsed((prev) => ({ ...prev, [section.id]: !isCollapsed }))}
              style={styles.sectionHeader}
              accessibilityRole="button"
              accessibilityLabel={`${section.title} diagnostics section`}
            >
              <Ionicons
                name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
                size={14}
                color={colors.muted}
              />
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.subtitle ? (
                <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
              ) : null}
            </Pressable>

            {isCollapsed ? null : (
              <View style={styles.sectionBody}>
                {section.rows.slice(0, MAX_VISIBLE_ROWS_PER_SECTION).map((row, index) => (
                  // Index-keyed: duplicate ids must never collapse into one row.
                  <View key={`${section.id}-${index}`} style={styles.row}>
                    <Text style={styles.rowLabel} selectable>
                      {row.label}
                    </Text>
                    {row.value ? (
                      <Text style={styles.rowValue} selectable>
                        {row.value}
                      </Text>
                    ) : null}
                    {row.flags?.length ? (
                      <View style={styles.flagRow}>
                        {row.flags.map((flag, flagIndex) => (
                          <Text key={`${flag}-${flagIndex}`} style={styles.flag}>
                            {flag}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))}
                {section.rows.length > MAX_VISIBLE_ROWS_PER_SECTION ? (
                  <Text style={styles.omittedNotice}>
                    {section.rows.length - MAX_VISIBLE_ROWS_PER_SECTION} additional row(s) omitted — full detail is in the exported report
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    compactWrap: {
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceRaised,
      padding: spacing.sm,
    },
    section: { marginBottom: spacing.sm },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    sectionTitle: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.ink },
    sectionSubtitle: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, flexShrink: 1 },
    sectionBody: { gap: 6, paddingLeft: spacing.md },
    row: {
      borderLeftWidth: 2,
      borderLeftColor: colors.borderSoft,
      paddingLeft: spacing.sm,
      paddingVertical: 2,
    },
    rowLabel: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.ink },
    rowValue: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 14, color: colors.muted },
    omittedNotice: {
      fontFamily: fonts.mono,
      fontSize: 10,
      fontStyle: 'italic',
      color: colors.muted,
      marginTop: 4,
    },
    flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
    flag: {
      fontFamily: fonts.mono,
      fontSize: 9,
      color: colors.danger,
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: 3,
      paddingHorizontal: 4,
      paddingVertical: 1,
      overflow: 'hidden',
    },
  });
}
