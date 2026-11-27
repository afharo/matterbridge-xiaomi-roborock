import { describe, test, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { firstValueFrom } from 'rxjs';

import { getLoggerMock } from '../utils/logger.mock.js';
import { miio } from '../test.mocks.js';

import { miioMock } from './device_manager.test.mock.js';
import type { DeviceManager as IDeviceManager } from './device_manager.js';

describe('DeviceManager', () => {
  const log = getLoggerMock();

  let DeviceManager: typeof IDeviceManager;

  beforeAll(async () => {
    // Need the dynamic import to mock miio
    const imported = await import('./device_manager.js');
    DeviceManager = imported.DeviceManager;
  });

  describe('node-miio logger', () => {
    test("passes the plugin's logger to node-miio", async () => {
      vi.clearAllMocks();
      new DeviceManager(log, { ip: '192.168.0.1', token: 'token' });
      await new Promise(process.nextTick);
      expect(miioMock.device).toHaveBeenCalledWith({
        address: '192.168.0.1',
        token: 'token',
        logger: { debug: expect.any(Function) },
      });
      expect(miioMock.configureLogging).toHaveBeenCalledWith({ logger: { debug: expect.any(Function) } });

      const [{ logger }] = miioMock.device.mock.calls[0] as [{ logger: { debug: (msg: string) => void } }];
      logger.debug('[thing:miio:1234] <- Message');
      expect(log.debug).toHaveBeenCalledWith('[thing:miio:1234] <- Message');
    });
  });

  describe('constructor', () => {
    test('Fails if no IP provided', () => {
      expect(() => new DeviceManager(log, {})).toThrow('You must provide an ip address of the vacuum cleaner');
    });

    test('Fails if no token provided', () => {
      expect(
        () =>
          new DeviceManager(log, {
            ip: '192.168.0.1',
          }),
      ).toThrow('You must provide a token of the vacuum cleaner');
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
      vi.spyOn(deviceManager, 'connect').mockRejectedValueOnce();
      expect(deviceManager.model).toStrictEqual('unknown model');
      expect(() => deviceManager.state).toThrow('Not connected yet');
      expect(() => deviceManager.isCleaning).toThrow('Not connected yet');
      expect(() => deviceManager.isPaused).toThrow('Not connected yet');
      await expect(deviceManager.ensureDevice('test')).rejects.toBeUndefined();
    });

    test('connects and loads', async () => {
      miio.device.matches.mockReturnValue(true);
      miio.device.property.mockReturnValue('cleaning');
      miio.device.properties = { state: 'cleaning', battery: 10 };
      miio.device.state.mockResolvedValue({ state: 'cleaning', battery: 10 });
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
      await expect(deviceManager.ensureDevice('test')).resolves.toBeUndefined();
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
      const getStateSpy = vi.spyOn(deviceManager, 'getState');
      miio.device.matches.mockReturnValue(true);
      miio.device.property.mockReturnValue('cleaning');
      miio.device.state.mockResolvedValue({ error: 'full', state: 'cleaning' });

      // await vi.advanceTimersByTimeAsync(20_000);
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
      const getStateSpy = vi.spyOn(deviceManager, 'getState');
      miio.device.matches.mockReturnValue(true);
      miio.device.property.mockReturnValue('cleaning');
      miio.device.state.mockRejectedValueOnce(new Error('test'));

      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(getStateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('finding the robot again (Xiaomi Cloud)', () => {
    let deviceManager: IDeviceManager;

    beforeEach(() => {
      vi.clearAllMocks();
      vi.useFakeTimers();
      miio.device.matches.mockReturnValue(true);
      miio.device.property.mockReturnValue('charging');
      miio.device.state.mockResolvedValue({});
      miio.device.properties = {};
    });

    afterEach(() => {
      deviceManager.stop();
      vi.useRealTimers();
      miioMock.device.mockImplementation(async () => miio.device);
      miio.device.poll.mockResolvedValue(undefined);
    });

    const addresses = () => (miioMock.device.mock.calls as Array<[{ address: string; token: string }]>).map(([options]) => `${options.address}/${options.token}`);

    test("when it can't connect, it asks where the robot is, and connects there right away", async () => {
      miioMock.device.mockRejectedValueOnce(new Error('timeout'));
      const locate = vi.fn(async () => ({ ip: '192.168.0.7', token: 'new-token' }));
      deviceManager = new DeviceManager(log, { ip: '192.168.0.1', token: 'token' }, locate);
      await vi.advanceTimersByTimeAsync(0);
      expect(locate).toHaveBeenCalledWith({ ip: '192.168.0.1', token: 'token' });
      expect(addresses()).toEqual(['192.168.0.1/token', '192.168.0.7/new-token']);
      expect(log.info).toHaveBeenCalledWith("INF relocate | The robot's IP changed from 192.168.0.1 to 192.168.0.7");
      expect(log.info).toHaveBeenCalledWith('INF relocate | The robot has a new token');
    });

    test('an unplugged robot (same location) is retried every 10 seconds, asking the cloud at most every 10 minutes', async () => {
      miioMock.device.mockRejectedValue(new Error('timeout'));
      const locate = vi.fn(async () => ({ ip: '192.168.0.1', token: 'token' }));
      deviceManager = new DeviceManager(log, { ip: '192.168.0.1', token: 'token' }, locate);
      await vi.advanceTimersByTimeAsync(0);
      expect(locate).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(9 * 60 * 1000);
      expect(locate).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60 * 1000);
      expect(locate).toHaveBeenCalledTimes(2);
      expect(addresses().every((address) => address === '192.168.0.1/token')).toBe(true);
    });

    test("when it stops answering, it reconnects at the robot's new IP", async () => {
      const locate = vi.fn(async () => ({ ip: '192.168.0.7', token: 'token' }));
      deviceManager = new DeviceManager(log, { ip: '192.168.0.1', token: 'token' }, locate);
      await vi.advanceTimersByTimeAsync(0);
      expect(addresses()).toEqual(['192.168.0.1/token']);

      miio.device.poll.mockRejectedValue(new Error('timeout'));
      await vi.advanceTimersByTimeAsync(8 * 10000);
      expect(locate).not.toHaveBeenCalled();

      // The 9th failure in a row
      await vi.advanceTimersByTimeAsync(10000);
      expect(locate).toHaveBeenCalledTimes(1);
      expect(miio.device.destroy).toHaveBeenCalled();
      expect(addresses()).toEqual(['192.168.0.1/token', '192.168.0.7/token']);
    });

    test('without the cloud, it keeps retrying the configured IP', async () => {
      miioMock.device.mockRejectedValueOnce(new Error('timeout'));
      deviceManager = new DeviceManager(log, { ip: '192.168.0.1', token: 'token' });
      await vi.advanceTimersByTimeAsync(10000);
      expect(addresses()).toEqual(['192.168.0.1/token', '192.168.0.1/token']);
    });
  });
});
