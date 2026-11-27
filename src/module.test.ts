import { describe, it, expect, beforeEach, afterAll, vi, type Mock } from 'vitest';
import { AnsiLogger, LogLevel } from 'matterbridge/logger';
import { PlatformConfig, PlatformMatterbridge } from 'matterbridge';

vi.doMock('./vacuum_device_accessory.js', () => ({
  VacuumDeviceAccessory: vi.fn(function () {
    return {
      initializeMatterbridgeEndpoint: vi.fn(() => Promise.resolve({})),
      postRegister: vi.fn(() => {}),
      stop: vi.fn(() => {}),
    };
  }),
}));

const locate = vi.fn(async ({ did, ip }: { did?: string; ip?: string }): Promise<{ ip: string; token: string } | undefined> => {
  if (did === '123') return { ip: '4.4.4.4', token: 'did-token' };
  if (ip === '2.2.2.2') return { ip: '2.2.2.2', token: 'cloud-token' };
  return undefined;
});
vi.doMock('./services/cloud_service.js', () => ({
  CloudService: vi.fn(function () {
    return { locate };
  }),
}));

// import initializePlugin from './module.js';
import type { XiaomiRoborockVacuumPlatform } from './xiaomi_roborock_vacuum_platform.js';

const mockLog = {
  fatal: vi.fn(() => {}),
  error: vi.fn(() => {}),
  warn: vi.fn(() => {}),
  notice: vi.fn(() => {}),
  info: vi.fn(() => {}),
  debug: vi.fn(() => {}),
} as unknown as AnsiLogger;

const mockMatterbridge = {
  matterbridgeDirectory: './jest/matterbridge',
  matterbridgePluginDirectory: './jest/plugins',
  matterbridgeVersion: '3.0.0',
} as Partial<PlatformMatterbridge> as { -readonly [P in keyof PlatformMatterbridge]: PlatformMatterbridge[P] };

const mockConfig = {
  name: 'matterbridge-plugin-template',
  type: 'DynamicPlatform',
  version: '1.0.0',
  debug: false,
  unregisterOnShutdown: false,
} as PlatformConfig;

vi.spyOn(AnsiLogger.prototype, 'log').mockImplementation(() => {});

describe('Matterbridge Xiaomi Roborock Vacuum Plugin', () => {
  let instance: XiaomiRoborockVacuumPlatform;

  beforeEach(() => {
    vi.clearAllMocks();
    if (instance) {
      vi.spyOn(instance, 'registerDevice').mockResolvedValue();
    }
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('should throw an error if matterbridge is not the required version', async () => {
    mockMatterbridge.matterbridgeVersion = '2.0.0'; // Simulate an older version
    const initializePlugin = (await import('./module.js')).default;
    expect(() => initializePlugin(mockMatterbridge, mockLog, mockConfig)).toThrow(
      'This plugin requires Matterbridge version >= "3.10.12". Please update Matterbridge from 2.0.0 to the latest version.',
    );
    mockMatterbridge.matterbridgeVersion = '3.10.12';
  });

  it('should create an instance of the platform', async () => {
    const configWithDevices = {
      ...mockConfig,
      devices: [{ name: 'Test vacuum', ip: '1.1.1.1', token: 'token1' }],
    };
    instance = (await import('./module.js')).default(mockMatterbridge, mockLog, configWithDevices) as XiaomiRoborockVacuumPlatform;
    const XiaomiRoborockVacuumPlatformClass = (await import('./xiaomi_roborock_vacuum_platform.js')).XiaomiRoborockVacuumPlatform;
    expect(instance).toBeInstanceOf(XiaomiRoborockVacuumPlatformClass);
    expect(instance.matterbridge).toBe(mockMatterbridge);
    expect(instance.log).toBe(mockLog);
    expect(instance.config).toBe(configWithDevices);
    expect(instance.matterbridge.matterbridgeVersion).toBe('3.10.12');
    expect(mockLog.info).toHaveBeenCalledWith('Initializing Platform...');
  });

  it('should start', async () => {
    await instance.onStart('Jest');
    expect(mockLog.info).toHaveBeenCalledWith('onStart called with reason: Jest');
    await instance.onStart();
    expect(mockLog.info).toHaveBeenCalledWith('onStart called with reason: none');
  });

  it('skips vacuums that could not be initialized, without failing the start (#248)', async () => {
    const { VacuumDeviceAccessory } = await import('./vacuum_device_accessory.js');
    const accessoryMock = VacuumDeviceAccessory as unknown as Mock;
    accessoryMock.mockImplementationOnce(function () {
      return {
        initializeMatterbridgeEndpoint: vi.fn(() => Promise.resolve(undefined)),
        postRegister: vi.fn(),
        stop: vi.fn(),
      };
    });
    await instance.onStart('offline');
    expect(instance.registerDevice).not.toHaveBeenCalled();

    accessoryMock.mockImplementationOnce(function () {
      return {
        initializeMatterbridgeEndpoint: vi.fn(() => Promise.reject(new Error('boom'))),
        postRegister: vi.fn(),
        stop: vi.fn(),
      };
    });
    await expect(instance.onStart('error')).resolves.toBeUndefined();
    expect(mockLog.error).toHaveBeenCalledWith('Failed to initialize the vacuum "Test vacuum": Error: boom');
  });

  it('should change logger level', async () => {
    await instance.onChangeLoggerLevel(LogLevel.DEBUG);
    expect(mockLog.info).toHaveBeenCalledWith('onChangeLoggerLevel called with: debug');
  });

  it('should shutdown', async () => {
    await instance.onShutdown('Jest');
    expect(mockLog.info).toHaveBeenCalledWith('onShutdown called with reason: Jest');

    // Mock the unregisterOnShutdown behavior
    instance.config.unregisterOnShutdown = true;
    await instance.onShutdown();
    expect(mockLog.info).toHaveBeenCalledWith('onShutdown called with reason: none');
    instance.config.unregisterOnShutdown = false;
  });

  it('gets the IP and token of the robots configured with their did, or without a token, from the Xiaomi Cloud', async () => {
    const { VacuumDeviceAccessory } = await import('./vacuum_device_accessory.js');
    const accessoryMock = VacuumDeviceAccessory as unknown as Mock;
    const config = {
      ...mockConfig,
      cloud: { enabled: true },
      devices: [
        { name: 'With token', ip: '1.1.1.1', token: 'token1' },
        { name: 'From the cloud', ip: '2.2.2.2' },
        { name: 'Not in the account', ip: '3.3.3.3' },
        { name: 'By did', did: '123', ip: '9.9.9.9', token: 'old-token' },
      ],
    };
    const platform = (await import('./module.js')).default(mockMatterbridge, mockLog, config) as XiaomiRoborockVacuumPlatform;
    vi.spyOn(platform, 'registerDevice').mockResolvedValue();
    await platform.onStart('cloud');
    expect(locate).toHaveBeenCalledTimes(3);
    expect(locate).toHaveBeenCalledWith({ did: '123', ip: '9.9.9.9' });
    const configs = accessoryMock.mock.calls.map(([cfg]) => cfg);
    expect(configs).toEqual([
      { name: 'With token', ip: '1.1.1.1', token: 'token1' },
      { name: 'From the cloud', ip: '2.2.2.2', token: 'cloud-token' },
      { name: 'Not in the account', ip: '3.3.3.3' },
      { name: 'By did', did: '123', ip: '4.4.4.4', token: 'did-token' },
    ]);
  });
});
