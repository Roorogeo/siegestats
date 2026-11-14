import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Bell, Star } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { AppNotification } from '@shared/types/notifications';
import type { Favorite } from '@shared/types/storage';
import { toAppError } from '@shared/util/errors';
import { bridge } from '../bridge';
import { EmptyState, ErrorState, IconButton, Loading, Skeleton, Tabs, tabPanelProps, type TabItem } from '../ui';
import { PLATFORM_LABEL } from './platforms';
import { Popover } from './Popover';

type PanelTab = 'notifications' | 'favorites';

const NOTIFICATIONS_KEY = ['notifications'] as const;
const FAVORITES_KEY = ['favorites'] as const;

/** One line per notification. Phase 6 designs these properly; this keeps real data readable meanwhile. */
function describe(notification: AppNotification): string {
  switch (notification.kind) {
    case 'favorite_rank_changed':
      return `${notification.player.name}'s rank changed`;
    case 'match_saved':
      return `Match saved: ${notification.score.own}-${notification.score.opponent}`;
    case 'season_started':
      return 'A new season has started';
  }
}

function RowsSkeleton() {
  return (
    <Loading label="Loading">
      <div className="flex flex-col gap-2 p-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-3">
            <Skeleton className="size-7 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-2.5 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** Loading, error, empty and list: the four states every data panel has. */
function QueryPanel<T>({
  query,
  empty,
  children,
}: {
  query: UseQueryResult<T[]>;
  empty: ReactNode;
  children(items: T[]): ReactNode;
}) {
  if (query.isPending) return <RowsSkeleton />;
  if (query.isError) {
    return (
      <ErrorState
        className="[&>div]:py-6"
        title="Could not load this list"
        description={toAppError(query.error).message}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.data.length === 0) return empty;
  return <ul className="flex max-h-80 flex-col overflow-y-auto p-1.5">{children(query.data)}</ul>;
}

/** The bell: notifications and favourites in one panel (docs/design.md, question 31). */
export function NotificationBell() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<PanelTab>('notifications');
  const [open, setOpen] = useState(false);

  // Notifications are read up front for the unread dot; favourites only once the panel is opened.
  const notifications = useQuery({ queryKey: NOTIFICATIONS_KEY, queryFn: () => bridge.notifications.list() });
  const favorites = useQuery({ queryKey: FAVORITES_KEY, queryFn: () => bridge.favorites.list(), enabled: open });

  useEffect(() => bridge.notifications.onChange((all) => queryClient.setQueryData<AppNotification[]>(NOTIFICATIONS_KEY, all)), [queryClient]);
  useEffect(() => bridge.favorites.onChange((all) => queryClient.setQueryData<Favorite[]>(FAVORITES_KEY, all)), [queryClient]);

  const unread = notifications.data?.filter((notification) => notification.readAt === null).length ?? 0;
  const tabs: TabItem<PanelTab>[] = [
    { id: 'notifications', label: 'Notifications', ...(unread > 0 ? { count: unread } : {}) },
    { id: 'favorites', label: 'Favourites' },
  ];

  return (
    <Popover
      label="Notifications and favourites"
      className="w-[360px]"
      onOpenChange={setOpen}
      trigger={(props, isOpen) => (
        <IconButton label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'} dot={unread > 0} active={isOpen} {...props}>
          <Bell className="size-4" aria-hidden />
        </IconButton>
      )}
    >
      <div className="flex flex-col">
        <div>
          <Tabs<PanelTab> items={tabs} value={tab} onChange={setTab} label="Notifications and favourites" idPrefix="bell" className="px-2" />
        </div>
        <div {...tabPanelProps('bell', tab, true)} className="outline-offset-[-2px]">
          {tab === 'notifications' ? (
            <QueryPanel
              query={notifications}
              empty={
                <EmptyState
                  className="px-5 py-8"
                  icon={<Bell className="size-5" aria-hidden />}
                  title="Nothing yet"
                  description="You will be told when a favourite's rank changes, when a match of yours is saved, and when a new season starts."
                />
              }
            >
              {(items) =>
                items.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 rounded-control px-2 py-1.5 text-[13px]">
                    {item.readAt === null && <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate">
                      {item.readAt === null && <span className="sr-only">Unread: </span>}
                      {describe(item)}
                    </span>
                  </li>
                ))
              }
            </QueryPanel>
          ) : (
            <QueryPanel
              query={favorites}
              empty={
                <EmptyState
                  className="px-5 py-8"
                  icon={<Star className="size-5" aria-hidden />}
                  title="No favourites yet"
                  description="Players you star appear here. Favourites arrive in phase 6."
                />
              }
            >
              {(items) =>
                items.map(({ player }) => (
                  <li key={`${player.platform}:${player.id}`} className="flex items-center justify-between gap-3 rounded-control px-2 py-1.5">
                    <span className="truncate text-[13px]">{player.name}</span>
                    <span className="shrink-0 text-xs text-text-muted">{PLATFORM_LABEL[player.platform]}</span>
                  </li>
                ))
              }
            </QueryPanel>
          )}
        </div>
      </div>
    </Popover>
  );
}
