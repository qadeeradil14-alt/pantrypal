import React, { useMemo } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../shared/Sheet';
import { Button } from '../shared/ui';
import { fonts, spacing, radii, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { RecipeSuggestion } from '../../core/services/recipes';

interface Props {
  recipe: RecipeSuggestion | null;
  onClose: () => void;
  onAddMissing: (ingredients: string[]) => void;
}

export function RecipeDetailSheet({ recipe, onClose, onAddMissing }: Props) {
  return (
    <Sheet visible={!!recipe} title={recipe?.title ?? ''} onClose={onClose}>
      {recipe ? <RecipeDetailContent recipe={recipe} onClose={onClose} onAddMissing={onAddMissing} /> : null}
    </Sheet>
  );
}

function RecipeDetailContent({ recipe, onClose, onAddMissing }: { recipe: RecipeSuggestion; onClose: () => void; onAddMissing: (ingredients: string[]) => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const steps = useMemo(() => {
    if (!recipe.instructions) return [];
    return recipe.instructions
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }, [recipe.instructions]);

  const missing = recipe.missingIngredients;

  return (
    <View style={{ paddingBottom: spacing.xl * 2 }}>
      {recipe.imageUrl ? (
        <Image source={{ uri: recipe.imageUrl }} style={s.image} resizeMode="cover" />
      ) : null}

      <Text style={s.meta}>{recipe.description}</Text>

      {/* Ingredient list */}
      <Text style={s.sectionTitle}>Ingredients</Text>
      <View style={s.ingredientBox}>
        {(recipe.ingredientLines ?? []).map((line, i) => (
          <View key={i} style={[s.ingredientRow, i > 0 && s.ingredientBorder]}>
            <Ionicons
              name={line.have ? 'checkmark-circle' : 'ellipse-outline'}
              size={16}
              color={line.have ? colors.success : colors.muted}
            />
            <Text style={[s.ingredientName, !line.have && s.ingredientMissing]}>
              {line.name}
            </Text>
            {line.measure ? (
              <Text style={s.ingredientMeasure}>{line.measure}</Text>
            ) : null}
          </View>
        ))}
      </View>

      {missing.length > 0 && (
        <Button
          label={`Add ${missing.length} missing item${missing.length !== 1 ? 's' : ''} to shopping list`}
          onPress={() => { onAddMissing(missing); onClose(); }}
          style={{ marginTop: spacing.md }}
        />
      )}

      {/* Steps */}
      {steps.length > 0 && (
        <>
          <Text style={s.sectionTitle}>How to make it</Text>
          {steps.map((step, i) => (
            <View key={i} style={s.stepRow}>
              <View style={s.stepNum}>
                <Text style={s.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={s.stepText}>{step}</Text>
            </View>
          ))}
        </>
      )}

      {recipe.youtubeUrl ? (
        <Pressable
          onPress={() => void Linking.openURL(recipe.youtubeUrl!)}
          style={({ pressed }) => [s.youtubeBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="logo-youtube" size={18} color="#FF0000" />
          <Text style={s.youtubeBtnText}>Watch on YouTube</Text>
        </Pressable>
      ) : (
        <Text style={s.noVideoText}>No video available for this recipe.</Text>
      )}
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    image: { width: '100%', height: 200, borderRadius: radii.md, marginBottom: spacing.md },
    meta: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginBottom: spacing.lg },
    sectionTitle: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink, marginTop: spacing.lg, marginBottom: spacing.sm },
    ingredientBox: { backgroundColor: colors.surfaceRaised, borderRadius: radii.md, overflow: 'hidden' },
    ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, paddingHorizontal: spacing.md },
    ingredientBorder: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
    ingredientName: { flex: 1, fontFamily: fonts.sans, fontSize: 14, color: colors.ink },
    ingredientMissing: { color: colors.muted },
    ingredientMeasure: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
    stepRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md, alignItems: 'flex-start' },
    stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
    stepNumText: { fontFamily: fonts.sansSemibold, fontSize: 12, color: colors.primary },
    stepText: { flex: 1, fontFamily: fonts.sans, fontSize: 14, color: colors.ink, lineHeight: 20 },
    youtubeBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, paddingVertical: spacing.sm },
    youtubeBtnText: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.ink },
    noVideoText: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginTop: spacing.lg },
  });
}
