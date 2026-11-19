import { RvcCleanMode } from 'matterbridge/matter/clusters';

import type { CleaningTypes, ModesWithMiLevel } from '../models/types.js';

import { isSupportedLevel } from './find_speed_modes.js';

/** A clean mode that vacuums and mops at the same time, like the presets of the native Matter vacuums */
export interface CleanModePreset {
  label: string;
  modeTags: RvcCleanMode.ModeTagStruct[];
  miLevels: { vacuum: number; mop: number; cleaningType?: number };
}

/** Modes that are not a fan level of their own (mop-only, custom…) */
const NOT_A_FAN_LEVEL = /mop|soft|custom|off/i;
const NOT_A_WATER_LEVEL = /custom|off|close/i;

type Level = 'low' | 'medium' | 'high';

const FAN_NAMES: Record<Level, RegExp> = {
  low: /quiet|silen/i,
  medium: /balanced|standard|basic|default|medium/i,
  high: /^max$|full speed|^strong$|turbo/i,
};
const WATER_NAMES: Record<Level, RegExp> = {
  low: /light|low|level ?1/i,
  medium: /medium|middle|level ?2/i,
  high: /high|level ?3/i,
};

/**
 * Picks the level by name, or by position (first, middle, last) when the names are unknown.
 *
 * @param {ModesWithMiLevel[]} modes The candidate modes
 * @param {Record<Level, RegExp>} names The names of each level
 * @param {Level} level The level to pick
 * @returns {ModesWithMiLevel | undefined} The mode
 */
function pick(modes: ModesWithMiLevel[], names: Record<Level, RegExp>, level: Level): ModesWithMiLevel | undefined {
  // `max` must win over `turbo` when both exist
  if (level === 'high') {
    const max = modes.find(({ name }) => /^max$|full speed/i.test(name));
    if (max) return max;
  }
  const byName = modes.find(({ name }) => names[level].test(name));
  if (byName) return byName;
  const index = level === 'low' ? 0 : level === 'high' ? modes.length - 1 : Math.floor((modes.length - 1) / 2);
  return modes[index];
}

/**
 * Builds the vacuum & mop presets (Automatic, Deep clean, Quiet) for robots that can vacuum and mop at the same time.
 *
 * @param {ModesWithMiLevel[]} speed The fan speeds (the first one is "off")
 * @param {ModesWithMiLevel[] | undefined} waterspeed The water levels (the first one is "off")
 * @param {CleaningTypes} cleaningTypes The cleaning types reported by node-miio (MIoT only)
 * @returns {CleanModePreset[]} The presets, or an empty list if the robot can't vacuum and mop at the same time
 */
export function buildCleanModePresets(speed: ModesWithMiLevel[], waterspeed: ModesWithMiLevel[] | undefined, cleaningTypes: CleaningTypes = {}): CleanModePreset[] {
  const fans = speed.slice(1).filter(({ name, miLevel }) => isSupportedLevel(miLevel) && !NOT_A_FAN_LEVEL.test(name));
  const waters = (waterspeed ?? []).slice(1).filter(({ name, miLevel }) => isSupportedLevel(miLevel) && !NOT_A_WATER_LEVEL.test(name));
  // MIoT robots that report their cleaning types must support "vacuum and mop" at the same time
  const hasCleaningTypes = Object.keys(cleaningTypes).length > 0;
  if (fans.length === 0 || waters.length === 0 || (hasCleaningTypes && cleaningTypes.vacuumAndMop === undefined)) {
    return [];
  }

  const preset = (label: string, tag: RvcCleanMode.ModeTag, level: Level): CleanModePreset => ({
    label,
    modeTags: [{ value: tag }, { value: RvcCleanMode.ModeTag.Vacuum }, { value: RvcCleanMode.ModeTag.Mop }],
    miLevels: {
      vacuum: (pick(fans, FAN_NAMES, level) as ModesWithMiLevel).miLevel,
      mop: (pick(waters, WATER_NAMES, level) as ModesWithMiLevel).miLevel,
      ...(cleaningTypes.vacuumAndMop !== undefined ? { cleaningType: cleaningTypes.vacuumAndMop } : {}),
    },
  });

  return [
    preset('Automatic', RvcCleanMode.ModeTag.Auto, 'medium'),
    preset('Deep clean', RvcCleanMode.ModeTag.DeepClean, 'high'),
    preset('Quiet', RvcCleanMode.ModeTag.Quiet, 'low'),
  ];
}
