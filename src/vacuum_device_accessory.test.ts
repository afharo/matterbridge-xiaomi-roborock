import { Subject } from 'rxjs';
import { jest } from '@jest/globals';
import type { Logger } from 'matterbridge/logger';
import { MatterbridgeRvcCleanModeServer, RoboticVacuumCleaner } from 'matterbridge/devices';
import { PowerSource, RvcCleanMode, RvcOperationalState, RvcRunMode, ServiceArea } from 'matterbridge/matter/clusters';
import { MatterbridgeServiceAreaServer, type CommandHandlerPayload } from 'matterbridge';

import { deviceManagerMock, findSpeedModesMock } from './vacuum_device_accessory.test.mock.js';
import type { VacuumDeviceAccessory } from './vacuum_device_accessory.js';
import { speedmodes } from './models/speedmodes.js';
import { watermodes } from './models/watermodes.js';
import { fromNodeMiioModes } from './utils/find_speed_modes.js';

/**
 * Removes the `undefined` properties, so snapshots don't depend on the matterbridge version
 * (newer versions add optional attributes, e.g. `progress`, to the ServiceArea options).
 *
 * @param {unknown} value The value to clean up
 * @returns {unknown} A copy without `undefined` properties
 */
function withoutUndefined(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('VacuumDeviceAccessory', () => {
  let deviceAccessory: VacuumDeviceAccessory;
  let logger: Logger;

  beforeEach(async () => {
    logger = {
      debug: jest.fn(),
      notice: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn(),
      log: jest.fn(),
    };

    deviceManagerMock.device.getSerialNumber.mockResolvedValue('serial-number');
    deviceManagerMock.device.getDeviceInfo.mockResolvedValue({ fw_ver: '1.0.0' });

    const { VacuumDeviceAccessory } = await import('./vacuum_device_accessory.js');
    deviceAccessory = new VacuumDeviceAccessory({ name: 'Test Vacuum', roomNames: ['Living room'] }, logger);
  });

  afterEach(() => {
    deviceAccessory.stop();
    jest.clearAllMocks();
  });

  describe('offline robot at startup (#248)', () => {
    const snapshot = {
      model: 'roborock.vacuum.s5',
      serialNumber: 'saved-serial',
      firmware: '3.5.8',
      modelSpeeds: { speed: speedmodes.gen4 },
      serviceAreas: [],
      supportedMaps: [],
    };
    const createStore = (saved?: unknown) => ({
      get: jest.fn(async () => saved),
      set: jest.fn(async () => undefined),
    });
    const create = async (store: ReturnType<typeof createStore>) => {
      deviceAccessory.stop();
      const { VacuumDeviceAccessory } = await import('./vacuum_device_accessory.js');
      deviceAccessory = new VacuumDeviceAccessory({ name: 'Test Vacuum', ip: '1.1.1.1' }, logger, store);
    };

    afterEach(() => {
      jest.useRealTimers();
    });

    test('saves the device info after connecting', async () => {
      const store = createStore();
      await create(store);
      const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();
      deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);
      await expect(endpointPromise).resolves.toBeInstanceOf(RoboticVacuumCleaner);
      expect(store.set).toHaveBeenCalledWith('device-snapshot:1.1.1.1:Test Vacuum', expect.objectContaining({ serialNumber: 'serial-number', firmware: '1.0.0' }));
    });

    test('uses the saved info when the robot is not reachable', async () => {
      jest.useFakeTimers();
      const store = createStore(snapshot);
      await create(store);
      const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();
      await jest.advanceTimersByTimeAsync(15_000);
      const endpoint = (await endpointPromise) as RoboticVacuumCleaner;
      expect(endpoint).toBeInstanceOf(RoboticVacuumCleaner);
      expect(endpoint.serialNumber).toBe('saved-serial');
      expect(endpoint.productName).toBe('roborock.vacuum.s5');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('using the info saved from the last connection'));
    });

    test('refreshes the saved info once the robot is back online', async () => {
      jest.useFakeTimers();
      const store = createStore(snapshot);
      await create(store);
      const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();
      await jest.advanceTimersByTimeAsync(15_000);
      await endpointPromise;
      expect(store.set).not.toHaveBeenCalled();

      deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);
      await jest.advanceTimersByTimeAsync(0);
      expect(store.set).toHaveBeenCalledWith('device-snapshot:1.1.1.1:Test Vacuum', expect.objectContaining({ serialNumber: 'serial-number' }));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('restart the plugin to apply them'));
    });

    test('skips the robot when it was never connected and it is not reachable', async () => {
      jest.useFakeTimers();
      await create(createStore());
      const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();
      await jest.advanceTimersByTimeAsync(60_000);
      await expect(endpointPromise).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Skipping it so the other devices and plugins can start'));
      expect(deviceManagerMock.stop).toHaveBeenCalled();
    });

    test('does not fail when the store fails', async () => {
      const store = { get: jest.fn(async () => Promise.reject(new Error('disk'))), set: jest.fn(async () => Promise.reject(new Error('disk'))) };
      deviceAccessory.stop();
      const { VacuumDeviceAccessory } = await import('./vacuum_device_accessory.js');
      deviceAccessory = new VacuumDeviceAccessory({ name: 'Test Vacuum', ip: '1.1.1.1' }, logger, store);
      const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();
      deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);
      await expect(endpointPromise).resolves.toBeInstanceOf(RoboticVacuumCleaner);
    });
  });

  describe('initializeMatterbridgeEndpoint', () => {
    test('should return an endpoint of type RVC', async () => {
      const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();

      deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);

      await expect(endpointPromise).resolves.toBeInstanceOf(RoboticVacuumCleaner);
    });

    test('should fail to retrieve serial and fw', async () => {
      deviceManagerMock.device.getSerialNumber.mockRejectedValue(new Error('Failed to retrieve serial number'));
      deviceManagerMock.device.getDeviceInfo.mockRejectedValue(new Error('Failed to retrieve firmware version'));

      const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();

      deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);

      await expect(endpointPromise).resolves.toBeInstanceOf(RoboticVacuumCleaner);
    });

    describe('multi-floor maps', () => {
      const connect = async () => {
        const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();
        deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);
        const endpoint = await endpointPromise;
        return endpoint.behaviors.optionsFor(MatterbridgeServiceAreaServer.with(ServiceArea.Feature.Maps)) as {
          supportedMaps?: ServiceArea.Map[];
          supportedAreas?: ServiceArea.Area[];
        };
      };

      beforeEach(() => {
        deviceManagerMock.device.getRoomMap.mockResolvedValue([
          ['16', 'Kitchen'],
          ['17', 'Bedroom'],
        ]);
      });

      afterEach(() => {
        delete (deviceManagerMock.device as { getMaps?: unknown }).getMaps;
      });

      test('exposes the maps and assigns the areas to the current one', async () => {
        deviceManagerMock.device.getMaps = jest.fn(async () => [
          { id: 0, name: 'Ground floor' },
          { id: 1, name: '' },
        ]);
        deviceManagerMock.device.call.mockResolvedValueOnce([{ map_status: 7 }] as never); // 7 >> 2 = map 1
        const options = await connect();
        expect(options.supportedMaps).toEqual([
          { mapId: 0, name: 'Ground floor' },
          { mapId: 1, name: 'Floor 2' },
        ]);
        expect(options.supportedAreas?.map(({ mapId }) => mapId)).toEqual([1, 1]);
      });

      test('skips the maps when there is only one', async () => {
        deviceManagerMock.device.getMaps = jest.fn(async () => [{ id: 0, name: 'Home' }]);
        const options = await connect();
        expect(options.supportedMaps ?? []).toEqual([]);
        expect(options.supportedAreas?.map(({ mapId }) => mapId)).toEqual([null, null]);
      });

      test('skips the maps when the current map is unknown', async () => {
        deviceManagerMock.device.getMaps = jest.fn(async () => [
          { id: 0, name: 'A' },
          { id: 1, name: 'B' },
        ]);
        deviceManagerMock.device.call.mockResolvedValueOnce([{ map_status: 3 << 2 }] as never); // map 3 doesn't exist
        const options = await connect();
        expect(options.supportedMaps ?? []).toEqual([]);
        expect(options.supportedAreas?.map(({ mapId }) => mapId)).toEqual([null, null]);
      });

      test('skips the maps when they cannot be retrieved', async () => {
        deviceManagerMock.device.getMaps = jest.fn(async () => Promise.reject(new Error('unknown method')));
        const options = await connect();
        expect(options.supportedMaps ?? []).toEqual([]);
      });
    });

    describe('serviceAreas', () => {
      test('should retrieve service areas via room mappings', async () => {
        deviceManagerMock.device.getRoomMap.mockResolvedValue([
          ['16', '1234567890'],
          ['17', 'Kitchen'],
        ]);

        const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();

        deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);

        const endpoint = await endpointPromise;
        expect(endpoint).toBeInstanceOf(RoboticVacuumCleaner);
        expect(withoutUndefined(endpoint.behaviors.optionsFor(MatterbridgeServiceAreaServer.with(ServiceArea.Feature.Maps)))).toMatchInlineSnapshot(`
          {
            "currentArea": 16,
            "estimatedEndTime": null,
            "selectedAreas": [],
            "supportedAreas": [
              {
                "areaId": 16,
                "areaInfo": {
                  "landmarkInfo": null,
                  "locationInfo": {
                    "areaType": null,
                    "floorNumber": null,
                    "locationName": "Living room",
                  },
                },
                "mapId": null,
              },
              {
                "areaId": 17,
                "areaInfo": {
                  "landmarkInfo": null,
                  "locationInfo": {
                    "areaType": null,
                    "floorNumber": null,
                    "locationName": "Kitchen",
                  },
                },
                "mapId": null,
              },
            ],
            "supportedMaps": [],
          }
        `);
      });

      test('should retrieve service areas via timer', async () => {
        deviceManagerMock.device.getRoomMap.mockResolvedValue([]);
        deviceManagerMock.device.getTimer.mockResolvedValue([
          // This one will be discarded because it's ON
          ['timer-id', 'on', ['0 0 * * *', ['action', { segments: '16,17' }]]],
          // This one is taken (supports off, disabled, disable)
          ['timer-id', 'disable', ['0 0 * * *', ['action', { segments: '16,17' }]]],
        ]);

        const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();

        deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);

        const endpoint = await endpointPromise;
        expect(endpoint).toBeInstanceOf(RoboticVacuumCleaner);
        expect(withoutUndefined(endpoint.behaviors.optionsFor(MatterbridgeServiceAreaServer.with(ServiceArea.Feature.Maps)))).toMatchInlineSnapshot(`
          {
            "currentArea": 16,
            "estimatedEndTime": null,
            "selectedAreas": [],
            "supportedAreas": [
              {
                "areaId": 16,
                "areaInfo": {
                  "landmarkInfo": null,
                  "locationInfo": {
                    "areaType": null,
                    "floorNumber": null,
                    "locationName": "Living room",
                  },
                },
                "mapId": null,
              },
              {
                "areaId": 17,
                "areaInfo": {
                  "landmarkInfo": null,
                  "locationInfo": {
                    "areaType": null,
                    "floorNumber": null,
                    "locationName": "Room 17",
                  },
                },
                "mapId": null,
              },
            ],
            "supportedMaps": [],
          }
        `);
      });
      test("should return 0 areas and assign the default ones (they'll be cleared after registration)", async () => {
        deviceManagerMock.device.getRoomMap.mockResolvedValue([]);
        deviceManagerMock.device.getTimer.mockResolvedValue([]);

        const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();

        deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);

        const endpoint = await endpointPromise;
        expect(endpoint).toBeInstanceOf(RoboticVacuumCleaner);
        expect(withoutUndefined(endpoint.behaviors.optionsFor(MatterbridgeServiceAreaServer.with(ServiceArea.Feature.Maps)))).toMatchInlineSnapshot(`
          {
            "currentArea": 1,
            "estimatedEndTime": null,
            "selectedAreas": [],
            "supportedAreas": [
              {
                "areaId": 1,
                "areaInfo": {
                  "landmarkInfo": null,
                  "locationInfo": {
                    "areaType": 52,
                    "floorNumber": 0,
                    "locationName": "Living",
                  },
                },
                "mapId": null,
              },
              {
                "areaId": 2,
                "areaInfo": {
                  "landmarkInfo": null,
                  "locationInfo": {
                    "areaType": 47,
                    "floorNumber": 0,
                    "locationName": "Kitchen",
                  },
                },
                "mapId": null,
              },
              {
                "areaId": 3,
                "areaInfo": {
                  "landmarkInfo": null,
                  "locationInfo": {
                    "areaType": 7,
                    "floorNumber": 1,
                    "locationName": "Bedroom",
                  },
                },
                "mapId": null,
              },
              {
                "areaId": 4,
                "areaInfo": {
                  "landmarkInfo": null,
                  "locationInfo": {
                    "areaType": 6,
                    "floorNumber": 1,
                    "locationName": "Bathroom",
                  },
                },
                "mapId": null,
              },
            ],
            "supportedMaps": [],
          }
        `);
      });
    });

    test('should stop the device manager when the destroying lifecycle triggers', async () => {
      const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();

      deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);

      const endpoint = await endpointPromise;
      expect(endpoint).toBeInstanceOf(RoboticVacuumCleaner);
      endpoint.lifecycle.destroying.emit();
      expect(deviceManagerMock.stop).toHaveBeenCalledTimes(1);
    });

    describe('command handlers', () => {
      let endpoint: RoboticVacuumCleaner;

      beforeEach(async () => {
        const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();
        deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);
        endpoint = (await endpointPromise) as RoboticVacuumCleaner;
      });

      describe('changeToMode', () => {
        test('should have a changeToMode handler', async () => {
          expect(endpoint.commandHandler.hasHandler('RvcCleanMode.changeToMode')).toBe(true);
          expect(endpoint.commandHandler.hasHandler('RvcRunMode.changeToMode')).toBe(true);
        });

        describe('RvcCleanMode.changeToMode', () => {
          test('sets the fan speed (but not the water level)', async () => {
            endpoint.commandHandler.executeHandler('RvcCleanMode.changeToMode', { request: { newMode: 1 } } as unknown as CommandHandlerPayload<'RvcCleanMode.changeToMode'>);
            expect(deviceManagerMock.device.changeFanSpeed).toHaveBeenCalledWith(105);
            expect(deviceManagerMock.device.setWaterBoxMode).not.toHaveBeenCalled();
          });

          test('sets the fan speed and the water level to off (for a supported model)', async () => {
            findSpeedModesMock.mockReturnValueOnce({
              speed: speedmodes.gen2,
              waterspeed: watermodes.gen1,
            });

            const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();
            deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);
            endpoint = (await endpointPromise) as RoboticVacuumCleaner;

            endpoint.commandHandler.executeHandler('RvcCleanMode.changeToMode', { request: { newMode: 1 } } as unknown as CommandHandlerPayload<'RvcCleanMode.changeToMode'>);
            await Promise.resolve(); // Just waiting for the pending promises to run
            expect(deviceManagerMock.device.changeFanSpeed).toHaveBeenCalledWith(105);
            expect(deviceManagerMock.device.setWaterBoxMode).toHaveBeenCalledWith(200);
          });
          test('on MIoT devices, mop modes only set the water level (the vacuum cannot be turned off)', async () => {
            findSpeedModesMock.mockReturnValueOnce(
              fromNodeMiioModes(
                [
                  { value: 0, name: 'Silent' },
                  { value: 1, name: 'Basic' },
                ],
                [
                  { value: 1, name: 'Level1' },
                  { value: 2, name: 'Level2' },
                ],
              ),
            );

            const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();
            deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);
            endpoint = (await endpointPromise) as RoboticVacuumCleaner;

            // Modes: 1 = Silent Vacuum, 2 = Basic Vacuum, 3 = Level1 Mop, 4 = Level2 Mop
            endpoint.commandHandler.executeHandler('RvcCleanMode.changeToMode', { request: { newMode: 4 } } as unknown as CommandHandlerPayload<'RvcCleanMode.changeToMode'>);
            await Promise.resolve();
            await Promise.resolve();
            expect(deviceManagerMock.device.changeFanSpeed).not.toHaveBeenCalled();
            expect(deviceManagerMock.device.setWaterBoxMode).toHaveBeenCalledWith(2);

            // Vacuum modes don't try to turn the water off
            endpoint.commandHandler.executeHandler('RvcCleanMode.changeToMode', { request: { newMode: 1 } } as unknown as CommandHandlerPayload<'RvcCleanMode.changeToMode'>);
            await Promise.resolve();
            expect(deviceManagerMock.device.changeFanSpeed).toHaveBeenCalledWith(0);
            expect(deviceManagerMock.device.setWaterBoxMode).toHaveBeenCalledTimes(1);
          });
        });

        describe('RvcCleanMode.changeToMode with cleaning types (MIoT)', () => {
          beforeEach(async () => {
            findSpeedModesMock.mockReturnValueOnce({
              ...fromNodeMiioModes(
                [
                  { value: 0, name: 'Silent' },
                  { value: 1, name: 'Basic' },
                ],
                [{ value: 2, name: 'Level2' }],
              ),
              cleaningTypes: { vacuum: 1, mop: 2, vacuumAndMop: 3, vacuumThenMop: 4 },
            });
            deviceManagerMock.device.setCleaningType = jest.fn(async () => undefined);
            const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();
            deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);
            endpoint = (await endpointPromise) as RoboticVacuumCleaner;
          });

          afterEach(() => {
            delete (deviceManagerMock.device as { setCleaningType?: unknown }).setCleaningType;
          });

          // Modes: 1 = Silent Vacuum, 2 = Basic Vacuum, 3 = Level2 Mop, 4 = Vacuum then Mop,
          // and the presets (listed first): 5 = Automatic, 6 = Deep clean, 7 = Quiet (they replace "Vacuum & Mop")
          const changeTo = async (newMode: number) => {
            endpoint.commandHandler.executeHandler('RvcCleanMode.changeToMode', { request: { newMode } } as unknown as CommandHandlerPayload<'RvcCleanMode.changeToMode'>);
            await new Promise((resolve) => setTimeout(resolve, 0));
          };

          test('exposes the combined modes', () => {
            const options = endpoint.behaviors.optionsFor(MatterbridgeRvcCleanModeServer) as { supportedModes: RvcCleanMode.ModeOption[] };
            expect(options.supportedModes.map(({ label, mode }) => `${mode}:${label}`)).toEqual([
              '5:Automatic',
              '6:Deep clean',
              '7:Quiet',
              '1:Silent Vacuum',
              '2:Basic Vacuum',
              '3:Level2 Mop',
              '4:Vacuum then Mop',
            ]);
            expect(options.supportedModes[6].modeTags).toEqual([{ value: RvcCleanMode.ModeTag.VacuumThenMop }]);
          });

          test('vacuum modes set the vacuum-only cleaning type and the fan speed', async () => {
            await changeTo(2);
            expect(deviceManagerMock.device.setCleaningType).toHaveBeenCalledWith(1);
            expect(deviceManagerMock.device.changeFanSpeed).toHaveBeenCalledWith(1);
          });

          test('mop modes set the mop-only cleaning type and the water level', async () => {
            await changeTo(3);
            expect(deviceManagerMock.device.setCleaningType).toHaveBeenCalledWith(2);
            expect(deviceManagerMock.device.setWaterBoxMode).toHaveBeenCalledWith(2);
            expect(deviceManagerMock.device.changeFanSpeed).not.toHaveBeenCalled();
          });

          test('presets set the vacuum & mop cleaning type and both levels', async () => {
            await changeTo(5); // Automatic
            expect(deviceManagerMock.device.setCleaningType).toHaveBeenCalledWith(3);
            expect(deviceManagerMock.device.changeFanSpeed).toHaveBeenCalledWith(1); // Basic is the medium fan level
            expect(deviceManagerMock.device.setWaterBoxMode).toHaveBeenCalledWith(2);
          });

          test('vacuum then mop only sets the cleaning type', async () => {
            await changeTo(4);
            expect(deviceManagerMock.device.setCleaningType).toHaveBeenCalledWith(4);
            expect(deviceManagerMock.device.changeFanSpeed).not.toHaveBeenCalled();
            expect(deviceManagerMock.device.setWaterBoxMode).not.toHaveBeenCalled();
          });
        });

        describe('vacuum & mop presets (#162)', () => {
          beforeEach(async () => {
            // Roborock S5 Max: gen4+custom fan speeds and the gen1+custom water box
            findSpeedModesMock.mockReturnValueOnce({ speed: speedmodes['gen4+custom'], waterspeed: watermodes['gen1+custom'] });
            const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();
            deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);
            endpoint = (await endpointPromise) as RoboticVacuumCleaner;
          });

          const supportedModes = () =>
            (endpoint.behaviors.optionsFor(MatterbridgeRvcCleanModeServer) as { supportedModes: RvcCleanMode.ModeOption[]; currentMode: number }).supportedModes;

          test('lists the presets first, numbered after the existing modes', () => {
            const modes = supportedModes();
            expect(modes.slice(0, 3).map(({ label }) => label)).toEqual(['Automatic', 'Deep clean', 'Quiet']);
            // The existing modes keep their numbers (1 = the first vacuum mode)
            expect(modes[3]).toMatchObject({ mode: 1, label: 'Soft Vacuum' });
            expect(modes[0].mode).toBe(modes.length - 2);
            expect(modes[0].modeTags).toEqual([{ value: RvcCleanMode.ModeTag.Auto }, { value: RvcCleanMode.ModeTag.Vacuum }, { value: RvcCleanMode.ModeTag.Mop }]);
            // The current mode is still the first vacuum mode
            expect((endpoint.behaviors.optionsFor(MatterbridgeRvcCleanModeServer) as { currentMode: number }).currentMode).toBe(1);
          });

          test.each([
            ['Automatic', 102, 202], // Balanced + Medium
            ['Deep clean', 104, 203], // Max + High
            ['Quiet', 101, 201], // Quiet + Light
          ])('%s sets the fan speed %p and the water level %p', async (label, fan, water) => {
            const preset = supportedModes().find((mode) => mode.label === label) as RvcCleanMode.ModeOption;
            endpoint.commandHandler.executeHandler('RvcCleanMode.changeToMode', {
              request: { newMode: preset.mode },
            } as unknown as CommandHandlerPayload<'RvcCleanMode.changeToMode'>);
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(deviceManagerMock.device.changeFanSpeed).toHaveBeenCalledWith(fan);
            expect(deviceManagerMock.device.setWaterBoxMode).toHaveBeenCalledWith(water);
          });

          test('unknown modes are ignored', async () => {
            endpoint.commandHandler.executeHandler('RvcCleanMode.changeToMode', { request: { newMode: 99 } } as unknown as CommandHandlerPayload<'RvcCleanMode.changeToMode'>);
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(deviceManagerMock.device.changeFanSpeed).not.toHaveBeenCalled();
          });
        });

        describe('RvcRunMode.changeToMode', () => {
          test('on Idle, it does nothing', async () => {
            endpoint.commandHandler.executeHandler('RvcRunMode.changeToMode', { request: { newMode: 1 } } as unknown as CommandHandlerPayload<'RvcRunMode.changeToMode'>);
            expect(logger.warn).not.toHaveBeenCalled();
          });

          test('on unknown mode, it logs a warning', async () => {
            endpoint.commandHandler.executeHandler('RvcRunMode.changeToMode', { request: { newMode: 3 } } as unknown as CommandHandlerPayload<'RvcRunMode.changeToMode'>);
            expect(logger.warn).toHaveBeenCalledWith('[Name=Test Vacuum][Model=unknown] Unknown mode 3');
          });

          test('on Idle, it sends the RVC to the charger', async () => {
            endpoint.commandHandler.executeHandler('RvcRunMode.changeToMode', { request: { newMode: 1 } } as unknown as CommandHandlerPayload<'RvcRunMode.changeToMode'>);
            expect(deviceManagerMock.device.activateCharging).toHaveBeenCalled();
          });

          test('on Cleaning, it starts a full cleaning if no rooms are selected', async () => {
            endpoint.commandHandler.executeHandler('RvcRunMode.changeToMode', { request: { newMode: 2 } } as unknown as CommandHandlerPayload<'RvcRunMode.changeToMode'>);
            expect(logger.info).toHaveBeenCalledWith('[Name=Test Vacuum][Model=unknown] Initiating full cleaning...');
            expect(deviceManagerMock.device.activateCleaning).toHaveBeenCalled();
            expect(deviceManagerMock.device.cleanRooms).not.toHaveBeenCalled();
          });

          test('on Cleaning, it starts a room cleaning if any rooms are selected', async () => {
            jest.spyOn(endpoint, 'getAttribute').mockReturnValueOnce([16, 17]);

            endpoint.commandHandler.executeHandler('RvcRunMode.changeToMode', { request: { newMode: 2 } } as unknown as CommandHandlerPayload<'RvcRunMode.changeToMode'>);
            expect(logger.info).toHaveBeenCalledWith('[Name=Test Vacuum][Model=unknown] Initiating room cleaning...');
            expect(deviceManagerMock.device.activateCleaning).not.toHaveBeenCalled();
            expect(deviceManagerMock.device.cleanRooms).toHaveBeenCalledWith([16, 17]);
          });
        });
      });

      describe('stop', () => {
        test('calls deactivate cleaning when triggered', async () => {
          endpoint.commandHandler.executeHandler('stop', { request: {} } as unknown as CommandHandlerPayload<'stop'>);
          expect(deviceManagerMock.device.deactivateCleaning).toHaveBeenCalled();
        });
      });

      describe('pause', () => {
        test('pauses the current cleaning', async () => {
          endpoint.commandHandler.executeHandler('pause', { request: {} } as unknown as CommandHandlerPayload<'pause'>);
          expect(deviceManagerMock.device.pause).toHaveBeenCalled();
        });
      });

      describe('resume', () => {
        test('resumes the current full cleaning', async () => {
          endpoint.commandHandler.executeHandler('resume', { request: {} } as unknown as CommandHandlerPayload<'resume'>);
          expect(deviceManagerMock.device.activateCleaning).toHaveBeenCalled();
        });

        test('resumes the current room cleaning if areas were previously selected', async () => {
          jest.spyOn(endpoint, 'getAttribute').mockReturnValueOnce([16, 17]);
          endpoint.commandHandler.executeHandler('resume', { request: {} } as unknown as CommandHandlerPayload<'resume'>);
          expect(deviceManagerMock.device.resumeCleanRooms).toHaveBeenCalledWith([16, 17]);
        });
      });

      describe('goHome', () => {
        test('sends the RVC to the charger without deadlock from updating attributes directly', async () => {
          const updateAttributeSpy = jest.spyOn(endpoint, 'updateAttribute');
          endpoint.commandHandler.executeHandler('goHome', { request: {} } as unknown as CommandHandlerPayload<'goHome'>);
          await Promise.resolve(); // Just waiting for the pending promises to run
          expect(deviceManagerMock.device.activateCharging).toHaveBeenCalled();
          expect(updateAttributeSpy).not.toHaveBeenCalled();
        });
      });

      describe('identify', () => {
        test('triggers the findme action', async () => {
          endpoint.commandHandler.executeHandler('identify', { request: {} } as unknown as CommandHandlerPayload<'identify'>);
          expect(deviceManagerMock.device.find).toHaveBeenCalled();
        });
      });

      describe('skipArea', () => {
        const startRoomCleaning = async (areas: number[]) => {
          jest.spyOn(endpoint, 'getAttribute').mockReturnValueOnce(areas);
          await endpoint.commandHandler.executeHandler('RvcRunMode.changeToMode', { request: { newMode: 2 } } as unknown as CommandHandlerPayload<'RvcRunMode.changeToMode'>);
          deviceManagerMock.device.cleanRooms.mockClear();
        };
        const skip = (skippedArea: number) => endpoint.commandHandler.executeHandler('skipArea', { request: { skippedArea } } as unknown as CommandHandlerPayload<'skipArea'>);

        test('carries on with the remaining areas', async () => {
          await startRoomCleaning([16, 17, 18]);
          await skip(16);
          expect(deviceManagerMock.device.cleanRooms).toHaveBeenCalledWith([17, 18]);
          await skip(18);
          expect(deviceManagerMock.device.cleanRooms).toHaveBeenLastCalledWith([17]);
        });

        test('goes home when the last area is skipped', async () => {
          await startRoomCleaning([16]);
          await skip(16);
          expect(deviceManagerMock.device.cleanRooms).not.toHaveBeenCalled();
          expect(deviceManagerMock.device.activateCharging).toHaveBeenCalled();
        });

        test('ignores areas that are not being cleaned', async () => {
          await startRoomCleaning([16, 17]);
          await skip(99);
          expect(deviceManagerMock.device.cleanRooms).not.toHaveBeenCalled();
          expect(deviceManagerMock.device.activateCharging).not.toHaveBeenCalled();
        });

        test('ignores it when not room cleaning', async () => {
          await skip(16);
          expect(deviceManagerMock.device.cleanRooms).not.toHaveBeenCalled();
        });
      });

      describe('selectAreas', () => {
        test('sets the selected areas', async () => {
          const updateAttributeSpy = jest.spyOn(endpoint, 'updateAttribute').mockResolvedValueOnce(true);
          endpoint.commandHandler.executeHandler('selectAreas', {
            request: { newAreas: [17] },
            attributes: { supportedAreas: [{ areaId: 16 }, { areaId: 17 }] },
          } as unknown as CommandHandlerPayload<'selectAreas'>);
          expect(updateAttributeSpy).toHaveBeenCalledWith(ServiceArea, 'selectedAreas', [17]);
        });

        test('sets an empty array as selected areas when all rooms are selected', async () => {
          const updateAttributeSpy = jest.spyOn(endpoint, 'updateAttribute').mockResolvedValueOnce(true);
          endpoint.commandHandler.executeHandler('selectAreas', {
            request: { newAreas: [16, 17] },
            attributes: { supportedAreas: [{ areaId: 16 }, { areaId: 17 }] },
          } as unknown as CommandHandlerPayload<'selectAreas'>);
          expect(updateAttributeSpy).toHaveBeenCalledWith(ServiceArea, 'selectedAreas', []);
        });
      });
    });
  });

  describe('postRegister', () => {
    let endpoint: RoboticVacuumCleaner;
    let updateAttributeSpy: jest.SpiedFunction<typeof endpoint.updateAttribute>;

    beforeEach(async () => {
      findSpeedModesMock.mockReturnValueOnce({
        speed: speedmodes.gen2,
        waterspeed: watermodes.gen1,
      });

      const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();
      deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);
      endpoint = (await endpointPromise) as RoboticVacuumCleaner;
      updateAttributeSpy = jest.spyOn(endpoint, 'updateAttribute').mockResolvedValue(true);
    });

    describe('serviceAreas hack', () => {
      test('when no serviceAreas have been discovered, it should enforce empty values', async () => {
        await deviceAccessory.postRegister();
        expect(updateAttributeSpy).toHaveBeenCalledTimes(3);
        expect(updateAttributeSpy).toHaveBeenNthCalledWith(1, ServiceArea, 'currentArea', null);
        expect(updateAttributeSpy).toHaveBeenNthCalledWith(2, ServiceArea, 'currentArea', null);
        expect(updateAttributeSpy).toHaveBeenNthCalledWith(3, ServiceArea, 'supportedAreas', []);
      });

      test('when serviceAreas have been discovered, it should only force an empty currentArea', async () => {
        deviceManagerMock.device.getRoomMap.mockResolvedValue([
          ['16', 'Living room'],
          ['17', 'Kitchen'],
        ]);

        const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();
        deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);
        endpoint = (await endpointPromise) as RoboticVacuumCleaner;
        updateAttributeSpy = jest.spyOn(endpoint, 'updateAttribute').mockResolvedValue(true);

        await deviceAccessory.postRegister();
        expect(updateAttributeSpy).toHaveBeenCalledTimes(1);
        expect(updateAttributeSpy).toHaveBeenNthCalledWith(1, ServiceArea, 'currentArea', null);
      });
    });

    describe('stateChangedHandlers', () => {
      beforeEach(async () => {
        await deviceAccessory.postRegister();
        updateAttributeSpy.mockClear();
      });

      describe('batteryLevel', () => {
        test('updates the battery level', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'batteryLevel', value: 100 });
          await Promise.resolve(); // Just waiting for the pending promises to run
          expect(updateAttributeSpy).toHaveBeenCalledTimes(2);
          expect(updateAttributeSpy).toHaveBeenCalledWith(PowerSource, 'batPercentRemaining', 200);
          expect(updateAttributeSpy).toHaveBeenCalledWith(PowerSource, 'batChargeLevel', PowerSource.BatChargeLevel.Ok);
        });

        test('updates the battery level (<20% - Warning)', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'batteryLevel', value: 10 });
          await Promise.resolve(); // Just waiting for the pending promises to run
          expect(updateAttributeSpy).toHaveBeenCalledTimes(2);
          expect(updateAttributeSpy).toHaveBeenCalledWith(PowerSource, 'batPercentRemaining', 20);
          expect(updateAttributeSpy).toHaveBeenCalledWith(PowerSource, 'batChargeLevel', PowerSource.BatChargeLevel.Warning);
        });
      });

      describe('charging', () => {
        test('when charging == true', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'charging', value: true });
          await Promise.resolve(); // Just waiting for the pending promises to run
          expect(updateAttributeSpy).toHaveBeenCalledTimes(2);
          expect(updateAttributeSpy).toHaveBeenCalledWith(PowerSource, 'batChargeState', PowerSource.BatChargeState.IsCharging);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalState', RvcOperationalState.OperationalState.Charging);
        });

        test('when charging == true and battery level is 100%', async () => {
          deviceManagerMock.property.mockReturnValueOnce(100);
          deviceManagerMock.stateChanged$.next({ key: 'charging', value: true });
          await Promise.resolve(); // Just waiting for the pending promises to run
          expect(updateAttributeSpy).toHaveBeenCalledTimes(2);
          expect(updateAttributeSpy).toHaveBeenCalledWith(PowerSource, 'batChargeState', PowerSource.BatChargeState.IsAtFullCharge);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalState', RvcOperationalState.OperationalState.Docked);
        });

        test('when charging == false', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'charging', value: false });
          await Promise.resolve(); // Just waiting for the pending promises to run
          expect(updateAttributeSpy).toHaveBeenCalledWith(PowerSource, 'batChargeState', PowerSource.BatChargeState.IsNotCharging);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(1);
        });
      });

      describe('cleaning/cleaningMode', () => {
        test.each([
          ['cleaning', true],
          ['cleaningMode', 'cleaning'],
          ['cleaningMode', 'room-cleaning'],
        ])('when %s == %s', async (key, value) => {
          deviceManagerMock.stateChanged$.next({ key, value });
          await Promise.resolve();
          expect(updateAttributeSpy).toHaveBeenCalledTimes(2);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcRunMode, 'currentMode', 2);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalState', RvcOperationalState.OperationalState.Running);
        });

        test('when cleaningMode == 1 but the state is "paused"', async () => {
          deviceManagerMock.property.mockReturnValueOnce('paused');
          deviceManagerMock.stateChanged$.next({ key: 'cleaningMode', value: 'cleaning' });
          await Promise.resolve();
          expect(updateAttributeSpy).toHaveBeenCalledTimes(1);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcRunMode, 'currentMode', 1);
        });

        test.each([
          ['cleaning', false],
          ['cleaningMode', 'idle'],
          ['cleaningMode', 'paused'],
        ])('when %s == %s', async (key, value) => {
          deviceManagerMock.stateChanged$.next({ key, value });
          await Promise.resolve();
          expect(updateAttributeSpy).toHaveBeenCalledTimes(1);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcRunMode, 'currentMode', 1);
        });
      });

      describe('in_returning', () => {
        test.each([
          ['in_returning', 1],
          ['in_returning', true],
        ])('when %s == %s', async (key, value) => {
          deviceManagerMock.stateChanged$.next({ key, value });
          await Promise.resolve();
          expect(updateAttributeSpy).toHaveBeenCalledTimes(1);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalState', RvcOperationalState.OperationalState.SeekingCharger);
        });

        test('when paused, in_returning does not override paused state', async () => {
          deviceManagerMock.device.property.mockReturnValue('paused');
          deviceManagerMock.stateChanged$.next({ key: 'in_returning', value: 1 });
          await Promise.resolve();
          expect(updateAttributeSpy).toHaveBeenCalledTimes(0);
        });

        test.each([
          ['in_returning', 0],
          ['in_returning', false],
        ])('when %s == %s', async (key, value) => {
          deviceManagerMock.stateChanged$.next({ key, value });
          await Promise.resolve();
          expect(updateAttributeSpy).toHaveBeenCalledTimes(0);
        });
      });

      describe('fanSpeed', () => {
        test('when fanSpeed is known', async () => {
          deviceManagerMock.device.property.mockReturnValueOnce(200);
          deviceManagerMock.stateChanged$.next({ key: 'fanSpeed', value: 105 });
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcCleanMode, 'currentMode', 1);
        });

        test('when fanSpeed is unknown', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'fanSpeed', value: 999 });
          expect(updateAttributeSpy).not.toHaveBeenCalled();
        });
      });

      describe('water_box_mode', () => {
        test('when water_box_mode is known', async () => {
          deviceManagerMock.device.property.mockReturnValueOnce(-1);
          deviceManagerMock.stateChanged$.next({ key: 'water_box_mode', value: 201 });
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcCleanMode, 'currentMode', 6);
        });

        test('when water_box_mode is unknown', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'water_box_mode', value: 999 });
          expect(updateAttributeSpy).not.toHaveBeenCalled();
        });
      });

      describe('state', () => {
        const awaitNPromises = async (n: number) => {
          for (let i = 0; i < n; i++) {
            await Promise.resolve();
          }
        };

        test('unknown', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'state', value: 'unknown' });
          const expectedCalls = 1; // The charging update.
          await awaitNPromises(expectedCalls + 1);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(expectedCalls);
          expect(logger.warn).toHaveBeenCalledWith('[Name=Test Vacuum][Model=unknown] Unknown state: unknown');
        });

        test('paused', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'state', value: 'paused' });
          const expectedCalls = 3; // 2 + the charging update.
          await awaitNPromises(expectedCalls + 1);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(expectedCalls);
          expect(logger.warn).not.toHaveBeenCalled();
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcRunMode, 'currentMode', 1);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalState', RvcOperationalState.OperationalState.Paused);
        });

        test.each(['cleaning', 'spot-cleaning', 'room-cleaning', 'zone-cleaning', 'sweeping', 'mopping', 'sweeping-and-mopping'])('%s', async (value) => {
          deviceManagerMock.stateChanged$.next({ key: 'state', value });
          const expectedCalls = 3; // 2 + the charging update.
          await awaitNPromises(expectedCalls + 1);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(expectedCalls);
          expect(logger.warn).not.toHaveBeenCalled();
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcRunMode, 'currentMode', 2);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalState', RvcOperationalState.OperationalState.Running);
        });

        test.each(['returning', 'docking'])('%s', async (value) => {
          deviceManagerMock.stateChanged$.next({ key: 'state', value });
          const expectedCalls = 2; // 1 + the charging update.
          await awaitNPromises(expectedCalls + 1);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(expectedCalls);
          expect(logger.warn).not.toHaveBeenCalled();
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalState', RvcOperationalState.OperationalState.SeekingCharger);
        });

        test('error', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'state', value: 'error' });
          const expectedCalls = 2; // 1 + the charging update.
          await awaitNPromises(expectedCalls + 1);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(expectedCalls);
          expect(logger.warn).not.toHaveBeenCalled();
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalState', RvcOperationalState.OperationalState.Error);
        });

        test('fully-charged', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'state', value: 'fully-charged' });
          const expectedCalls = 2; // 1 + the charging update.
          await awaitNPromises(expectedCalls + 1);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(expectedCalls);
          expect(logger.warn).not.toHaveBeenCalled();
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalState', RvcOperationalState.OperationalState.Docked);
        });

        test.each(['charging-error'])('%s', async (value) => {
          deviceManagerMock.stateChanged$.next({ key: 'state', value });
          const expectedCalls = 3; // 2 + the charging update.
          await awaitNPromises(expectedCalls + 1);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(expectedCalls);
          expect(logger.warn).not.toHaveBeenCalled();
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalState', RvcOperationalState.OperationalState.Error);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalError', { errorStateId: RvcOperationalState.ErrorState.FailedToFindChargingDock });
        });

        test.each(['initializing', 'idle', 'sleeping'])('%s', async (value) => {
          deviceManagerMock.stateChanged$.next({ key: 'state', value });
          const expectedCalls = 3; // 2 + the charging update.
          await awaitNPromises(expectedCalls + 1);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(expectedCalls);
          expect(logger.warn).not.toHaveBeenCalled();
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcRunMode, 'currentMode', 1);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalState', RvcOperationalState.OperationalState.Stopped);
        });

        test('charging', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'state', value: 'charging' });
          const expectedCalls = 2; // the charging "true" updates (2).
          await awaitNPromises(expectedCalls + 1);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(expectedCalls);
          expect(logger.warn).not.toHaveBeenCalled();
          expect(updateAttributeSpy).toHaveBeenCalledWith(PowerSource, 'batChargeState', PowerSource.BatChargeState.IsCharging);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalState', RvcOperationalState.OperationalState.Charging);
        });
      });
    });

    describe('operational errors', () => {
      beforeEach(async () => {
        await deviceAccessory.postRegister();
        updateAttributeSpy.mockClear();
      });

      test('reports the error state and details', async () => {
        deviceManagerMock.errorChanged$.next({ id: 8, description: 'Device stuck' });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalError', {
          // The model is not a Roborock in the tests, so the message is used
          errorStateId: RvcOperationalState.ErrorState.Stuck,
          errorStateDetails: 'Device stuck',
        });
        expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalState', RvcOperationalState.OperationalState.Error);
      });

      test('maps the message for non-Roborock models', async () => {
        deviceManagerMock.errorChanged$.next({ id: 3, description: 'Wheels are stuck' });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalError', {
          errorStateId: RvcOperationalState.ErrorState.WheelsJammed,
          errorStateDetails: 'Wheels are stuck',
        });
      });

      test('clears the error', async () => {
        (deviceManagerMock.errorChanged$ as unknown as Subject<null>).next(null);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalError', { errorStateId: RvcOperationalState.ErrorState.NoError });
        expect(updateAttributeSpy).not.toHaveBeenCalledWith(RvcOperationalState, 'operationalState', expect.anything());
      });
    });

    describe('auxiliary states and operation tracking', () => {
      const operationalStateServer = { beginOperation: jest.fn(), completeOperation: jest.fn() };

      beforeEach(async () => {
        jest.spyOn(endpoint, 'act').mockImplementation(((actor: (agent: unknown) => unknown) => actor({ get: () => operationalStateServer })) as unknown as typeof endpoint.act);
        await deviceAccessory.postRegister();
        updateAttributeSpy.mockClear();
      });

      const emitState = async (value: string) => {
        deviceManagerMock.stateChanged$.next({ key: 'state', value });
        await new Promise((resolve) => setTimeout(resolve, 0));
      };

      test.each([
        ['dust-collection', RvcOperationalState.OperationalState.EmptyingDustBin],
        ['drying', RvcOperationalState.OperationalState.CleaningMop],
        ['building', RvcOperationalState.OperationalState.UpdatingMaps],
      ])('maps %p to %p', async (state, expected) => {
        await emitState(state);
        expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalState', expected);
        expect(logger.warn).not.toHaveBeenCalled();
      });

      test('tracks operations started outside Matter (for the OperationCompletion event)', async () => {
        await emitState('cleaning');
        expect(operationalStateServer.beginOperation).toHaveBeenCalledTimes(1);
        expect(operationalStateServer.completeOperation).not.toHaveBeenCalled();

        await emitState('returning');
        expect(operationalStateServer.completeOperation).toHaveBeenCalledTimes(1);
      });

      test('does not fail when tracking the operation fails', async () => {
        jest.spyOn(endpoint, 'act').mockImplementation(() => {
          throw new Error('Endpoint is in the inactive state');
        });
        await emitState('cleaning');
        expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState, 'operationalState', RvcOperationalState.OperationalState.Running);
      });
    });
  });
});
