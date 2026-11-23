import { findSpeedModes, fromNodeMiioModes } from './find_speed_modes.js';
import { buildCleanModePresets } from './clean_mode_presets.js';

const levels = (presets: ReturnType<typeof buildCleanModePresets>) => presets.map(({ label, miLevels }) => [label, miLevels.vacuum, miLevels.mop]);

describe('buildCleanModePresets', () => {
  test('Roborock with a water box (gen4 + gen1)', () => {
    expect(levels(buildCleanModePresets(findSpeedModes('roborock.vacuum.s6').speed, findSpeedModes('roborock.vacuum.s5e').waterspeed))).toEqual([
      ['Automatic', 102, 202],
      ['Deep clean', 104, 203],
      ['Quiet', 101, 201],
    ]);
  });

  test('ignores the mop-only and custom fan speeds (gen2)', () => {
    expect(levels(buildCleanModePresets(findSpeedModes('roborock.vacuum.s5').speed, findSpeedModes('roborock.vacuum.a10').waterspeed))).toEqual([
      ['Automatic', 60, 202],
      ['Deep clean', 100, 203],
      ['Quiet', 38, 201],
    ]);
  });

  test('no presets without a water box', () => {
    expect(buildCleanModePresets(findSpeedModes('roborock.vacuum.s6').speed, undefined)).toEqual([]);
  });

  test('MIoT: uses the vacuum & mop cleaning type', () => {
    const { speed, waterspeed } = fromNodeMiioModes(
      [
        { value: 0, name: 'Silent' },
        { value: 1, name: 'Basic' },
        { value: 2, name: 'Strong' },
        { value: 3, name: 'Full Speed' },
      ],
      [
        { value: 1, name: 'Level1' },
        { value: 2, name: 'Level2' },
        { value: 3, name: 'Level3' },
      ],
    );
    const presets = buildCleanModePresets(speed, waterspeed, { vacuum: 1, mop: 2, vacuumAndMop: 3 });
    expect(levels(presets)).toEqual([
      ['Automatic', 1, 2],
      ['Deep clean', 3, 3],
      ['Quiet', 0, 1],
    ]);
    expect(presets.every(({ miLevels }) => miLevels.cleaningType === 3)).toBe(true);
  });

  test('MIoT: no presets when the robot cannot vacuum and mop at the same time', () => {
    const { speed, waterspeed } = fromNodeMiioModes([{ value: 0, name: 'Silent' }], [{ value: 1, name: 'Level1' }]);
    expect(buildCleanModePresets(speed, waterspeed, { vacuum: 1, mop: 2 })).toEqual([]);
  });

  test('unknown names are picked by position', () => {
    const { speed, waterspeed } = fromNodeMiioModes(
      [
        { value: 10, name: 'A' },
        { value: 11, name: 'B' },
        { value: 12, name: 'C' },
      ],
      [
        { value: 20, name: 'X' },
        { value: 21, name: 'Y' },
      ],
    );
    expect(levels(buildCleanModePresets(speed, waterspeed))).toEqual([
      ['Automatic', 11, 20],
      ['Deep clean', 12, 21],
      ['Quiet', 10, 20],
    ]);
  });
});
