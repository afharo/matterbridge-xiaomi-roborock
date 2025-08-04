import { speedmodes } from './speedmodes.js';
import { watermodes } from './watermodes.js';

export type SpeedModes = Record<string, ModesHomekitVsMiLevel[]>;

export interface ModesHomekitVsMiLevel {
  homekitTopLevel: number;
  miLevel: number;
  name: string;
}

export interface ModelDefinition {
  speed: (typeof speedmodes)[string];
  waterspeed?: (typeof watermodes)[string];
  firmware?: string;
}
