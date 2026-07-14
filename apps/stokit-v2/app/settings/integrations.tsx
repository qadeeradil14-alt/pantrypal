import React from 'react';
import { Screen } from '../../components/shared/Screen';
import { SubScreenHeader } from '../../components/shared/SubScreenHeader';
import { EmptyState } from '../../components/shared/EmptyState';

export default function IntegrationsScreen() {
  return (
    <Screen>
      <SubScreenHeader eyebrow="More" title="Integrations" />
      <EmptyState
        icon="link-outline"
        title="No integrations yet"
        body="Connections to other services — calendars, assistants, grocery delivery — will live here once they're available."
      />
    </Screen>
  );
}
