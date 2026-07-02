import React, { useState, useRef } from 'react';
import { StyleSheet, Text, View, TextInput } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../shared/Sheet';
import { TextField } from '../shared/Field';
import { Button } from '../shared/ui';
import { fonts, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useHouseholdStore } from '../../store/household-store';
import { normalizeInviteCode } from '../../core/services/household';

export function JoinHouseholdSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const joinHousehold = useHouseholdStore((s) => s.joinHousehold);
  const [code, setCode] = useState('');
  const [myName, setMyName] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const nameRef = useRef<TextInput>(null);

  const validCode = normalizeInviteCode(code);

  const submit = async () => {
    setError('');
    setJoining(true);
    const result = await joinHousehold(code, myName);
    setJoining(false);
    if (!result.ok && result.invalidCode) {
      setError(result.message);
      return;
    }
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.alreadyMember) {
      setCode('');
      setError(result.message ?? 'This person is already in your household.');
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCode('');
    setMyName('');
    onClose();
  };

  return (
    <Sheet visible={visible} title="Join household" onClose={onClose}>
      <View style={styles.iconWrap}>
        <Ionicons name="people" size={36} color={colors.primary} />
      </View>
      <Text style={styles.body}>
        Ask the household owner to share their invite code, then enter it below.
      </Text>

      <TextField
        label="Invite code"
        value={code}
        onChangeText={(v) => {
          setCode(v.toUpperCase());
          setError('');
        }}
        placeholder="ABC123"
        autoFocus
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="next"
        onSubmitEditing={() => nameRef.current?.focus()}
        blurOnSubmit={false}
      />
      <TextField
        ref={nameRef}
        label="Your name (shown to members)"
        value={myName}
        onChangeText={setMyName}
        placeholder="e.g. Alex"
        returnKeyType="done"
        onSubmitEditing={() => validCode && !joining && submit()}
      />

      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Button
        label={joining ? 'Joining…' : 'Join household'}
        onPress={submit}
        disabled={!validCode || joining}
        style={{ marginTop: spacing.lg }}
      />
    </Sheet>
  );
}


function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    iconWrap: { alignItems: 'center', paddingVertical: spacing.lg },
    body: {
      fontFamily: fonts.sans,
      fontSize: 14,
      color: colors.muted,
      lineHeight: 21,
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
    errorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    errorText: { fontFamily: fonts.sans, fontSize: 13, color: colors.danger },
  });
}
