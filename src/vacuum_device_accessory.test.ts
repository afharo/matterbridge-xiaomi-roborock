import { jest } from '@jest/globals';
import type { Logger } from 'matterbridge/logger';
import { RoboticVacuumCleaner } from 'matterbridge/devices';
import { PowerSource, RvcCleanMode, RvcOperationalState, RvcRunMode, ServiceArea } from 'matterbridge/matter/clusters';
import { MatterbridgeServiceAreaServer } from 'matterbridge';

import { deviceManagerMock, findSpeedModesMock } from './vacuum_device_accessory.test.mock.js';
import type { VacuumDeviceAccessory } from './vacuum_device_accessory.js';
import { speedmodes } from './models/speedmodes.js';
import { watermodes } from './models/watermodes.js';

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

    describe('serviceAreas', () => {
      test('should retrieve service areas via room mappings', async () => {
        deviceManagerMock.device.getRoomMap.mockResolvedValue([
          ['16', 'Living room'],
          ['17', 'Kitchen'],
        ]);

        const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();

        deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);

        const endpoint = await endpointPromise;
        expect(endpoint).toBeInstanceOf(RoboticVacuumCleaner);
        expect(endpoint.behaviors.optionsFor(MatterbridgeServiceAreaServer.with(ServiceArea.Feature.Maps))).toMatchInlineSnapshot(`
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
          // This one is taken
          ['timer-id', 'off', ['0 0 * * *', ['action', { segments: '16,17' }]]],
        ]);

        const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();

        deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);

        const endpoint = await endpointPromise;
        expect(endpoint).toBeInstanceOf(RoboticVacuumCleaner);
        expect(endpoint.behaviors.optionsFor(MatterbridgeServiceAreaServer.with(ServiceArea.Feature.Maps))).toMatchInlineSnapshot(`
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
        expect(endpoint.behaviors.optionsFor(MatterbridgeServiceAreaServer.with(ServiceArea.Feature.Maps))).toMatchInlineSnapshot(`
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
                    "areaType": 50,
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
                    "areaType": 46,
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
          expect(endpoint.commandHandler.hasHandler('changeToMode')).toBe(true);
        });

        describe('rvcCleanMode', () => {
          test('sets the fan speed (but not the water level)', async () => {
            endpoint.commandHandler.executeHandler('changeToMode', { request: { newMode: 1 }, cluster: 'rvcCleanMode' });
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

            endpoint.commandHandler.executeHandler('changeToMode', { request: { newMode: 1 }, cluster: 'rvcCleanMode' });
            await Promise.resolve(); // Just waiting for the pending promises to run
            expect(deviceManagerMock.device.changeFanSpeed).toHaveBeenCalledWith(105);
            expect(deviceManagerMock.device.setWaterBoxMode).toHaveBeenCalledWith(200);
          });
        });

        describe('rvcRunMode', () => {
          test('on Idle, it does nothing', async () => {
            endpoint.commandHandler.executeHandler('changeToMode', { request: { newMode: 1 }, cluster: 'rvcRunMode' });
            expect(logger.warn).not.toHaveBeenCalled();
          });

          test('on unknown mode, it logs a warning', async () => {
            endpoint.commandHandler.executeHandler('changeToMode', { request: { newMode: 3 }, cluster: 'rvcRunMode' });
            expect(logger.warn).toHaveBeenCalledWith('[Name=Test Vacuum][Model=unknown] Unknown mode 3');
          });

          test('on Cleaning, it starts a full cleaning if no rooms are selected', async () => {
            endpoint.commandHandler.executeHandler('changeToMode', { request: { newMode: 2 }, cluster: 'rvcRunMode' });
            expect(logger.info).toHaveBeenCalledWith('[Name=Test Vacuum][Model=unknown] Initiating full cleaning...');
            expect(deviceManagerMock.device.activateCleaning).toHaveBeenCalled();
            expect(deviceManagerMock.device.cleanRooms).not.toHaveBeenCalled();
          });

          test('on Cleaning, it starts a room cleaning if any rooms are selected', async () => {
            jest.spyOn(endpoint, 'getAttribute').mockReturnValueOnce([16, 17]);

            endpoint.commandHandler.executeHandler('changeToMode', { request: { newMode: 2 }, cluster: 'rvcRunMode' });
            expect(logger.info).toHaveBeenCalledWith('[Name=Test Vacuum][Model=unknown] Initiating room cleaning...');
            expect(deviceManagerMock.device.activateCleaning).not.toHaveBeenCalled();
            expect(deviceManagerMock.device.cleanRooms).toHaveBeenCalledWith([16, 17]);
          });
        });
      });

      describe('stop', () => {
        test('calls deactivate cleaning when triggered', async () => {
          endpoint.commandHandler.executeHandler('stop');
          expect(deviceManagerMock.device.deactivateCleaning).toHaveBeenCalled();
        });
      });

      describe('pause', () => {
        test('pauses the current cleaning', async () => {
          endpoint.commandHandler.executeHandler('pause');
          expect(deviceManagerMock.device.pause).toHaveBeenCalled();
        });
      });

      describe('resume', () => {
        test('resumes the current full cleaning', async () => {
          endpoint.commandHandler.executeHandler('resume');
          expect(deviceManagerMock.device.activateCleaning).toHaveBeenCalled();
        });

        test('resumes the current room cleaning if areas were previously selected', async () => {
          jest.spyOn(endpoint, 'getAttribute').mockReturnValueOnce([16, 17]);
          endpoint.commandHandler.executeHandler('resume');
          expect(deviceManagerMock.device.resumeCleanRooms).toHaveBeenCalledWith([16, 17]);
        });
      });

      describe('goHome', () => {
        test('sends the RVC to the charger', async () => {
          jest.spyOn(endpoint, 'updateAttribute').mockResolvedValueOnce(true);
          endpoint.commandHandler.executeHandler('goHome');
          await Promise.resolve(); // Just waiting for the pending promises to run
          expect(deviceManagerMock.device.activateCharging).toHaveBeenCalled();
        });
      });

      describe('identify', () => {
        test('triggers the findme action', async () => {
          endpoint.commandHandler.executeHandler('identify');
          expect(deviceManagerMock.device.find).toHaveBeenCalled();
        });
      });

      describe('selectAreas', () => {
        test('sets the selected areas', async () => {
          const updateAttributeSpy = jest.spyOn(endpoint, 'updateAttribute').mockResolvedValueOnce(true);
          endpoint.commandHandler.executeHandler('selectAreas', { request: { newAreas: [17] }, attributes: { supportedAreas: [{ areaId: 16 }, { areaId: 17 }] } });
          expect(updateAttributeSpy).toHaveBeenCalledWith(ServiceArea.Cluster.id, 'selectedAreas', [17]);
        });

        test('sets an empty array as selected areas when all rooms are selected', async () => {
          const updateAttributeSpy = jest.spyOn(endpoint, 'updateAttribute').mockResolvedValueOnce(true);
          endpoint.commandHandler.executeHandler('selectAreas', { request: { newAreas: [16, 17] }, attributes: { supportedAreas: [{ areaId: 16 }, { areaId: 17 }] } });
          expect(updateAttributeSpy).toHaveBeenCalledWith(ServiceArea.Cluster.id, 'selectedAreas', []);
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
        expect(updateAttributeSpy).toHaveBeenCalledWith(ServiceArea.Cluster.id, 'currentArea', null);
        expect(updateAttributeSpy).toHaveBeenCalledWith(ServiceArea.Cluster.id, 'supportedAreas', []);
      });

      test("when serviceAreas have been discovered, it shouldn't enforce empty values", async () => {
        deviceManagerMock.device.getRoomMap.mockResolvedValue([
          ['16', 'Living room'],
          ['17', 'Kitchen'],
        ]);

        const endpointPromise = deviceAccessory.initializeMatterbridgeEndpoint();
        deviceManagerMock.deviceConnected$.next(deviceManagerMock.device);
        endpoint = (await endpointPromise) as RoboticVacuumCleaner;

        await deviceAccessory.postRegister();
        expect(updateAttributeSpy).not.toHaveBeenCalled();
      });
    });

    describe('stateChangedHandlers', () => {
      beforeEach(async () => {
        await deviceAccessory.postRegister();
      });

      describe('batteryLevel', () => {
        test('updates the battery level', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'batteryLevel', value: 100 });
          await Promise.resolve(); // Just waiting for the pending promises to run
          expect(updateAttributeSpy).toHaveBeenCalledTimes(2);
          expect(updateAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batPercentRemaining', 200);
          expect(updateAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batChargeLevel', PowerSource.BatChargeLevel.Ok);
        });

        test('updates the battery level (<20% - Warning)', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'batteryLevel', value: 10 });
          await Promise.resolve(); // Just waiting for the pending promises to run
          expect(updateAttributeSpy).toHaveBeenCalledTimes(2);
          expect(updateAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batPercentRemaining', 20);
          expect(updateAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batChargeLevel', PowerSource.BatChargeLevel.Warning);
        });
      });

      describe('charging', () => {
        test('when charging == true', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'charging', value: true });
          await Promise.resolve(); // Just waiting for the pending promises to run
          expect(updateAttributeSpy).toHaveBeenCalledTimes(2);
          expect(updateAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batChargeState', PowerSource.BatChargeState.IsCharging);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Charging);
        });

        test('when charging == true and battery level is 100%', async () => {
          deviceManagerMock.property.mockReturnValueOnce(100);
          deviceManagerMock.stateChanged$.next({ key: 'charging', value: true });
          await Promise.resolve(); // Just waiting for the pending promises to run
          expect(updateAttributeSpy).toHaveBeenCalledTimes(2);
          expect(updateAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batChargeState', PowerSource.BatChargeState.IsAtFullCharge);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Docked);
        });

        test('when charging == false', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'charging', value: false });
          await Promise.resolve(); // Just waiting for the pending promises to run
          expect(updateAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batChargeState', PowerSource.BatChargeState.IsNotCharging);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(1);
        });
      });

      describe('cleaning/in_cleaning', () => {
        test.each([
          ['cleaning', true],
          ['in_cleaning', 1],
          ['in_cleaning', true],
        ])('when %s == %s', async (key, value) => {
          deviceManagerMock.stateChanged$.next({ key, value });
          await Promise.resolve();
          expect(updateAttributeSpy).toHaveBeenCalledTimes(2);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcRunMode.Cluster.id, 'currentMode', 2);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Running);
        });

        test.each([
          ['cleaning', false],
          ['in_cleaning', 0],
          ['in_cleaning', false],
        ])('when %s == %s', async (key, value) => {
          deviceManagerMock.stateChanged$.next({ key, value });
          await Promise.resolve();
          expect(updateAttributeSpy).toHaveBeenCalledTimes(1);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcRunMode.Cluster.id, 'currentMode', 1);
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
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.SeekingCharger);
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
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcCleanMode.Cluster.id, 'currentMode', 1);
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
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcCleanMode.Cluster.id, 'currentMode', 6);
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
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcRunMode.Cluster.id, 'currentMode', 1);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Paused);
        });

        test.each(['cleaning', 'spot-cleaning', 'room-cleaning', 'zone-cleaning'])('%s', async (value) => {
          deviceManagerMock.stateChanged$.next({ key: 'state', value });
          const expectedCalls = 3; // 2 + the charging update.
          await awaitNPromises(expectedCalls + 1);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(expectedCalls);
          expect(logger.warn).not.toHaveBeenCalled();
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcRunMode.Cluster.id, 'currentMode', 2);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Running);
        });

        test.each(['returning', 'docking'])('%s', async (value) => {
          deviceManagerMock.stateChanged$.next({ key: 'state', value });
          const expectedCalls = 2; // 1 + the charging update.
          await awaitNPromises(expectedCalls + 1);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(expectedCalls);
          expect(logger.warn).not.toHaveBeenCalled();
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.SeekingCharger);
        });

        test('error', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'state', value: 'error' });
          const expectedCalls = 2; // 1 + the charging update.
          await awaitNPromises(expectedCalls + 1);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(expectedCalls);
          expect(logger.warn).not.toHaveBeenCalled();
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Error);
        });

        test('fully-charged', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'state', value: 'fully-charged' });
          const expectedCalls = 2; // 1 + the charging update.
          await awaitNPromises(expectedCalls + 1);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(expectedCalls);
          expect(logger.warn).not.toHaveBeenCalled();
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Docked);
        });

        test.each(['charging-error'])('%s', async (value) => {
          deviceManagerMock.stateChanged$.next({ key: 'state', value });
          const expectedCalls = 3; // 2 + the charging update.
          await awaitNPromises(expectedCalls + 1);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(expectedCalls);
          expect(logger.warn).not.toHaveBeenCalled();
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Error);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalError', RvcOperationalState.ErrorState.FailedToFindChargingDock);
        });

        test.each(['initializing', 'idle', 'sleeping'])('%s', async (value) => {
          deviceManagerMock.stateChanged$.next({ key: 'state', value });
          const expectedCalls = 3; // 2 + the charging update.
          await awaitNPromises(expectedCalls + 1);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(expectedCalls);
          expect(logger.warn).not.toHaveBeenCalled();
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcRunMode.Cluster.id, 'currentMode', 1);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Stopped);
        });

        test('charging', async () => {
          deviceManagerMock.stateChanged$.next({ key: 'state', value: 'charging' });
          const expectedCalls = 2; // the charging "true" updates (2).
          await awaitNPromises(expectedCalls + 1);
          expect(updateAttributeSpy).toHaveBeenCalledTimes(expectedCalls);
          expect(logger.warn).not.toHaveBeenCalled();
          expect(updateAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batChargeState', PowerSource.BatChargeState.IsCharging);
          expect(updateAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Charging);
        });
      });
    });
  });
});
