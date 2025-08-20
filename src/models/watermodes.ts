import { RvcCleanMode } from 'matterbridge/matter/clusters';

import type { SpeedModes } from './types.js';

export const watermodes: SpeedModes = {
  // S5-Max (https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum/issues/79#issuecomment-576246934)
  'gen1': [
    // 0%      = Off
    {
      homekitTopLevel: 0,
      miLevel: 200,
      name: 'Off',
      label: RvcCleanMode.ModeTag.Mop, // Just setting anything. It doesn't "matter" (pun intended).
    },
    // 1-35%   = "Light"
    {
      homekitTopLevel: 35,
      miLevel: 201,
      name: 'Light',
      label: RvcCleanMode.ModeTag.Min,
    },
    // 36-70%  = "Medium"
    {
      homekitTopLevel: 70,
      miLevel: 202,
      name: 'Medium',
      label: RvcCleanMode.ModeTag.Day,
    },
    // 71-100% = "High"
    {
      homekitTopLevel: 100,
      miLevel: 203,
      name: 'High',
      label: RvcCleanMode.ModeTag.Max,
    },
  ],
  // S6-MaxV + Custom
  'gen1+custom': [
    // 0%      = Off
    {
      homekitTopLevel: 0,
      miLevel: 200,
      name: 'Off',
      label: RvcCleanMode.ModeTag.Mop, // Just setting anything. It doesn't "matter" (pun intended).
    },
    // 1-25%   = "Light"
    {
      homekitTopLevel: 25,
      miLevel: 201,
      name: 'Light',
      label: RvcCleanMode.ModeTag.Min,
    },
    // 26-50%  = "Medium"
    {
      homekitTopLevel: 50,
      miLevel: 202,
      name: 'Medium',
      label: RvcCleanMode.ModeTag.Day,
    },
    // 51-75% = "High"
    {
      homekitTopLevel: 75,
      miLevel: 203,
      name: 'High',
      label: RvcCleanMode.ModeTag.Max,
    },
    // 76-100% = "Custom"
    {
      homekitTopLevel: 100,
      miLevel: 204,
      name: 'Custom',
      label: RvcCleanMode.ModeTag.Vacation,
    },
  ],
};
