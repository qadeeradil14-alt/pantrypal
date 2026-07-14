import assert from 'node:assert/strict';
import test from 'node:test';
import { avatarObjectPath, resolveAvatarDisplay } from '../core/services/profileAvatar';

test('profile photo wins over initials and silhouette', () => {
  assert.deepEqual(resolveAvatarDisplay('https://example.com/avatar.jpg', 'Hewad Adil'), {
    kind: 'photo',
    uri: 'https://example.com/avatar.jpg',
  });
});

test('initials are used when no profile photo exists', () => {
  assert.deepEqual(resolveAvatarDisplay(null, 'Hewad Adil'), {
    kind: 'initials',
    text: 'HA',
  });
  assert.deepEqual(resolveAvatarDisplay('', 'Taylor'), {
    kind: 'initials',
    text: 'TA',
  });
});

test('generic silhouette is used only when photo and name are unavailable', () => {
  assert.deepEqual(resolveAvatarDisplay(null, '  '), { kind: 'silhouette' });
});

test('avatar object path is deterministic and user-owned', () => {
  assert.equal(
    avatarObjectPath('11111111-1111-1111-1111-111111111111'),
    '11111111-1111-1111-1111-111111111111/avatar.jpg',
  );
});
