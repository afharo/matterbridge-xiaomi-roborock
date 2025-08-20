import { RvcCleanMode } from 'matterbridge/matter/clusters';

import type { SpeedModes } from './types.js';

const SPEEDMODES: SpeedModes = {
  'gen1': [
    // 0%      = Off / Aus
    {
      miLevel: -1,
      name: 'Off',
      label: RvcCleanMode.ModeTag.Vacuum, // Just setting anything. It doesn't "matter" (pun intended).
    },
    // 0-25%  = "Quiet / Leise"
    {
      miLevel: 38,
      name: 'Quiet',
      label: RvcCleanMode.ModeTag.LowNoise,
    },
    // 26-50%  = "Balanced / Standard"
    {
      miLevel: 60,
      name: 'Balanced',
      label: RvcCleanMode.ModeTag.Auto,
    },
    // 51-75%  = "Turbo / Stark"
    {
      miLevel: 77,
      name: 'Turbo',
      label: RvcCleanMode.ModeTag.Day,
    },
    // 76-100% = "Full Speed / Max Speed / Max"
    {
      miLevel: 90,
      name: 'Max',
      label: RvcCleanMode.ModeTag.Max,
    },
  ],
  'gen2': [
    // 0%      = Off / Aus
    {
      miLevel: -1,
      name: 'Off',
      label: RvcCleanMode.ModeTag.Vacuum, // Just setting anything. It doesn't "matter" (pun intended).
    },
    // 1-20%   = "Mop / Mopping / Nur wischen"
    {
      miLevel: 105,
      name: 'Mop',
      label: RvcCleanMode.ModeTag.Mop,
    },
    // 21-40%  = "Quiet / Leise"
    {
      miLevel: 38,
      name: 'Quiet',
      label: RvcCleanMode.ModeTag.LowNoise,
    },
    // 41-60%  = "Balanced / Standard"
    {
      miLevel: 60,
      name: 'Balanced',
      label: RvcCleanMode.ModeTag.Auto,
    },
    // 61-80%  = "Turbo / Stark"
    {
      miLevel: 75,
      name: 'Turbo',
      label: RvcCleanMode.ModeTag.Day,
    },
    // 81-100% = "Full Speed / Max Speed / Max"
    {
      miLevel: 100,
      name: 'Max',
      label: RvcCleanMode.ModeTag.Max,
    },
  ],
  'gen2-no_mop': [
    // 0%      = Off / Aus
    {
      miLevel: -1,
      name: 'Off',
      label: RvcCleanMode.ModeTag.Vacuum, // Just setting anything. It doesn't "matter" (pun intended).
    },
    // 0-25%  = "Quiet / Leise"
    {
      miLevel: 38,
      name: 'Quiet',
      label: RvcCleanMode.ModeTag.LowNoise,
    },
    // 26-50%  = "Balanced / Standard"
    {
      miLevel: 60,
      name: 'Balanced',
      label: RvcCleanMode.ModeTag.Auto,
    },
    // 51-75%  = "Turbo / Stark"
    {
      miLevel: 75,
      name: 'Turbo',
      label: RvcCleanMode.ModeTag.Day,
    },
    // 76-100% = "Full Speed / Max Speed / Max"
    {
      miLevel: 100,
      name: 'Max',
      label: RvcCleanMode.ModeTag.Max,
    },
  ],
  'xiaowa-e202-02': [
    // 0%      = Off / Aus
    {
      miLevel: -1,
      name: 'Off',
      label: RvcCleanMode.ModeTag.Vacuum, // Just setting anything. It doesn't "matter" (pun intended).
    },
    // 0-20%  = "Gentle"
    {
      miLevel: 41,
      name: 'Gentle',
      label: RvcCleanMode.ModeTag.LowEnergy,
    },
    // 20-40%  = "Silent"
    {
      miLevel: 50,
      name: 'Silent',
      label: RvcCleanMode.ModeTag.LowNoise,
    },
    // 40-60%  = "Balanced / Standard"
    {
      miLevel: 68,
      name: 'Balanced',
      label: RvcCleanMode.ModeTag.Auto,
    },
    // 60-80%  = "Turbo / Stark"
    {
      miLevel: 79,
      name: 'Turbo',
      label: RvcCleanMode.ModeTag.Day,
    },
    // 80-100% = "Full Speed / Max Speed / Max"
    {
      miLevel: 100,
      name: 'Max',
      label: RvcCleanMode.ModeTag.Max,
    },
  ],
  'gen3': [
    // 0%      = Off / Aus
    {
      miLevel: -1,
      name: 'Off',
      label: RvcCleanMode.ModeTag.Vacuum, // Just setting anything. It doesn't "matter" (pun intended).
    },
    // 1-25%   = "Quiet / Leise"
    {
      miLevel: 101,
      name: 'Quiet',
      label: RvcCleanMode.ModeTag.LowNoise,
    },
    // 26-50%  = "Balanced / Standard"
    {
      miLevel: 102,
      name: 'Balanced',
      label: RvcCleanMode.ModeTag.Auto,
    },
    // 51-75%  = "Turbo / Stark"
    {
      miLevel: 103,
      name: 'Turbo',
      label: RvcCleanMode.ModeTag.Day,
    },
    // 76-100% = "Full Speed / Max Speed / Max"
    {
      miLevel: 104,
      name: 'Max',
      label: RvcCleanMode.ModeTag.Max,
    },
  ],
  // S5-Max (https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum/issues/79#issuecomment-576246934)
  'gen4': [
    // 0%      = Off / Aus
    {
      miLevel: -1,
      name: 'Off',
      label: RvcCleanMode.ModeTag.Vacuum, // Just setting anything. It doesn't "matter" (pun intended).
    },
    // 1-20%   = "Soft"
    {
      miLevel: 105,
      name: 'Soft',
      label: RvcCleanMode.ModeTag.LowEnergy,
    },
    // 21-40%   = "Quiet / Leise"
    {
      miLevel: 101,
      name: 'Quiet',
      label: RvcCleanMode.ModeTag.LowNoise,
    },
    // 41-60%  = "Balanced / Standard"
    {
      miLevel: 102,
      name: 'Balanced',
      label: RvcCleanMode.ModeTag.Auto,
    },
    // 61-80%  = "Turbo / Stark"
    {
      miLevel: 103,
      name: 'Turbo',
      label: RvcCleanMode.ModeTag.Day,
    },
    // 81-100% = "Full Speed / Max Speed / Max"
    {
      miLevel: 104,
      name: 'Max',
      label: RvcCleanMode.ModeTag.Max,
    },
  ],
  // S5-Max + Custom (https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum/issues/110)
  'gen4+custom': [
    // 0%      = Off / Aus
    {
      miLevel: -1,
      name: 'Off',
      label: RvcCleanMode.ModeTag.Vacuum, // Just setting anything. It doesn't "matter" (pun intended).
    },
    // 1-16%   = "Soft"
    {
      miLevel: 105,
      name: 'Soft',
      label: RvcCleanMode.ModeTag.LowEnergy,
    },
    // 17-32%   = "Quiet / Leise"
    {
      miLevel: 101,
      name: 'Quiet',
      label: RvcCleanMode.ModeTag.LowNoise,
    },
    // 33-48%  = "Balanced / Standard"
    {
      miLevel: 102,
      name: 'Balanced',
      label: RvcCleanMode.ModeTag.Auto,
    },
    // 49-64%  = "Turbo / Stark"
    {
      miLevel: 103,
      name: 'Turbo',
      label: RvcCleanMode.ModeTag.Day,
    },
    // 65-80% = "Full Speed / Max Speed / Max"
    {
      miLevel: 104,
      name: 'Max',
      label: RvcCleanMode.ModeTag.Max,
    },
    // 81-100% = "Custom"
    {
      miLevel: 106,
      name: 'Custom',
      label: RvcCleanMode.ModeTag.Vacation,
    },
  ],
  // S7 MaxV
  'gen5': [
    // Off
    {
      miLevel: -1,
      name: 'Off',
      label: RvcCleanMode.ModeTag.Vacuum, // Just setting anything. It doesn't "matter" (pun intended).
    },
    // 0-16%   = "Quiet"
    {
      miLevel: 101,
      name: 'Quiet',
      label: RvcCleanMode.ModeTag.LowNoise,
    },
    // 17-32%   = "Balanced"
    {
      miLevel: 102,
      name: 'Balanced',
      label: RvcCleanMode.ModeTag.Auto,
    },
    // 33-49%  = "Turbo"
    {
      miLevel: 103,
      name: 'Turbo',
      label: RvcCleanMode.ModeTag.Day,
    },
    // 50-66%  = "Max"
    {
      miLevel: 104,
      name: 'Max',
      label: RvcCleanMode.ModeTag.Max,
    },
    // 67-82% = "Max+"
    {
      miLevel: 108,
      name: 'Max+',
      label: RvcCleanMode.ModeTag.DeepClean,
    },
    // 83-100% = "Custom"
    {
      miLevel: 106,
      name: 'Custom',
      label: RvcCleanMode.ModeTag.Vacation,
    },
  ],

  // From https://github.com/rytilahti/python-miio/blob/20f915c9589fed55544a5417abe3fd3d9e12d08d/miio/viomivacuum.py#L16-L20
  'viomi': [
    // 0%      = Off / Aus
    {
      miLevel: -1,
      name: 'Off',
      label: RvcCleanMode.ModeTag.Vacuum, // Just setting anything. It doesn't "matter" (pun intended).
    },
    // 25%      = Silent
    {
      miLevel: 0,
      name: 'Silent',
      label: RvcCleanMode.ModeTag.LowNoise,
    },
    // 50%      = Standard
    {
      miLevel: 1,
      name: 'Standard',
      label: RvcCleanMode.ModeTag.Auto,
    },
    // 75%      = Medium
    {
      miLevel: 2,
      name: 'Medium',
      label: RvcCleanMode.ModeTag.Day,
    },
    // 100%      = Turbo
    {
      miLevel: 3,
      name: 'Turbo',
      label: RvcCleanMode.ModeTag.Max,
    },
  ],
};

export const speedmodes = SPEEDMODES;
