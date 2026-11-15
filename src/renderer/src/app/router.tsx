import { createHashRouter, Navigate, type RouteObject } from 'react-router';
import { HomePage } from '../features/home/HomePage';
import { LeaderboardsPage } from '../features/leaderboards/LeaderboardsPage';
import { LegendDivisionPage } from '../features/legend/LegendDivisionPage';
import { LiveMatchPage } from '../features/live/LiveMatchPage';
import { MatchPage } from '../features/match/MatchPage';
import { PlayerProfilePage } from '../features/profile/PlayerProfilePage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AppShell } from '../shell/AppShell';
import { RootError } from './RootError';
import { ROUTES } from './routes';

/**
 * The component gallery (design check of every shared component on real mock data): the dev server and the browser
 * build only. In the packaged app this is a constant false, so the route and its code are left out of the bundle.
 */
const devRoutes: RouteObject[] =
  import.meta.env.DEV || __WEB_BUILD__
    ? [
        {
          path: ROUTES.devComponents,
          lazy: async () => ({ Component: (await import('../features/dev/ComponentGallery')).ComponentGallery }),
          // Shown while the gallery's code loads when it is the first page opened.
          HydrateFallback: () => null,
        },
      ]
    : [];

/** Exported on its own so tests can mount the same routes in a memory router. */
export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    errorElement: <RootError />,
    children: [
      { path: ROUTES.home, element: <HomePage /> },
      { path: ROUTES.leaderboards, element: <LeaderboardsPage /> },
      { path: ROUTES.legend, element: <LegendDivisionPage /> },
      { path: ROUTES.profile, element: <ProfilePage /> },
      { path: ROUTES.live, element: <LiveMatchPage /> },
      { path: ROUTES.player, element: <PlayerProfilePage /> },
      { path: ROUTES.match, element: <MatchPage /> },
      { path: `${ROUTES.settings}/:section?`, element: <SettingsPage /> },
      ...devRoutes,
      { path: '*', element: <Navigate to={ROUTES.home} replace /> },
    ],
  },
];

export const createAppRouter = () => createHashRouter(routes);
