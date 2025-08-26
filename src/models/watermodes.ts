import { RvcCleanMode } from 'matterbridge/matter/clusters';

import type { SpeedModes } from './types.js';

export const watermodes: SpeedModes = {
  // S5-Max (https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum/issues/79#issuecomment-576246934)
  'gen1': [
    // Off
    {
      miLevel: 200,
      name: 'Off',
      label: RvcCleanMode.ModeTag.Mop, // Just setting anything. It doesn't "matter" (pun intended).
    },
    // "Light"
    {
      miLevel: 201,
      name: 'Light',
      label: RvcCleanMode.ModeTag.Min,
    },
    // "Medium"
    {
      miLevel: 202,
      name: 'Medium',
      label: RvcCleanMode.ModeTag.Day,
    },
    // "High"
    {
      miLevel: 203,
      name: 'High',
      label: RvcCleanMode.ModeTag.Max,
    },
  ],
  // S6-MaxV + Custom
  'gen1+custom': [
    // Off
    {
      miLevel: 200,
      name: 'Off',
      label: RvcCleanMode.ModeTag.Mop, // Just setting anything. It doesn't "matter" (pun intended).
    },
    // "Light"
    {
      miLevel: 201,
      name: 'Light',
      label: RvcCleanMode.ModeTag.Min,
    },
    // "Medium"
    {
      miLevel: 202,
      name: 'Medium',
      label: RvcCleanMode.ModeTag.Day,
    },
    // "High"
    {
      miLevel: 203,
      name: 'High',
      label: RvcCleanMode.ModeTag.Max,
    },
    // "Custom"
    {
      miLevel: 204,
      name: 'Custom',
      label: RvcCleanMode.ModeTag.Vacation,
    },
  ],
  // Dreame
  'dreame': [
    // Off
    {
      miLevel: 0,
      name: 'Off',
      label: RvcCleanMode.ModeTag.Mop, // Just setting anything. It doesn't "matter" (pun intended).
    },
    // "Light"
    {
      miLevel: 1,
      name: 'Light',
      label: RvcCleanMode.ModeTag.Min,
    },
    // "Medium"
    {
      miLevel: 2,
      name: 'Medium',
      label: RvcCleanMode.ModeTag.Day,
    },
    // "High"
    {
      miLevel: 3,
      name: 'High',
      label: RvcCleanMode.ModeTag.Max,
    },
  ],
};
