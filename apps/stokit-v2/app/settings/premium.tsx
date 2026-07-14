import React from 'react';
import { Screen } from '../../components/shared/Screen';
import { SubScreenHeader } from '../../components/shared/SubScreenHeader';
import { EmptyState } from '../../components/shared/EmptyState';

export default function PremiumScreen() {
  return (
    <Screen>
      <SubScreenHeader eyebrow="More" title="Premium" />
      <EmptyState
        icon="star-outline"
        title="Stokit Premium is coming soon"
        body="Everything in Stokit is free today. Premium extras will show up here when they launch — nothing you use now will be taken away."
      />
    </Screen>
  );
}
