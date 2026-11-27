import { jest } from '@jest/globals';
import type { Vacuum } from 'node-miio';
// node-miio's pure function (its own module: importing `node-miio` itself would load the real network layer)
// eslint-disable-next-line n/no-missing-import -- it exists: the rule doesn't resolve deep imports of node-miio
import { isCleaningState } from 'node-miio/dist/lib/devices/vacuums/vacuum_states.js';

// ============= MIIO MOCKS ================
/** The members of a node-miio vacuum that the plugin uses (the Roborock `Vacuum` has all of them) */
type MockedMembers =
  | 'call'
  | 'activateCharging'
  | 'activateCleaning'
  | 'deactivateCleaning'
  | 'batteryLevel'
  | 'changeFanSpeed'
  | 'cleanRooms'
  | 'cleanZones'
  | 'fanSpeed'
  | 'find'
  | 'getDeviceInfo'
  | 'getRoomMap'
  | 'getSerialNumber'
  | 'getTimer'
  | 'getWaterBoxMode'
  | 'pause'
  | 'resumeCleanRooms'
  | 'sendToLocation'
  | 'setRawProperty'
  | 'setWaterBoxMode'
  | 'startDustCollection'
  | 'stopDustCollection'
  | 'matches'
  | 'destroy'
  | 'property'
  | 'on'
  | 'poll'
  | 'state';

export type MiioDeviceMock = jest.Mocked<Pick<Vacuum, MockedMembers>> & {
  miioModel: string;
  connected: boolean;
  properties: Record<string, unknown>;
  /** Class-specific: set by the tests that need them (legacy Roborock / MIoT) */
  getMaps?: jest.Mocked<Vacuum>['getMaps'];
  setCleaningType?: jest.Mock<(type: number) => Promise<void>>;
};

const miioDevice: MiioDeviceMock = {
  miioModel: 'test-model',
  connected: true,
  call: jest.fn() as MiioDeviceMock['call'],
  activateCharging: jest.fn(),
  activateCleaning: jest.fn(),
  deactivateCleaning: jest.fn(),
  batteryLevel: jest.fn(),
  changeFanSpeed: jest.fn(),
  cleanRooms: jest.fn(),
  cleanZones: jest.fn(),
  fanSpeed: jest.fn(),
  find: jest.fn(),
  getDeviceInfo: jest.fn(),
  getRoomMap: jest.fn(),
  getSerialNumber: jest.fn(),
  getTimer: jest.fn(),
  getWaterBoxMode: jest.fn(),
  pause: jest.fn(),
  properties: {},
  resumeCleanRooms: jest.fn(),
  sendToLocation: jest.fn(),
  setRawProperty: jest.fn(),
  setWaterBoxMode: jest.fn(),
  startDustCollection: jest.fn(),
  stopDustCollection: jest.fn(),
  matches: jest.fn(),
  destroy: jest.fn(),
  property: jest.fn() as MiioDeviceMock['property'],
  on: jest.fn() as MiioDeviceMock['on'],
  poll: jest.fn(),
  state: jest.fn().mockReturnValue({}) as MiioDeviceMock['state'],
};

export const miio = {
  device: miioDevice,
  createMock: () => ({
    device: jest.fn().mockImplementation(() => miioDevice),
    configureLogging: jest.fn(),
    isCleaningState,
    // Same logic as node-miio's
    isVacuum: (device: unknown) => typeof (device as { matches?: unknown })?.matches === 'function' && (device as MiioDeviceMock).matches('type:vacuum'),
  }),
};
