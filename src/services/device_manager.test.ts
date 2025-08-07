import './device_manager.test.mock.js';
import { jest } from '@jest/globals';
import { firstValueFrom } from 'rxjs';

import { getLoggerMock } from '../utils/logger.mock.js';
import { miio } from '../test.mocks.js';

import type { DeviceManager as IDeviceManager } from './device_manager.js';

describe('DeviceManager', () => {
  const log = getLoggerMock();

  let DeviceManager: typeof IDeviceManager;

  beforeAll(async () => {
    // Need the dynamic import to mock miio
    const imported = await import('./device_manager.js');
    DeviceManager = imported.DeviceManager;
  });

  describe('constructor', () => {
    test('Fails if no IP provided', () => {
      expect(() => new DeviceManager(log, {})).toThrow('You must provide an ip address of the vacuum cleaner.');
    });

    test('Fails if no token provided', () => {
      expect(
        () =>
          new DeviceManager(log, {
            ip: '192.168.0.1',
          }),
      ).toThrow('You must provide a token of the vacuum cleaner.');
    });

    test('Does not fail if ip and token are provided (but fails to connects)', () => {
      expect(
        () =>
          new DeviceManager(log, {
            ip: '192.168.0.1',
            token: 'token',
          }),
      ).not.toThrow();
    });
  });

  describe('get device', () => {
    let deviceManager: IDeviceManager;

    afterEach(() => {
      deviceManager.stop();
    });

    test('fails when not connected yet', async () => {
      deviceManager = new DeviceManager(log, {
        ip: '192.168.0.1',
        token: 'token',
      });

      // @ts-expect-error `connect` is a private method
      jest.spyOn(deviceManager, 'connect').mockRejectedValueOnce();
      expect(deviceManager.model).toStrictEqual('unknown model');
      expect(() => deviceManager.state).toThrow('Not connected yet');
      expect(() => deviceManager.isCleaning).toThrow('Not connected yet');
      expect(() => deviceManager.isPaused).toThrow('Not connected yet');
      await expect(() => deviceManager.ensureDevice('test')).rejects.toBeUndefined();
    });

    test('connects and loads', async () => {
      miio.device.matches.mockReturnValue(true);
      miio.device.property.mockReturnValue('cleaning');
      miio.device.properties = { state: 'cleaning', battery: 10 };
      deviceManager = new DeviceManager(log, {
        ip: '192.168.0.1',
        token: 'token',
      });
      await new Promise((resolve) => process.nextTick(resolve));
      expect(deviceManager.model).toStrictEqual('test-model');
      expect(deviceManager.device).toStrictEqual(miio.device);
      expect(deviceManager.state).toStrictEqual('cleaning');
      expect(deviceManager.isCleaning).toStrictEqual(true);
      expect(deviceManager.isPaused).toStrictEqual(false);
      await expect(() => deviceManager.ensureDevice('test')).resolves.toBeUndefined();
      const props = await firstValueFrom(deviceManager.stateChanged$);
      expect(props).toMatchInlineSnapshot(`
        {
          "key": "state",
          "value": "cleaning",
        }
      `);
    });
  });

  describe('get state', () => {
    let deviceManager: IDeviceManager;

    beforeEach(() => {
      deviceManager = new DeviceManager(log, {
        ip: '192.168.0.1',
        token: 'token',
      });
    });

    afterEach(() => {
      deviceManager.stop();
    });

    test('Triggers a getState cycle', async () => {
      const getStateSpy = jest.spyOn(deviceManager, 'getState');
      miio.device.matches.mockReturnValue(true);
      miio.device.property.mockReturnValue('cleaning');
      miio.device.state.mockResolvedValue({ error: 'full', state: 'cleaning' });

      // await jest.advanceTimersByTimeAsync(20_000);
      const [state, error] = await Promise.all([firstValueFrom(deviceManager.stateChanged$), firstValueFrom(deviceManager.errorChanged$)]);

      expect(getStateSpy).toHaveBeenCalledTimes(1);
      expect(state).toMatchInlineSnapshot(`
        {
          "key": "state",
          "value": "cleaning",
        }
      `);
      expect(error).toMatchInlineSnapshot(`"full"`);
    });

    test('Handles errors', async () => {
      const getStateSpy = jest.spyOn(deviceManager, 'getState');
      miio.device.matches.mockReturnValue(true);
      miio.device.property.mockReturnValue('cleaning');
      miio.device.state.mockRejectedValueOnce(new Error('test'));

      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(getStateSpy).toHaveBeenCalledTimes(1);
    });
  });
});
