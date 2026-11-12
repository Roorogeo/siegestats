import type { HexColor, ThemeId } from '../types/primitives';
import type { ThemeCategory, ThemeMode, ThemeSeed, ThemeTokens } from '../types/theme';

/**
 * The 56 themes exactly as the brief lists them: bg / surface / accent / accent-2.
 * This table is data. Every other token is derived in derive.ts; do not hand-tune colours here
 * except through `overrides`.
 */
const seed = (
  id: string,
  name: string,
  category: ThemeCategory,
  mode: ThemeMode,
  bg: HexColor,
  surface: HexColor,
  accent: HexColor,
  accent2: HexColor,
  overrides: Partial<ThemeTokens> = {},
): ThemeSeed => ({ id: id as ThemeId, name, category, mode, bg, surface, accent, accent2, overrides });

export const THEME_SEEDS: readonly ThemeSeed[] = [
  // Generic (6)
  seed('graphite', 'Graphite', 'generic', 'dark', '#111315', '#1B1E22', '#4C8DFF', '#8AB4FF'),
  seed('daylight', 'Daylight', 'generic', 'light', '#F5F6F8', '#FFFFFF', '#2563EB', '#0EA5A4'),
  seed('midnight', 'Midnight', 'generic', 'dark', '#0B1020', '#141B33', '#7C8CFF', '#5EEAD4'),
  seed('slate', 'Slate', 'generic', 'dark', '#151A1F', '#1F272E', '#2DD4BF', '#94A3B8'),
  seed('pitch-black', 'Pitch Black', 'generic', 'dark', '#000000', '#0D0D0D', '#E5E5E5', '#9CA3AF'),
  seed('high-contrast', 'High Contrast', 'generic', 'dark', '#000000', '#000000', '#FFE600', '#00E5FF', { border: '#FFFFFF', text: '#FFFFFF' }),
  // Specialty: Elements (10)
  seed('ember', 'Ember', 'elements', 'dark', '#140B08', '#22130E', '#FF6B35', '#FFB347'),
  seed('glacier', 'Glacier', 'elements', 'dark', '#08131A', '#0F2230', '#7FDBFF', '#B8F1FF'),
  seed('thunderstorm', 'Thunderstorm', 'elements', 'dark', '#0E1016', '#191C26', '#F5D547', '#8E9BBF'),
  seed('aurora', 'Aurora', 'elements', 'dark', '#07120F', '#0E211C', '#3DFFB0', '#8A7CFF'),
  seed('solar-flare', 'Solar Flare', 'elements', 'dark', '#170A02', '#2A1505', '#FFA51F', '#FF4D2E'),
  seed('deep-ocean', 'Deep Ocean', 'elements', 'dark', '#04101C', '#0A1E33', '#1FA2FF', '#12D8C4'),
  seed('volcanic-ash', 'Volcanic Ash', 'elements', 'dark', '#121212', '#1E1C1B', '#E0452B', '#8C8580'),
  seed('desert-dune', 'Desert Dune', 'elements', 'light', '#F4E9D8', '#FBF4E8', '#C4622D', '#8A6B3F'),
  seed('monsoon', 'Monsoon', 'elements', 'dark', '#0C1418', '#152329', '#4FB3BF', '#7C8F99'),
  seed('eclipse', 'Eclipse', 'elements', 'dark', '#050507', '#101016', '#FF9F1C', '#5B5F97'),
  // Specialty: Neon (10)
  seed('neon-district', 'Neon District', 'neon', 'dark', '#0A0314', '#160A26', '#FF2BD6', '#00F0FF'),
  seed('synthwave-sunset', 'Synthwave Sunset', 'neon', 'dark', '#130523', '#24103D', '#FF6EC7', '#FFC857'),
  seed('arcade-cabinet', 'Arcade Cabinet', 'neon', 'dark', '#0B0B12', '#17172A', '#39FF14', '#FF3864'),
  seed('laser-grid', 'Laser Grid', 'neon', 'dark', '#050510', '#0F0F24', '#00E5FF', '#B14EFF'),
  seed('midnight-rooftop', 'Midnight Rooftop', 'neon', 'dark', '#0B0E17', '#151A29', '#F2A541', '#5D7BD5'),
  seed('vapor-pastel', 'Vapor Pastel', 'neon', 'light', '#F3E8FF', '#FBF5FF', '#9B6BE0', '#3FB8C9'),
  seed('blacklight', 'Blacklight', 'neon', 'dark', '#0A0014', '#17002B', '#C6FF00', '#9D4EDD'),
  seed('hologram', 'Hologram', 'neon', 'dark', '#071018', '#0F1E2B', '#7DF9FF', '#F5A6FF'),
  seed('night-market', 'Night Market', 'neon', 'dark', '#120A0A', '#221414', '#FF5252', '#FFD166'),
  seed('subway-line', 'Subway Line', 'neon', 'dark', '#101112', '#1C1E20', '#FFCC00', '#2EC4B6'),
  // Specialty: Nature (10)
  seed('rainforest', 'Rainforest', 'nature', 'dark', '#07130B', '#102116', '#3CCF6E', '#B4E197'),
  seed('cherry-blossom', 'Cherry Blossom', 'nature', 'light', '#FFF1F4', '#FFF9FA', '#D94F7A', '#6FA37A'),
  seed('autumn-maple', 'Autumn Maple', 'nature', 'dark', '#160C06', '#26160C', '#E2711D', '#C9A227'),
  seed('lavender-field', 'Lavender Field', 'nature', 'dark', '#110E1C', '#1D1830', '#B79CED', '#7FD1B9'),
  seed('coral-reef', 'Coral Reef', 'nature', 'dark', '#06151A', '#0D252D', '#FF7F6B', '#2ED1C4'),
  seed('moss-and-stone', 'Moss and Stone', 'nature', 'dark', '#101410', '#1B211B', '#8DAA6B', '#A8A39A'),
  seed('sunflower', 'Sunflower', 'nature', 'light', '#FFF9E0', '#FFFDF2', '#B88400', '#5C7A29'),
  seed('arctic-tundra', 'Arctic Tundra', 'nature', 'light', '#EEF4F8', '#F8FBFD', '#2A7FA8', '#6C8A9B'),
  seed('red-canyon', 'Red Canyon', 'nature', 'dark', '#170B08', '#2A1410', '#D9532B', '#E8A87C'),
  seed('night-garden', 'Night Garden', 'nature', 'dark', '#0A0F14', '#131C24', '#9BE564', '#D783FF'),
  // Specialty: Tactical and Tech (10)
  seed('terminal-green', 'Terminal Green', 'tactical', 'dark', '#020A04', '#07160B', '#33FF66', '#1FA84A'),
  seed('amber-crt', 'Amber CRT', 'tactical', 'dark', '#0D0800', '#1C1203', '#FFB000', '#CC7A00'),
  seed('blueprint', 'Blueprint', 'tactical', 'dark', '#0A2540', '#0F3257', '#E6F1FF', '#5FB0FF'),
  seed('paper-and-ink', 'Paper and Ink', 'tactical', 'light', '#F7F3EA', '#FFFDF7', '#1F2937', '#B4532A'),
  seed('retro-pixel', 'Retro Pixel', 'tactical', 'dark', '#15152B', '#23234A', '#F7D046', '#E64C6B'),
  seed('carbon-fiber', 'Carbon Fiber', 'tactical', 'dark', '#0C0C0D', '#18181A', '#E10600', '#9A9A9E'),
  seed('gunmetal', 'Gunmetal', 'tactical', 'dark', '#14181C', '#20262C', '#7FA6C9', '#C0C6CC'),
  seed('circuit-board', 'Circuit Board', 'tactical', 'dark', '#06150F', '#0C2419', '#D4A017', '#29C27F'),
  seed('night-vision', 'Night Vision', 'tactical', 'dark', '#050B06', '#0D1A10', '#A6FF4D', '#5E7A63'),
  seed('thermal-camera', 'Thermal Camera', 'tactical', 'dark', '#0B0220', '#1B0638', '#FF7A00', '#FFE600'),
  // Specialty: Seasonal and Mood (10)
  seed('winter-frost', 'Winter Frost', 'seasonal', 'light', '#EDF3F9', '#FAFCFE', '#2F74B5', '#7FA8C9'),
  seed('spring-bloom', 'Spring Bloom', 'seasonal', 'light', '#F3FBEF', '#FDFFFB', '#3A9A5B', '#E0739A'),
  seed('summer-beach', 'Summer Beach', 'seasonal', 'light', '#FFF6E5', '#FFFCF5', '#008C8C', '#F2683C'),
  seed('harvest', 'Harvest', 'seasonal', 'dark', '#17100A', '#261B11', '#D98E04', '#A63D40'),
  seed('spooky-night', 'Spooky Night', 'seasonal', 'dark', '#0D0712', '#1A0F24', '#FF7518', '#8A2BE2'),
  seed('winter-holiday', 'Winter Holiday', 'seasonal', 'dark', '#0C1410', '#15221B', '#D7263D', '#F4D35E'),
  seed('fireworks', 'Fireworks', 'seasonal', 'dark', '#070A1A', '#101633', '#FF4D6D', '#FFD60A'),
  seed('valentine', 'Valentine', 'seasonal', 'dark', '#1A0A10', '#2B121B', '#FF4F79', '#FFB3C6'),
  seed('lucky-clover', 'Lucky Clover', 'seasonal', 'dark', '#06140B', '#0D2415', '#2ECC71', '#F1C40F'),
  seed('rose-gold', 'Rose Gold', 'seasonal', 'dark', '#151011', '#231A1C', '#E8A598', '#F6D5CE'),
];

export const DEFAULT_THEME_ID = 'graphite' as ThemeId;
/** The generic pair used when "match Windows light/dark" is on and nothing else was chosen. */
export const DEFAULT_LIGHT_THEME_ID = 'daylight' as ThemeId;
export const DEFAULT_DARK_THEME_ID = 'graphite' as ThemeId;
