import React from 'react';
import { Screen } from '../../components/shared/Screen';
import { SubScreenHeader } from '../../components/shared/SubScreenHeader';
import { EmptyState } from '../../components/shared/EmptyState';

export default function AiFeaturesScreen() {
  return (
    <Screen>
      <SubScreenHeader eyebrow="App" title="AI Features" />
      <EmptyState
        icon="sparkles-outline"
        title="Smart features are on their way"
        body="Stokit already suggests recipes from what's in your pantry and sorts new items automatically. Configurable AI features will appear here as they roll out."
      />
    </Screen>
  );
}
