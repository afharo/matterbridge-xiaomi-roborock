import { RvcOperationalState } from 'matterbridge/matter/clusters';
import { VACUUM_STATES } from 'node-miio';

import { toAuxiliaryOperationalState, toErrorStateId } from './rvc_mappings.js';

const { ErrorState, OperationalState } = RvcOperationalState;

describe('toErrorStateId', () => {
  test.each([
    [1, ErrorState.NavigationSensorObscured],
    [5, ErrorState.BrushJammed],
    [7, ErrorState.WheelsJammed],
    [8, ErrorState.Stuck],
    [9, ErrorState.DustBinMissing],
    [12, ErrorState.LowBattery],
    [19, ErrorState.FailedToFindChargingDock],
    [24, ErrorState.CannotReachTargetArea],
    [254, ErrorState.DustBinFull],
    [18, ErrorState.UnableToCompleteOperation], // Suction fan failure: no equivalent
  ])('Roborock error %p → %p', (code, expected) => {
    expect(toErrorStateId('roborock.vacuum.s5', { id: code, description: 'ignored' })).toBe(expected);
  });

  test.each([
    ['Wheels are stuck', ErrorState.WheelsJammed],
    ['Main brush entangled', ErrorState.BrushJammed],
    ['Dust box not installed', ErrorState.DustBinMissing],
    ['Dust bin full', ErrorState.DustBinFull],
    ['Clean water tank empty', ErrorState.WaterTankEmpty],
    ['Insufficient water in water tank', ErrorState.WaterTankEmpty],
    ['Water tank is not installed', ErrorState.WaterTankMissing],
    ['Dirty water tank full', ErrorState.DirtyWaterTankFull],
    ['Mop is not installed', ErrorState.MopCleaningPadMissing],
    ['Low battery', ErrorState.LowBattery],
    ['Robot trapped', ErrorState.Stuck],
    ['Cliff sensor error', ErrorState.NavigationSensorObscured],
    ['Could not return to dock', ErrorState.FailedToFindChargingDock],
    ['Entered a no-go zone', ErrorState.CannotReachTargetArea],
    ['Unknown error 42', ErrorState.UnableToCompleteOperation],
  ])('message %p → %p', (message, expected) => {
    expect(toErrorStateId('xiaomi.vacuum.d110ch', { id: 99, description: message })).toBe(expected);
  });

  test('uses the message for Roborock codes that are not in the table', () => {
    expect(toErrorStateId('roborock.vacuum.s5', { id: 999, description: 'Wheel blocked' })).toBe(ErrorState.WheelsJammed);
  });

  test('handles errors without a message', () => {
    expect(toErrorStateId('viomi.vacuum.v8', { id: 501 })).toBe(ErrorState.UnableToCompleteOperation);
  });
});

describe('toAuxiliaryOperationalState', () => {
  test.each([
    ['emptying-dust-bin', OperationalState.EmptyingDustBin],
    ['cleaning-mop', OperationalState.CleaningMop],
    ['filling-water-tank', OperationalState.FillingWaterTank],
    ['updating-maps', OperationalState.UpdatingMaps],
    ['running', undefined],
    [undefined, undefined],
  ] as const)('%p → %p', (activity, expected) => {
    expect(toAuxiliaryOperationalState(activity)).toBe(expected);
  });

  // Every state node-miio can report is handled: by the accessory's switch, or here
  test.each(Object.entries(VACUUM_STATES))('%s (%s) is translated', (_state, activity) => {
    const handled = ['stopped', 'running', 'paused', 'returning', 'charging', 'docked', 'error'];
    expect(handled.includes(activity) || toAuxiliaryOperationalState(activity) !== undefined).toBe(true);
  });
});
