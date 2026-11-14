import { createHashRouter, Navigate, type RouteObject } from 'react-router';
import { HomePage } from '../features/home/HomePage';
import { LeaderboardsPage } from '../features/leaderboards/LeaderboardsPage';
import { LegendDivisionPage } from '../features/legend/LegendDivisionPage';
import { LiveMatchPage } from '../features/live/LiveMatchPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AppShell } from '../shell/AppShell';
import { RootError } from './RootError';
import { ROUTES } from './routes';

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
      { path: `${ROUTES.settings}/:section?`, element: <SettingsPage /> },
      { path: '*', element: <Navigate to={ROUTES.home} replace /> },
    ],
  },
];

export const createAppRouter = () => createHashRouter(routes);
