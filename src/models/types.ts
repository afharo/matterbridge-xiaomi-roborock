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
}
