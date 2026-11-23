import type { RvcCleanMode } from 'matterbridge/matter/clusters';

export interface ModesWithMiLevel {
  miLevel: number;
  name: string;
  /** Its Matter clean mode tags, besides Vacuum / Mop (see `fanTags` / `waterTags`) */
  tags: RvcCleanMode.ModeTag[];
}

/** A robot's fan speeds and water levels, with their Matter clean mode tags (see `findSpeedModes`) */
export interface ModelDefinition {
  speed: ModesWithMiLevel[];
  waterspeed?: ModesWithMiLevel[];
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
