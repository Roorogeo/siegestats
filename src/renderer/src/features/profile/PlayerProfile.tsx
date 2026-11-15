import { useSearchParams } from 'react-router';
import type { PlayerKey } from '@shared/types/player';
import { useProfile } from '../../queries';
import { Tabs, tabPanelProps } from '../../ui';
import { ProfileHeader } from './header/ProfileHeader';
import { OverviewTab } from './overview/OverviewTab';
import {
  DEFAULT_PROFILE_TAB, parseProfileTab, PROFILE_TAB_PARAM, PROFILE_TABS, PROFILE_TABS_ID, type ProfileTabId,
} from './profile-tabs';
import { ProfileNotFound } from './ProfileNotFound';
import { EncountersTab } from './tabs/EncountersTab';
import { LinkedAccountsTab } from './tabs/LinkedAccountsTab';
import { MapsTab } from './tabs/MapsTab';
import { OperatorsTab } from './tabs/OperatorsTab';
import { SeasonsTab } from './tabs/SeasonsTab';

function TabPanel({ tab, player }: { tab: ProfileTabId; player: PlayerKey }) {
  switch (tab) {
    case 'overview':
      return <OverviewTab player={player} />;
    case 'seasons':
      return <SeasonsTab player={player} />;
    case 'encounters':
      return <EncountersTab player={player} />;
    case 'operators':
      return <OperatorsTab player={player} />;
    case 'maps':
      return <MapsTab player={player} />;
    case 'linked':
      return <LinkedAccountsTab player={player} />;
  }
}

interface PlayerProfileProps {
  player: PlayerKey;
  /** My Profile: the user's own active account. */
  mine?: boolean;
}

/**
 * One player's profile, anyone's or mine: the header (with the platform switch along its edge), then the six
 * section tabs. The selected tab is in the URL (?tab=seasons), so links, back and forward all land on it; Overview
 * is the default. A player the source does not know gets a not-found page instead.
 */
export function PlayerProfile({ player, mine = false }: PlayerProfileProps) {
  const profile = useProfile(player);
  const [search, setSearch] = useSearchParams();
  const tab = parseProfileTab(search.get(PROFILE_TAB_PARAM));

  const selectTab = (next: ProfileTabId): void => {
    if (next === tab) return;
    setSearch((current) => {
      const params = new URLSearchParams(current);
      if (next === DEFAULT_PROFILE_TAB) params.delete(PROFILE_TAB_PARAM);
      else params.set(PROFILE_TAB_PARAM, next);
      return params;
    });
  };

  if (profile.error?.code === 'not_found' && profile.data === undefined) {
    return <ProfileNotFound player={player} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-6 py-5">
      <ProfileHeader profile={profile} mine={mine} tab={tab} />
      <div className="flex flex-col gap-4">
        <Tabs items={PROFILE_TABS} value={tab} onChange={selectTab} label="Profile sections" idPrefix={PROFILE_TABS_ID} />
        {/* Overview always holds controls; the other tabs may show only an empty state, so their panel takes focus. */}
        <div {...tabPanelProps(PROFILE_TABS_ID, tab, tab !== DEFAULT_PROFILE_TAB)} className="min-w-0 focus-visible:outline-offset-4">
          <TabPanel tab={tab} player={player} />
        </div>
      </div>
    </div>
  );
}
