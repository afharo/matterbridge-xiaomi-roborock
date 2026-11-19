import { jest } from '@jest/globals';
import { RvcCleanMode } from 'matterbridge/matter/clusters';
import type { MiioDevice } from 'node-miio';

import { MODELS } from '../models/models.js';

import { classifyCleaningTypes, findSpeedModes, fromNodeMiioModes, isSupportedLevel, resolveSpeedModes, UNSUPPORTED_LEVEL } from './find_speed_modes.js';

describe('findSpeedModes', () => {
  test("should assign the viomi model for any model starting with 'viomi.'", () => {
    expect(findSpeedModes('viomi.one')).toStrictEqual(MODELS.viomi[0]);
    expect(findSpeedModes('viomi.two')).toStrictEqual(MODELS.viomi[0]);
    expect(findSpeedModes('viomi.vacuum.v8')).toStrictEqual(MODELS['viomi.vacuum.v8'][0]);
  });

  test('Dreame models', () => {
    expect(findSpeedModes('dreame.vacuum.one')).toStrictEqual(MODELS.dreame[0]);
    expect(findSpeedModes('dreame.vacuum.mc1808')).toStrictEqual(MODELS['dreame.vacuum.mc1808'][0]);
  });

  test('should return the default model for unlisted models', () => {
    expect(findSpeedModes('random-model')).toStrictEqual(MODELS.default[0]);
  });

  test('should return a known model in the list', () => {
    expect(findSpeedModes('roborock.vacuum.s5')).toStrictEqual(MODELS['roborock.vacuum.s5'][0]);
  });

  test('should apply the firmware version to choose a different set of speeds', () => {
    expect(findSpeedModes('roborock.vacuum.s5', '3.5.7')).toStrictEqual(MODELS['roborock.vacuum.s5'][1]);
  });
});

describe('resolveSpeedModes', () => {
  const device = (fanSpeeds?: Array<{ value: number; name: string }>, waterBoxModes?: Array<{ value: number; name: string }>) =>
    ({
      fanSpeeds: fanSpeeds && jest.fn(async () => fanSpeeds),
      waterBoxModes: waterBoxModes && jest.fn(async () => waterBoxModes),
    }) as unknown as MiioDevice;

  test('models listed in MODELS keep the local definitions', async () => {
    const d = device([{ value: 1, name: 'Ignored' }]);
    await expect(resolveSpeedModes(d, 'roborock.vacuum.s5', '3.5.7')).resolves.toStrictEqual(MODELS['roborock.vacuum.s5'][1]);
    expect(d.fanSpeeds).not.toHaveBeenCalled();
  });

  test('falls back to findSpeedModes when node-miio does not provide the modes (older versions)', async () => {
    await expect(resolveSpeedModes(device(), 'xiaomi.vacuum.d110ch')).resolves.toStrictEqual(MODELS.default[0]);
  });

  test('falls back to findSpeedModes when node-miio reports no fan speeds', async () => {
    await expect(resolveSpeedModes(device([]), 'xiaomi.vacuum.d110ch')).resolves.toStrictEqual(MODELS.default[0]);
  });

  test('falls back to findSpeedModes when node-miio fails', async () => {
    const d = { fanSpeeds: jest.fn(async () => Promise.reject(new Error('boom'))) } as unknown as MiioDevice;
    await expect(resolveSpeedModes(d, 'dreame.vacuum.p2008')).resolves.toStrictEqual(MODELS.dreame[0]);
  });

  test('uses the modes reported by node-miio for other models (e.g. MIoT)', async () => {
    const modes = await resolveSpeedModes(
      device(
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
      ),
      'xiaomi.vacuum.d110ch',
    );
    expect(modes.speed.map(({ miLevel, name, label }) => [miLevel, name, label])).toStrictEqual([
      [UNSUPPORTED_LEVEL, 'Off', RvcCleanMode.ModeTag.Vacuum],
      [0, 'Silent', RvcCleanMode.ModeTag.LowNoise],
      [1, 'Basic', RvcCleanMode.ModeTag.Min],
      [2, 'Strong', RvcCleanMode.ModeTag.Day],
      [3, 'Full Speed', RvcCleanMode.ModeTag.Max],
    ]);
    // No "Off" water level: it can't be turned off
    expect(modes.waterspeed?.map(({ miLevel, name, label }) => [miLevel, name, label])).toStrictEqual([
      [UNSUPPORTED_LEVEL, 'Off', RvcCleanMode.ModeTag.Mop],
      [1, 'Level1', RvcCleanMode.ModeTag.Min],
      [2, 'Level2', RvcCleanMode.ModeTag.Day],
      [3, 'Level3', RvcCleanMode.ModeTag.Max],
    ]);
  });
});

describe('fromNodeMiioModes', () => {
  test('uses the "Off" water level when available', () => {
    const { waterspeed } = fromNodeMiioModes(
      [{ value: 1, name: 'Quiet' }],
      [
        { value: 200, name: 'Off' },
        { value: 201, name: 'Light' },
      ],
    );
    expect(waterspeed?.map(({ miLevel, name }) => [miLevel, name])).toStrictEqual([
      [200, 'Off'],
      [201, 'Light'],
    ]);
  });

  test('labels unknown names by position', () => {
    const { speed } = fromNodeMiioModes(
      [
        { value: 0, name: 'Whisper' },
        { value: 1, name: 'Normal-ish' },
        { value: 2, name: 'Hurricane' },
      ],
      [],
    );
    expect(speed.slice(1).map(({ label }) => label)).toStrictEqual([RvcCleanMode.ModeTag.LowNoise, RvcCleanMode.ModeTag.Day, RvcCleanMode.ModeTag.Max]);
  });

  test('no water levels', () => {
    expect(fromNodeMiioModes([{ value: 1, name: 'Quiet' }], []).waterspeed).toBeUndefined();
  });
});

describe('isSupportedLevel', () => {
  test.each([
    [0, true],
    [105, true],
    [-1, true],
    [UNSUPPORTED_LEVEL, false],
    [undefined, false],
  ])('%p → %p', (level, expected) => {
    expect(isSupportedLevel(level)).toBe(expected);
  });
});

describe('classifyCleaningTypes', () => {
  test('MIoT sweep-mop-type', () => {
    expect(
      classifyCleaningTypes([
        { value: 1, name: 'Sweep' },
        { value: 2, name: 'Mop' },
        { value: 3, name: 'Sweep Mop' },
        { value: 4, name: 'Sweep Before Mopping' },
      ]),
    ).toStrictEqual({ vacuum: 1, mop: 2, vacuumAndMop: 3, vacuumThenMop: 4 });
  });

  test('MIoT mode used as cleaning type (ijai)', () => {
    expect(
      classifyCleaningTypes([
        { value: 0, name: 'Sweep' },
        { value: 1, name: 'Sweep And Mop' },
        { value: 2, name: 'Mop' },
      ]),
    ).toStrictEqual({ vacuum: 0, vacuumAndMop: 1, mop: 2 });
  });

  test('ignores unknown names', () => {
    expect(classifyCleaningTypes([{ value: 5, name: 'Custom' }])).toStrictEqual({});
  });
});

describe('resolveSpeedModes with cleaning types', () => {
  test('includes the cleaning types reported by node-miio', async () => {
    const device = {
      fanSpeeds: jest.fn(async () => [{ value: 0, name: 'Silent' }]),
      waterBoxModes: jest.fn(async () => [{ value: 1, name: 'Level1' }]),
      cleaningTypes: jest.fn(async () => [
        { value: 1, name: 'Sweep' },
        { value: 4, name: 'Sweep Before Mopping' },
      ]),
    } as unknown as MiioDevice;
    await expect(resolveSpeedModes(device, 'xiaomi.vacuum.d110ch')).resolves.toMatchObject({
      cleaningTypes: { vacuum: 1, vacuumThenMop: 4 },
    });
  });

  test('omits them when the device does not report any', async () => {
    const device = {
      fanSpeeds: jest.fn(async () => [{ value: 0, name: 'Silent' }]),
      cleaningTypes: jest.fn(async () => []),
    } as unknown as MiioDevice;
    expect(await resolveSpeedModes(device, 'xiaomi.vacuum.x')).not.toHaveProperty('cleaningTypes');
  });
});
