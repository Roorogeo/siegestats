import type { Random } from '@shared/util/random';

/**
 * Invented player handles. Built from neutral words and made-up syllables, never from real people's names;
 * DENIED lists well-known professional players and streamers, and a generated handle that equals one (or
 * contains one of five letters or more) is thrown away.
 */

const ADJECTIVES = [
  'Quiet', 'Rusty', 'Velvet', 'Hollow', 'Amber', 'Brisk', 'Cobalt', 'Dusty', 'Frosty', 'Gentle', 'Hazy', 'Ivory', 'Jagged',
  'Lucky', 'Mellow', 'Nimble', 'Olive', 'Pale', 'Restless', 'Salty', 'Tidy', 'Upbeat', 'Wired', 'Woolly', 'Zesty', 'Sleepy',
  'Clumsy', 'Polite', 'Grumpy', 'Sunny', 'Misty', 'Sturdy', 'Crispy', 'Fuzzy', 'Tiny', 'Spare', 'Loose', 'Patient', 'Silver',
];
const NOUNS = [
  'Otter', 'Lantern', 'Teapot', 'Badger', 'Kettle', 'Pebble', 'Walrus', 'Biscuit', 'Compass', 'Heron', 'Parsnip', 'Mitten',
  'Anchor', 'Beacon', 'Cactus', 'Ferret', 'Gazebo', 'Hammock', 'Igloo', 'Jigsaw', 'Kayak', 'Lobster', 'Marmot', 'Noodle',
  'Oyster', 'Pigeon', 'Quill', 'Radish', 'Sardine', 'Thimble', 'Umbrella', 'Waffle', 'Yak', 'Zipper', 'Toaster', 'Pretzel',
  'Turnip', 'Gecko', 'Muffin', 'Puffin', 'Doorstop', 'Crowbar', 'Ladle', 'Teacup', 'Spanner', 'Mosskin',
];
const SYLLABLES = [
  'va', 'ro', 'kin', 'tel', 'mesh', 'dra', 'vok', 'ly', 'zen', 'qua', 'bri', 'sto', 'nel', 'fa', 'mir', 'oth', 'ka', 'lu',
  'pex', 'sor', 'dun', 'vi', 'gar', 'tho', 'win', 'el', 'ash', 'bel', 'cor', 'fen', 'gil', 'hal', 'ix', 'jor', 'mak', 'nim',
  'pol', 'rin', 'sef', 'tav', 'ul', 'vex', 'wen', 'yor', 'zal',
];

/** Lower-case. Real professional players and well-known streamers; no generated handle may be one of these. */
export const DENIED_HANDLES: readonly string[] = [
  'beaulo', 'pengu', 'shaiiko', 'spoit', 'kantoraketti', 'jynxzi', 'kinggeorge', 'maciejay', 'bikinibodhi', 'pojoman',
  'varsity', 'rampy', 'supr', 'bnans', 'goddess', 'psycho', 'paluh', 'jv92', 'nesk', 'rexen', 'hotancold', 'gryxr',
  'benjamaster', 'shuttle', 'lagonis', 'yuuki', 'gifted', 'fabian', 'shadowz', 'alem4o', 'maikelele', 'rafaljr', 'spiritz',
  'dfuse', 'canadian', 'anomaly', 'ninja', 'shroud', 'tfue', 'pokimane', 'xqc', 'summit1g', 'drlupo', 'timthetatman',
  'nickmercs', 'myth', 'sypherpk', 'tenz', 's1mple', 'zywoo', 'faker', 'aceu', 'bugha', 'clix', 'mongraal', 'sacriel',
  'ladyhavoc', 'tangyd', 'drdisrespect', 'lirik', 'sodapoppin', 'asmongold', 'cohhcarnage', 'gotaga', 'squeezie',
];

export function isDeniedHandle(handle: string): boolean {
  const h = handle.toLowerCase().replace(/[^a-z0-9]/g, '');
  return DENIED_HANDLES.some((denied) => h === denied || (denied.length >= 5 && h.includes(denied)));
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function invented(rng: Random): string {
  const parts = rng.int(2, 3);
  let word = '';
  for (let i = 0; i < parts; i += 1) word += rng.pick(SYLLABLES);
  return word;
}

/** One candidate handle, in one of several styles players actually use. Length 3-15 (Ubisoft's limit is 15). */
export function candidateHandle(rng: Random): string {
  for (;;) {
    const handle = styledHandle(rng);
    if (handle.length >= 3 && handle.length <= 15) return handle;
  }
}

function styledHandle(rng: Random): string {
  const style = rng.weighted<number>([[0, 5], [1, 4], [2, 3], [3, 2], [4, 2], [5, 1]]);
  let handle: string;
  switch (style) {
    case 0:
      handle = rng.pick(ADJECTIVES) + rng.pick(NOUNS);
      break;
    case 1:
      handle = capitalize(invented(rng)) + (rng.chance(0.5) ? String(rng.int(1, 99)) : '');
      break;
    case 2:
      handle = `${rng.pick(NOUNS)}${rng.pick(['', '_', '.'])}${rng.int(2, 999)}`;
      break;
    case 3:
      handle = `${invented(rng)}${rng.pick(['_', '.', '-'])}${rng.pick(NOUNS).toLowerCase()}`;
      break;
    case 4:
      handle = `${rng.pick(ADJECTIVES).toLowerCase()}_${invented(rng)}`;
      break;
    default:
      handle = `${capitalize(invented(rng))}${rng.pick(['TTV', 'Main', 'Alt', 'GG', 'Jr'])}`;
  }
  return handle;
}

const PLATFORM_SUFFIXES: Record<'pc' | 'psn' | 'xbl', readonly string[]> = { pc: ['pc', 'alt'], psn: ['ps', 'psn'], xbl: ['xb', 'xbox'] };

/** A variant of an existing handle, as people make for a second account on another platform. */
export function variantHandle(rng: Random, base: string, platform: 'pc' | 'psn' | 'xbl'): string {
  const variant = rng.chance(0.5) ? `${base}${rng.int(1, 99)}` : `${base.toLowerCase()}_${rng.pick(PLATFORM_SUFFIXES[platform])}`;
  return variant.slice(0, 15);
}
