import { vi, type Mock, type Mocked } from 'vitest';
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

export type MiioDeviceMock = Mocked<Pick<Vacuum, MockedMembers>> & {
  miioModel: string;
  connected: boolean;
  properties: Record<string, unknown>;
  /** Class-specific: set by the tests that need them (legacy Roborock / MIoT) */
  getMaps?: Mocked<Vacuum>['getMaps'];
  setCleaningType?: Mock<(type: number) => Promise<void>>;
};

const miioDevice: MiioDeviceMock = {
  miioModel: 'test-model',
  connected: true,
  call: vi.fn() as MiioDeviceMock['call'],
  activateCharging: vi.fn(),
  activateCleaning: vi.fn(),
  deactivateCleaning: vi.fn(),
  batteryLevel: vi.fn(),
  changeFanSpeed: vi.fn(),
  cleanRooms: vi.fn(),
  cleanZones: vi.fn(),
  fanSpeed: vi.fn(),
  find: vi.fn(),
  getDeviceInfo: vi.fn(),
  getRoomMap: vi.fn(),
  getSerialNumber: vi.fn(),
  getTimer: vi.fn(),
  getWaterBoxMode: vi.fn(),
  pause: vi.fn(),
  properties: {},
  resumeCleanRooms: vi.fn(),
  sendToLocation: vi.fn(),
  setRawProperty: vi.fn(),
  setWaterBoxMode: vi.fn(),
  startDustCollection: vi.fn(),
  stopDustCollection: vi.fn(),
  matches: vi.fn(),
  destroy: vi.fn(),
  property: vi.fn() as MiioDeviceMock['property'],
  on: vi.fn() as MiioDeviceMock['on'],
  poll: vi.fn(),
  state: vi.fn().mockReturnValue({}) as MiioDeviceMock['state'],
};

export const miio = {
  device: miioDevice,
  createMock: () => ({
    device: vi.fn().mockImplementation(() => miioDevice),
    configureLogging: vi.fn(),
    isCleaningState,
    // Same logic as node-miio's
    isVacuum: (device: unknown) => typeof (device as { matches?: unknown })?.matches === 'function' && (device as MiioDeviceMock).matches('type:vacuum'),
  }),
};
