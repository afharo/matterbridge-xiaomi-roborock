import { RvcCleanMode } from 'matterbridge/matter/clusters';

import { speedmodes } from './speedmodes.js';
import { watermodes } from './watermodes.js';

export type SpeedModes = Record<string, ModesWithMiLevel[]>;

export interface ModesWithMiLevel {
  miLevel: number;
  name: string;
  label: RvcCleanMode.ModeTag;
}

export interface ModelDefinition {
  speed: (typeof speedmodes)[string];
  waterspeed?: (typeof watermodes)[string];
  firmware?: string;
  /** The values of the cleaning types reported by node-miio (MIoT only) */
  cleaningTypes?: CleaningTypes;
}

/** Values to send with `setCleaningType()` for each kind of cleaning (only the ones the device supports) */
export interface CleaningTypes {
  vacuum?: number;
  mop?: number;
  vacuumAndMop?: number;
  vacuumThenMop?: number;
}
