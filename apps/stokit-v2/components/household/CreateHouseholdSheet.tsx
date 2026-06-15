import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../shared/Sheet';
import { TextField } from '../shared/Field';
import { Button } from '../shared/ui';
import { fonts, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useHouseholdStore } from '../../store/household-store';

export function CreateHouseholdSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const createHousehold = useHouseholdStore((s) => s.createHousehold);
  const [householdName, setHouseholdName] = useState('');
  const [myName, setMyName] = useState('');
  const [creating, setCreating] = useState(false);

  const submit = async () => {
    if (!householdName.trim()) return;
    setCreating(true);
    const result = await createHousehold(householdName, myName);
    setCreating(false);
    if (!result.ok) {
      Alert.alert('Could not create household', result.message);
      return;
    }
    setHouseholdName('');
    setMyName('');
    onClose();
  };

  return (
    <Sheet visible={visible} title="Create household" onClose={onClose}>
      <View style={styles.iconWrap}>
        <Ionicons name="home" size={36} color={colors.primary} />
      </View>
      <Text style={styles.body}>
        Create a household so family members can join and share your pantry.
        You'll get an invite code to share with them.
      </Text>

      <TextField
        label="Household name"
        value={householdName}
        onChangeText={setHouseholdName}
        placeholder="e.g. The Smith Family"
        autoFocus
      />
      <TextField
        label="Your name (shown to members)"
        value={myName}
        onChangeText={setMyName}
        placeholder="e.g. Sarah"
      />

      <Button
        label={creating ? 'Creating…' : 'Create household'}
        onPress={submit}
        disabled={!householdName.trim() || creating}
        style={{ marginTop: spacing.lg }}
      />
    </Sheet>
  );
}


function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    iconWrap: {
      alignItems: 'center',
      paddingVertical: spacing.lg,
    },
    body: {
      fontFamily: fonts.sans,
      fontSize: 14,
      color: colors.muted,
      lineHeight: 21,
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
  });
}
