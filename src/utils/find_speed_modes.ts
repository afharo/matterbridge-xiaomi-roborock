import { RvcCleanMode } from 'matterbridge/matter/clusters';
import { resolveVacuumModes, vacuumModels, type VacuumDevice, type VacuumMode } from 'node-miio';

import type { CleaningTypes, ModelDefinition, ModesWithMiLevel } from '../models/types.js';

/**
 * Placeholder level for "vacuum off" / "water off" when the device doesn't support it (e.g. MIoT devices).
 * Use {@link isSupportedLevel} before sending it to the device.
 */
export const UNSUPPORTED_LEVEL = Number.NaN;

/**
 * Whether a level can be sent to the device.
 *
 * @param {number | undefined} level The level
 * @returns {boolean} `true` if it's a real level
 */
export function isSupportedLevel(level: number | undefined): level is number {
  return typeof level === 'number' && !Number.isNaN(level);
}

/**
 * Finds the speed modes that apply to the current model and firmware version, from node-miio's table (the models it
 * doesn't list get their brand's defaults).
 *
 * @param {string} model The Robot Vacuum's model
 * @param {string?} firmware The firmware's version
 *
 * @returns {ModelDefinition} The speed modes that apply to the robot.
 */
export function findSpeedModes(model: string, firmware?: string): ModelDefinition {
  const { fanSpeeds, waterBoxModes } = resolveVacuumModes(model, firmware);
  return fromNodeMiioModes(fanSpeeds, waterBoxModes);
}

/**
 * Resolves the speed modes of a device:
 * - Models in node-miio's table (`vacuumModels()`) use it ({@link findSpeedModes}), with the firmware variants.
 * - Any other model uses the fan speeds / water levels reported by `node-miio` (e.g. from the device's MIoT spec).
 * - Falls back to {@link findSpeedModes} if `node-miio` doesn't report any fan speed.
 *
 * @param {VacuumDevice} device The connected device
 * @param {string} model The Robot Vacuum's model
 * @param {string?} firmware The firmware's version
 * @returns {Promise<ModelDefinition>} The speed modes that apply to the robot.
 */
export async function resolveSpeedModes(device: VacuumDevice, model: string, firmware?: string): Promise<ModelDefinition> {
  if (vacuumModels().includes(model) || typeof device.fanSpeeds !== 'function') {
    return findSpeedModes(model, firmware);
  }

  const [fanSpeeds, waterBoxModes] = await Promise.all([
    device.fanSpeeds().catch(() => []),
    typeof device.waterBoxModes === 'function' ? device.waterBoxModes().catch(() => []) : Promise.resolve([]),
  ]);
  if (fanSpeeds.length === 0) {
    return findSpeedModes(model, firmware);
  }
  const definition = fromNodeMiioModes(fanSpeeds, waterBoxModes);
  const cleaningTypes = classifyCleaningTypes('cleaningTypes' in device ? await device.cleaningTypes().catch(() => []) : []);
  return Object.keys(cleaningTypes).length > 0 ? { ...definition, cleaningTypes } : definition;
}

/**
 * Classifies the cleaning types reported by node-miio (from the MIoT spec, e.g. `Sweep`, `Mop`, `Sweep Mop`,
 * `Sweep Before Mopping`, `Sweep And Mop`).
 *
 * @param {VacuumMode[]} cleaningTypes The cleaning types
 * @returns {CleaningTypes} The values for each kind of cleaning
 */
export function classifyCleaningTypes(cleaningTypes: VacuumMode[]): CleaningTypes {
  const result: CleaningTypes = {};
  for (const { value, name } of cleaningTypes) {
    const sweep = /sweep|vacuum/i.test(name);
    const mop = /mop/i.test(name);
    const kind: keyof CleaningTypes | undefined = sweep && mop ? (/before|then|after/i.test(name) ? 'vacuumThenMop' : 'vacuumAndMop') : sweep ? 'vacuum' : mop ? 'mop' : undefined;
    if (kind && result[kind] === undefined) result[kind] = value;
  }
  return result;
}

const { Auto, Day, DeepClean, LowEnergy, LowNoise, Max, Min, Mop, Night, Vacation } = RvcCleanMode.ModeTag;

/**
 * Matter tags of the fan speeds by (lowercased) name. Their meaning in the Matter spec: LowNoise / Night (quiet, for the
 * night), LowEnergy, Day (suitable while people are around: the everyday speeds), Max (the highest setting), DeepClean
 * (more thorough). The high speeds are tagged by rank instead (see {@link fanTags}). "Custom" is Vacation, the closest
 * there is (users rely on finding it).
 */
const FAN_TAGS: Record<string, RvcCleanMode.ModeTag[]> = {
  quiet: [LowNoise, Night],
  silent: [LowNoise, Night],
  silence: [LowNoise, Night],
  gentle: [LowEnergy],
  soft: [LowEnergy],
  balanced: [Day],
  standard: [Day],
  basic: [Day],
  default: [Day],
  medium: [Day],
  middle: [Day],
  custom: [Vacation],
  mop: [Mop],
  auto: [Auto],
};

/** The high fan speeds, tagged by rank: the fastest is DeepClean and the next one Max (or Max, if it's the only one) */
const HIGH_FAN_SPEEDS = /^(strong|turbo|max|full speed|max\+)$/;

const WATER_TAGS: Record<string, RvcCleanMode.ModeTag[]> = {
  light: [Min],
  low: [Min],
  level1: [Min],
  medium: [Day],
  middle: [Day],
  level2: [Day],
  high: [Max],
  level3: [Max],
  custom: [Vacation],
};

const OFF_NAMES = new Set(['off', 'close', 'closed', 'level0']);

/**
 * The tags of a mode whose name is unknown, by position: first low, last max, the others day.
 *
 * @param {number} index The position of the mode
 * @param {number} count How many modes there are
 * @param {RvcCleanMode.ModeTag} lowest The tag of the first one
 * @returns {RvcCleanMode.ModeTag[]} The tags
 */
function tagsByPosition(index: number, count: number, lowest: RvcCleanMode.ModeTag): RvcCleanMode.ModeTag[] {
  if (index === 0) return [lowest];
  return index === count - 1 ? [Max] : [Day];
}

/**
 * The Matter tags of each fan speed (slowest first): by name, the high speeds (Strong, Turbo, Max, Full Speed, Max+) by
 * rank (the fastest DeepClean, the next one Max, the others none: e.g. Turbo when there are Max and Max+), and the
 * unknown names by position.
 *
 * @param {string[]} names The fan speeds' names
 * @returns {RvcCleanMode.ModeTag[][]} The tags of each one
 */
export function fanTags(names: string[]): RvcCleanMode.ModeTag[][] {
  const keys = names.map((name) => name.trim().toLowerCase());
  const highs = keys.flatMap((key, index) => (HIGH_FAN_SPEEDS.test(key) ? [index] : []));
  return keys.map((key, index) => {
    if (HIGH_FAN_SPEEDS.test(key)) {
      const fromTheTop = highs.length - 1 - highs.indexOf(index);
      if (highs.length === 1) return [Max];
      return fromTheTop === 0 ? [DeepClean] : fromTheTop === 1 ? [Max] : [];
    }
    return FAN_TAGS[key] ?? tagsByPosition(index, keys.length, LowNoise);
  });
}

/**
 * The Matter tags of each water level (lowest first, without "off"): by name, or by position.
 *
 * @param {string[]} names The water levels' names
 * @returns {RvcCleanMode.ModeTag[][]} The tags of each one
 */
export function waterTags(names: string[]): RvcCleanMode.ModeTag[][] {
  return names.map((name, index) => WATER_TAGS[name.trim().toLowerCase()] ?? tagsByPosition(index, names.length, Min));
}

/**
 * Converts the modes reported by `node-miio` to a {@link ModelDefinition}.
 * The first entry of each list is the "off" level: if the device has no such level, {@link UNSUPPORTED_LEVEL} is used (never
 * sent to the device). The fan speeds never have one (-1 is not a real fan speed: 0 is on some models).
 *
 * @param {VacuumMode[]} fanSpeeds The fan speeds
 * @param {VacuumMode[]} waterBoxModes The water levels (empty if not supported)
 * @returns {ModelDefinition} The speed modes
 */
export function fromNodeMiioModes(fanSpeeds: VacuumMode[], waterBoxModes: VacuumMode[]): ModelDefinition {
  const fans = fanTags(fanSpeeds.map(({ name }) => name));
  const speed: ModesWithMiLevel[] = [
    { miLevel: UNSUPPORTED_LEVEL, name: 'Off', tags: [] },
    ...fanSpeeds.map(({ value, name }, index) => ({ miLevel: value, name, tags: fans[index] })),
  ];
  if (waterBoxModes.length === 0) {
    return { speed };
  }

  const off = waterBoxModes.find(({ name }) => OFF_NAMES.has(name.trim().toLowerCase()));
  const levels = waterBoxModes.filter((mode) => mode !== off);
  const waters = waterTags(levels.map(({ name }) => name));
  const waterspeed: ModesWithMiLevel[] = [
    { miLevel: off ? off.value : UNSUPPORTED_LEVEL, name: 'Off', tags: [] },
    ...levels.map(({ value, name }, index) => ({ miLevel: value, name, tags: waters[index] })),
  ];
  return { speed, waterspeed };
}
