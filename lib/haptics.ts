import * as Haptics from 'expo-haptics';

async function run(fn: () => Promise<void>) {
  try {
    await fn();
  } catch {
    // Haptics can fail silently on unsupported runtimes.
  }
}

export async function hapticSelection() {
  await run(() => Haptics.selectionAsync());
}

export async function hapticSoft() {
  await run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export async function hapticMedium() {
  await run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export async function hapticSuccess() {
  await run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export async function hapticWarning() {
  await run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

export async function hapticError() {
  await run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
