/**
 * The round timeline and the operator picks grid share their column geometry: a label column, then one equal column
 * per round, so a round sits in the same place in both cards. Many rounds scroll sideways inside their card.
 */
export const LABEL_COLUMN = '11rem';
const ROUND_COLUMN_MIN_REM = 5.5;
const LABEL_COLUMN_REM = 11;

/** The table's smallest width: below it the card scrolls sideways instead of squeezing the rounds. */
export const roundTableMinWidth = (rounds: number): string => `${LABEL_COLUMN_REM + rounds * ROUND_COLUMN_MIN_REM}rem`;

/** The faint wash on a round the point-of-view team won (both cards). Status colour, mixed down to a tint. */
export const WON_TINT = 'bg-[color-mix(in_oklab,var(--positive)_7%,transparent)]';
