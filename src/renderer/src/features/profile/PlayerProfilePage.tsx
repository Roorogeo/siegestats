import { useParams } from 'react-router';
import { parsePlayerParams } from '../../app/routes';
import { PlayerProfile } from './PlayerProfile';
import { ProfileNotFound } from './ProfileNotFound';

/** Route /player/:platform/:id (build links with playerPath()): anyone's profile. A malformed link gets a not-found page. */
export function PlayerProfilePage() {
  const player = parsePlayerParams(useParams());
  if (!player) return <ProfileNotFound player={null} />;
  // Keyed by account, so moving to a linked account starts its page fresh (collapsed lists, closed dialogs).
  return <PlayerProfile key={`${player.platform}:${player.id}`} player={player} />;
}
