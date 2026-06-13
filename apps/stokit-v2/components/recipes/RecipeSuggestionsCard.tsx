import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { fonts, spacing, radii, shadow } from '../../theme';
import type { AppColors } from '../../theme';
import type { RecipeSuggestion } from '../../core/services/recipes';

export function RecipeSuggestionsCard({ recipes, onPress }: { recipes: RecipeSuggestion[]; onPress?: (recipe: RecipeSuggestion) => void }) {
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  if (!recipes || recipes.length === 0) return null;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Ionicons name="restaurant-outline" size={20} color={colors.primary} />
        <Text style={s.title}>Make it tonight</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        {recipes.map(recipe => (
          <Pressable key={recipe.id} onPress={() => onPress?.(recipe)} style={({ pressed }) => [s.card, pressed && s.cardPressed]}>
            <Image source={{ uri: recipe.imageUrl }} style={s.image} resizeMode="cover" />
            <View style={s.content}>
              <Text style={s.recipeTitle} numberOfLines={1}>{recipe.title}</Text>
              <Text style={s.recipeDescription} numberOfLines={2}>{recipe.description}</Text>
              
              <View style={s.tags}>
                {recipe.matchScore >= 0.8 && (
                  <View style={[s.tag, s.tagMatch]}>
                    <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                    <Text style={[s.tagText, s.tagTextMatch]}>Have ingredients</Text>
                  </View>
                )}
                {recipe.missingIngredients.length > 0 && recipe.matchScore < 0.8 && (
                  <View style={[s.tag, s.tagMissing]}>
                    <Text style={[s.tagText, s.tagTextMissing]}>Missing {recipe.missingIngredients.length} item{recipe.missingIngredients.length === 1 ? '' : 's'}</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function makeStyles(c: AppColors, isDark: boolean) {
  return StyleSheet.create({
    container: {
      marginVertical: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    title: {
      fontFamily: fonts.sansSemibold,
      fontSize: 18,
      color: c.ink,
    },
    scrollContent: {
      gap: spacing.md,
      paddingRight: spacing.md,
    },
    card: {
      width: 240,
      backgroundColor: c.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
      ...shadow.card,
    },
    cardPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.98 }],
    },
    image: {
      width: '100%',
      height: 120,
      backgroundColor: c.surfaceRaised,
    },
    content: {
      padding: spacing.md,
    },
    recipeTitle: {
      fontFamily: fonts.sansSemibold,
      fontSize: 16,
      color: c.ink,
      marginBottom: 4,
    },
    recipeDescription: {
      fontFamily: fonts.sans,
      fontSize: 13,
      lineHeight: 18,
      color: c.muted,
      marginBottom: spacing.md,
      minHeight: 36,
    },
    tags: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    tag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radii.sm,
      borderWidth: 1,
    },
    tagMatch: {
      backgroundColor: c.successSoft,
      borderColor: c.successSoft,
    },
    tagMissing: {
      backgroundColor: c.warningSoft,
      borderColor: c.warning,
    },
    tagText: {
      fontFamily: fonts.sansMedium,
      fontSize: 11,
    },
    tagTextMatch: {
      color: isDark ? c.surface : c.success,
    },
    tagTextMissing: {
      color: c.warning,
    },
  });
}
