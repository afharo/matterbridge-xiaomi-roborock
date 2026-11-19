import { jest } from '@jest/globals';
import type { ErrorChangedEvent, VacuumDevice } from 'node-miio';
import { Subject } from 'rxjs';

import type { DeviceManager, StateChangedEvent } from './services/device_manager.js';
import { miio, type MiioDeviceMock } from './test.mocks.js';
import * as originalFindSpeedModesModule from './utils/find_speed_modes.js';
import { findSpeedModes as originalFindSpeedModes } from './utils/find_speed_modes.js';

type PublicMethodsOf<T> = { [K in keyof T]: T[K] };

interface ObservableProps {
  /** The vacuum is only partially mocked (see `MiioDeviceMock`) */
  device: MiioDeviceMock;
  deviceConnected$: Subject<VacuumDevice>;
  stateChanged$: Subject<StateChangedEvent>;
  errorChanged$: Subject<ErrorChangedEvent>;
}

export const deviceManagerMock: jest.Mocked<PublicMethodsOf<Omit<DeviceManager, keyof ObservableProps>>> & ObservableProps = {
  device: miio.device,
  deviceConnected$: new Subject<VacuumDevice>(),
  ensureDevice: jest.fn(),
  errorChanged$: new Subject<ErrorChangedEvent>(),
  isCleaning: false,
  isPaused: false,
  model: miio.device.miioModel as string,
  property: miio.device.property,
  state: 'charging',
  stateChanged$: new Subject<StateChangedEvent>(),
  stop: jest.fn(),
};

jest.unstable_mockModule('./services/device_manager.js', () => {
  return { DeviceManager: jest.fn(() => deviceManagerMock) };
});

export const findSpeedModesMock = jest.fn(originalFindSpeedModes);
jest.unstable_mockModule('./utils/find_speed_modes.js', () => {
  return {
    ...originalFindSpeedModesModule,
    findSpeedModes: findSpeedModesMock,
    resolveSpeedModes: jest.fn(async (_device: unknown, model: string, firmware?: string) => findSpeedModesMock(model, firmware)),
  };
});
