/**
 * What a profile card shows when the profile itself failed to load: the header owns that error (one alert, one
 * Retry), so the cards below only point to it, quietly.
 */
export function ProfileFailedNote() {
  return <p className="py-6 text-center text-[13px] text-text-muted">Not loaded: see the message at the top of the profile.</p>;
}
