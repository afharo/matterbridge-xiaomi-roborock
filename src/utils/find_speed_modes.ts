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

/** Labels by (lowercased) mode name ("turbo" is special: see {@link labelFor}) */
const SPEED_LABELS: Record<string, RvcCleanMode.ModeTag> = {
  'quiet': RvcCleanMode.ModeTag.LowNoise,
  'silent': RvcCleanMode.ModeTag.LowNoise,
  'silence': RvcCleanMode.ModeTag.LowNoise,
  'gentle': RvcCleanMode.ModeTag.LowEnergy,
  'soft': RvcCleanMode.ModeTag.LowEnergy,
  'balanced': RvcCleanMode.ModeTag.Min,
  'standard': RvcCleanMode.ModeTag.Min,
  'basic': RvcCleanMode.ModeTag.Min,
  'default': RvcCleanMode.ModeTag.Min,
  'medium': RvcCleanMode.ModeTag.Day,
  'middle': RvcCleanMode.ModeTag.Day,
  'strong': RvcCleanMode.ModeTag.Day,
  'turbo': RvcCleanMode.ModeTag.Day,
  'max': RvcCleanMode.ModeTag.Max,
  'full speed': RvcCleanMode.ModeTag.Max,
  'max+': RvcCleanMode.ModeTag.DeepClean,
  'custom': RvcCleanMode.ModeTag.Vacation,
  'mop': RvcCleanMode.ModeTag.Mop,
  'auto': RvcCleanMode.ModeTag.Auto,
};

const WATER_LABELS: Record<string, RvcCleanMode.ModeTag> = {
  light: RvcCleanMode.ModeTag.Min,
  low: RvcCleanMode.ModeTag.Min,
  level1: RvcCleanMode.ModeTag.Min,
  medium: RvcCleanMode.ModeTag.Day,
  middle: RvcCleanMode.ModeTag.Day,
  level2: RvcCleanMode.ModeTag.Day,
  high: RvcCleanMode.ModeTag.Max,
  level3: RvcCleanMode.ModeTag.Max,
  custom: RvcCleanMode.ModeTag.Vacation,
};

const OFF_NAMES = new Set(['off', 'close', 'closed', 'level0']);

/**
 * Picks a label by name, or by position when the name is unknown (first: low noise, last: max, others: day).
 * "Turbo" is "max" only when it's the fastest speed, "day" otherwise (there's a "Max" after it).
 *
 * @param {Record<string, RvcCleanMode.ModeTag>} labels Labels by name
 * @param {string} name The mode name
 * @param {number} index The position of the mode
 * @param {number} count How many modes there are
 * @returns {RvcCleanMode.ModeTag} The label
 */
function labelFor(labels: Record<string, RvcCleanMode.ModeTag>, name: string, index: number, count: number): RvcCleanMode.ModeTag {
  const key = name.trim().toLowerCase();
  // "Turbo" is the fastest speed of some robots (Viomi, Dreame), and the one before "Max" of the others
  if (labels === SPEED_LABELS && key === 'turbo' && index === count - 1) return RvcCleanMode.ModeTag.Max;
  const label = labels[key];
  if (label !== undefined) return label;
  if (index === 0) return labels === SPEED_LABELS ? RvcCleanMode.ModeTag.LowNoise : RvcCleanMode.ModeTag.Min;
  if (index === count - 1) return RvcCleanMode.ModeTag.Max;
  return RvcCleanMode.ModeTag.Day;
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
  const speed: ModesWithMiLevel[] = [
    { miLevel: UNSUPPORTED_LEVEL, name: 'Off', label: RvcCleanMode.ModeTag.Vacuum },
    ...fanSpeeds.map(({ value, name }, index) => ({ miLevel: value, name, label: labelFor(SPEED_LABELS, name, index, fanSpeeds.length) })),
  ];
  if (waterBoxModes.length === 0) {
    return { speed };
  }

  const off = waterBoxModes.find(({ name }) => OFF_NAMES.has(name.trim().toLowerCase()));
  const levels = waterBoxModes.filter((mode) => mode !== off);
  const waterspeed: ModesWithMiLevel[] = [
    { miLevel: off ? off.value : UNSUPPORTED_LEVEL, name: 'Off', label: RvcCleanMode.ModeTag.Mop },
    ...levels.map(({ value, name }, index) => ({ miLevel: value, name, label: labelFor(WATER_LABELS, name, index, levels.length) })),
  ];
  return { speed, waterspeed };
}
