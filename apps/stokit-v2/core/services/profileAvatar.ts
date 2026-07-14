import { decode } from 'base64-arraybuffer';

const AVATAR_BUCKET = 'avatars';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type AvatarDisplay =
  | { kind: 'photo'; uri: string }
  | { kind: 'initials'; text: string }
  | { kind: 'silhouette' };

export type AvatarUploadStage = 'uploading' | 'saving';

type AvatarResult = { ok: true } | { ok: false; message: string };

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export function resolveAvatarDisplay(photoUrl: string | null | undefined, displayName: string): AvatarDisplay {
  if (photoUrl?.trim()) return { kind: 'photo', uri: photoUrl };
  const text = initialsFor(displayName);
  return text ? { kind: 'initials', text } : { kind: 'silhouette' };
}

export function avatarObjectPath(userId: string): string {
  return `${userId}/avatar.jpg`;
}

export async function createAvatarSignedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { supabase } = await import('../../lib/supabase');
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return error ? null : data.signedUrl;
}

export async function uploadProfileAvatar(
  userId: string,
  base64: string,
  contentType: 'image/jpeg' | 'image/png',
  onStage?: (stage: AvatarUploadStage) => void,
): Promise<AvatarResult> {
  const { supabase } = await import('../../lib/supabase');
  const path = avatarObjectPath(userId);
  const { data: profile, error: lookupError } = await supabase
    .from('profiles')
    .select('avatar_path')
    .eq('id', userId)
    .maybeSingle();
  if (lookupError || !profile) {
    return { ok: false, message: lookupError?.message ?? 'Could not load your profile.' };
  }
  onStage?.('uploading');
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, decode(base64), {
      contentType,
      cacheControl: '0',
      upsert: true,
    });
  if (uploadError) return { ok: false, message: uploadError.message };

  onStage?.('saving');
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_path: path, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (profileError) {
    if (!profile?.avatar_path) await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    return { ok: false, message: profileError.message };
  }
  return { ok: true };
}

export async function removeProfileAvatar(userId: string): Promise<AvatarResult> {
  const { supabase } = await import('../../lib/supabase');
  const path = avatarObjectPath(userId);
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_path: null, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (profileError) return { ok: false, message: profileError.message };

  const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  if (!removeError) return { ok: true };

  await supabase
    .from('profiles')
    .update({ avatar_path: path, updated_at: new Date().toISOString() })
    .eq('id', userId);
  return { ok: false, message: removeError.message };
}
