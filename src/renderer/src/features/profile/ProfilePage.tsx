import { Pin } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { PlayerRef } from '@shared/types/player';
import { playerKeyString } from '@shared/util/player';
import { Card } from '../../ui';
import { PlayerSearchBox } from '../search/PlayerSearchBox';
import { usePinnedAccounts } from './usePinnedAccounts';
import { PlayerProfile } from './PlayerProfile';

/** No account pinned yet: "search for my account and pin it" (brief, screens 1 and 2). */
function Onboarding({ onPick }: { onPick(player: PlayerRef): void }) {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-6 py-5">
      <header className="flex flex-col gap-1">
        {/* Focusable from code only: the shell moves focus to the page's h1 after a screen change. */}
        <h1 tabIndex={-1} className="text-lg font-semibold outline-none">
          My Profile
        </h1>
        <p className="text-[13px] text-text-muted">Your own account in depth: current season, peak ranks, ranked sessions and match history.</p>
      </header>
      <Card className="flex flex-col items-center gap-4 px-6 py-12">
        <div className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-text-muted">
          <Pin className="size-5" aria-hidden />
        </div>
        <div className="flex max-w-lg flex-col gap-1 text-center">
          <h2 className="text-[15px] font-semibold text-text">Find your account and pin it</h2>
          <p className="text-[13px] text-text-muted">
            Search for your in-game name, pick the platform you play on and choose your account. It is pinned as yours, and
            Home and My Profile show it from then on.
          </p>
        </div>
        <div className="w-full max-w-xl">
          <PlayerSearchBox label="Find your account" placeholder="Your in-game name" onSelect={onPick} />
        </div>
        <p className="max-w-lg text-center text-xs text-text-muted">
          Accounts are separate on PC, PlayStation and Xbox: pick the platform you play on beside the name. Play on more than
          one? Pin each account; the account menu at the top right switches between them.
        </p>
      </Card>
    </div>
  );
}

/**
 * Route /profile, "My Profile": the profile of the active pinned account (the one picked in the account switcher),
 * or, with nothing pinned, the onboarding search that pins one.
 */
export function ProfilePage() {
  const { accounts, pin } = usePinnedAccounts();
  const active = accounts.active;
  /** Set by the onboarding pick: the search that had focus is gone, and the route stays /profile. */
  const focusHeading = useRef(false);

  // The profile replaced the search box that had focus: open it at its top with focus on its h1, as a screen change
  // would (the route stays /profile, so the shell does not).
  useEffect(() => {
    if (!active || !focusHeading.current) return;
    focusHeading.current = false;
    document.querySelector('main')?.scrollTo(0, 0);
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }, [active]);

  if (!active) {
    return (
      <Onboarding
        onPick={(player) => {
          focusHeading.current = true;
          pin(player, { makeActive: true });
        }}
      />
    );
  }
  return <PlayerProfile key={playerKeyString(active)} player={active} mine />;
}
