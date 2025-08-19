import { jest } from '@jest/globals';
import type { Logger } from 'matterbridge/logger';
import { RoboticVacuumCleaner } from 'matterbridge/devices';
import { ServiceArea } from 'matterbridge/matter/clusters';
import { MatterbridgeServiceAreaServer } from 'matterbridge';

import { deviceManagerMock } from './vacuum_device_accessory.test.mock.js';
import type { VacuumDeviceAccessory } from './vacuum_device_accessory.js';

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
  });
});
