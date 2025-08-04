import { Socket } from 'node:net';

import { jest } from '@jest/globals';
import { MiioDevice } from 'miio';

// ============= MIIO MOCKS ================
const miioDevice: jest.Mocked<MiioDevice> = {
  miioModel: 'test-model',
  call: jest.fn() as jest.MockedFunction<MiioDevice['call']>,
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
  properties: jest.fn<() => Record<string, unknown>>()(),
  resumeCleanRooms: jest.fn(),
  sendToLocation: jest.fn(),
  setRawProperty: jest.fn(),
  setWaterBoxMode: jest.fn(),
  startDustCollection: jest.fn(),
  stopDustCollection: jest.fn(),
  matches: jest.fn(),
  destroy: jest.fn(),
  property: jest.fn() as jest.MockedFunction<MiioDevice['property']>,
  on: jest.fn() as jest.MockedFunction<MiioDevice['on']>,
  handle: { api: { parent: { socket: {} as unknown as jest.Mocked<Socket> } } },
  poll: jest.fn(),
  state: jest.fn().mockReturnValue({}) as jest.MockedFunction<MiioDevice['state']>,
};

export const miio = {
  device: miioDevice,
  createMock: () => ({
    device: jest.fn().mockImplementation(() => miioDevice),
  }),
};
