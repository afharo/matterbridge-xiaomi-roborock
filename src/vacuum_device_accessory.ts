import { MatterbridgeEndpoint } from 'matterbridge';
import { RoboticVacuumCleaner } from 'matterbridge/devices';
import type { Logger } from 'matterbridge/logger';
import { firstValueFrom, mergeMap, Subject, takeUntil } from 'rxjs';
import { PowerSource, RvcRunMode, RvcCleanMode, RvcOperationalState, ServiceArea } from 'matterbridge/matter/clusters';

import { applyConfigDefaults, type Config } from './services/config_service.js';
import { DeviceManager } from './services/device_manager.js';
import { getLogger, type ModelLogger } from './utils/logger.js';
import { findSpeedModes } from './utils/find_speed_modes.js';
import type { ModelDefinition } from './models/types.js';
import { MODELS } from './models/models.js';

type SupportedCleanMode = RvcCleanMode.ModeOption & { miLevels: { vacuum: number; mop?: number } };

const SUPPORTED_MODES: RvcRunMode.ModeOption[] = [
  { label: 'Idle', mode: 1, modeTags: [{ value: RvcRunMode.ModeTag.Idle }] },
  { label: 'Cleaning', mode: 2, modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }] },

  // I noticed that the matterbridge code has hardcoded 1 and 2 for Idle and Cleaning.
  // However, upgrading from a pre-existing version will fail if 0 is not a valid mode (because of its persisted state).
  // TODO: remove it in a few versions.
  { label: 'Deprecated Idle', mode: 0, modeTags: [{ value: RvcRunMode.ModeTag.Idle }] },
];

const SUPPORTED_OPERATIONAL_STATES: RvcOperationalState.OperationalStateStruct[] = [
  { operationalStateId: RvcOperationalState.OperationalState.Docked },
  { operationalStateId: RvcOperationalState.OperationalState.SeekingCharger },
  { operationalStateId: RvcOperationalState.OperationalState.Charging },
  { operationalStateId: RvcOperationalState.OperationalState.Running },
  { operationalStateId: RvcOperationalState.OperationalState.Stopped },
  { operationalStateId: RvcOperationalState.OperationalState.Paused },
  { operationalStateId: RvcOperationalState.OperationalState.Error },
];

export class VacuumDeviceAccessory {
  private readonly config: Config;
  private readonly log: ModelLogger;
  private readonly deviceManager: DeviceManager;
  private readonly stop$ = new Subject<void>();
  private endpoint?: RoboticVacuumCleaner;
  private serviceAreas: ServiceArea.Area[] = [];
  private modelSpeeds: ModelDefinition = MODELS.default[0];

  constructor(config: Partial<Config>, logger: Logger) {
    this.config = applyConfigDefaults(config);
    this.log = getLogger(logger, this.config);
    this.deviceManager = new DeviceManager(this.log, this.config);
  }

  public async initializeMatterbridgeEndpoint(): Promise<MatterbridgeEndpoint> {
    this.log.info(`Waiting for the connection to the vacuum to be established...`);

    // Wait for the device to be connected
    await firstValueFrom(this.deviceManager.deviceConnected$);
    this.log.info(`Connected to device!`);

    const serialNumber = await this.deviceManager.device.getSerialNumber().catch((error) => {
      this.log.warn(`Failed to retrieve serial number: ${error}`);
      return 'Unknown';
    });
    const deviceInfo = await this.deviceManager.device.getDeviceInfo().catch((error) => {
      this.log.warn(`Failed to retrieve device info: ${error}`);
      return { fw_ver: 'Unknown' };
    });
    this.log.info(`Serial number: ${serialNumber}`);
    this.log.info(`Firmware: ${deviceInfo.fw_ver}`);

    this.modelSpeeds = findSpeedModes(this.deviceManager.model, deviceInfo.fw_ver);
    const supportedCleanModes = this.supportedCleanModes;

    this.serviceAreas = await this.getServiceAreas().catch((error) => {
      this.log.warn(`Failed to retrieve service areas: ${error}`);
      return [];
    });

    this.endpoint = new RoboticVacuumCleaner(
      this.config.name,
      serialNumber,
      'server', // Use 'server' or 'matter' if you want Apple Home compatibility.
      // RvcRunMode
      SUPPORTED_MODES[0].mode,
      SUPPORTED_MODES,
      // RvcCleanMode
      supportedCleanModes[0].mode,
      supportedCleanModes,
      undefined,
      undefined,
      RvcOperationalState.OperationalState.Docked,
      SUPPORTED_OPERATIONAL_STATES,
      this.serviceAreas.length > 0 ? this.serviceAreas : undefined,
      [],
      this.serviceAreas[0]?.areaId,
    );

    this.endpoint.vendorName = 'Xiaomi';
    this.endpoint.productName = this.deviceManager.model;
    this.endpoint.softwareVersionString = deviceInfo.fw_ver;
    this.endpoint.productUrl = 'https://github.com/afharo/matterbridge-xiaomi-roborock';
    this.endpoint.hardwareVersionString = this.deviceManager.model;

    this.endpoint.lifecycle.destroying.on(() => {
      this.deviceManager.stop();
    });

    this.endpoint.addCommandHandler('changeToMode', async (data) => {
      this.log.debug(`Start command received: ${JSON.stringify(data)}`);
      switch (data.cluster) {
        case 'rvcCleanMode': {
          // Defines the selected cleaning mode (mop or vacuum)
          const newCleanMode = supportedCleanModes[data.request.newMode - 1];
          await this.deviceManager.device.changeFanSpeed(newCleanMode.miLevels.vacuum);
          if (typeof newCleanMode.miLevels.mop === 'number') {
            await this.deviceManager.device.setWaterBoxMode(newCleanMode.miLevels.mop);
          }
          break;
        }

        case 'rvcRunMode':
          // Actual start command
          switch (data.request.newMode) {
            case 1: // Idle
              // TODO: Confirm what to do here
              // await this.deviceManager.device.pause();
              break;
            case 2: {
              // Cleaning
              const selectedAreas = this.selectedAreas;
              if (selectedAreas.length === 0) {
                this.log.info(`Initiating full cleaning...`);
                await this.deviceManager.device.activateCleaning();
              } else {
                this.log.info(`Initiating room cleaning...`);
                await this.deviceManager.device.cleanRooms(selectedAreas);
              }
              break;
            }
            default:
              this.log.warn(`Unknown mode ${data.request.newMode}`);
              break;
          }
          break;
      }
    });
    this.endpoint.addCommandHandler('stop', async () => {
      await this.deviceManager.device.deactivateCleaning();
    });
    this.endpoint.addCommandHandler('pause', async () => {
      await this.deviceManager.device.pause();
    });
    this.endpoint.addCommandHandler('resume', async () => {
      const selectedAreas = this.selectedAreas;
      if (selectedAreas.length > 0) {
        await this.deviceManager.device.resumeCleanRooms(selectedAreas);
      } else {
        await this.deviceManager.device.activateCleaning();
      }
    });
    this.endpoint.addCommandHandler('goHome', async () => {
      await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.SeekingCharger);
      await this.deviceManager.device.activateCharging();
    });
    this.endpoint.addCommandHandler('identify', async () => {
      await this.deviceManager.device.find();
    });
    this.endpoint.addCommandHandler('selectAreas', async (data) => {
      this.log.debug(`Select areas command received: ${JSON.stringify(data)}`);
      let selectedAreas = data.request.newAreas;
      if ((data.attributes.supportedAreas as ServiceArea.Area[])?.length === selectedAreas.length) {
        selectedAreas = []; // Force empty if all areas are selected
      }
      await this.endpoint?.updateAttribute(ServiceArea.Cluster.id, 'selectedAreas', selectedAreas);
    });

    return this.endpoint;
  }

  public async postRegister() {
    this.deviceManager.stateChanged$
      .pipe(
        mergeMap(async ({ key, value }) => {
          this.log.debug(`Device state changed: ${key} = ${value}`);

          if (key in this.stateChangedHandlers) {
            // @ts-expect-error key is a string, this.stateChangedHandlers is not an index signature, and value is unknown
            await this.stateChangedHandlers[key](value);
          }
        }),
        takeUntil(this.stop$),
      )
      .subscribe();

    // If no areas are found, we need to clear the serviceAreas and the currentArea attributes
    // (the constructor doesn't allow setting them to null as it fallbacks to defaults).
    if (this.serviceAreas.length === 0) {
      await this.endpoint?.updateAttribute(ServiceArea.Cluster.id, 'currentArea', null);
      await this.endpoint?.updateAttribute(ServiceArea.Cluster.id, 'supportedAreas', []);
    }
  }

  public stop() {
    this.deviceManager.stop();
    this.stop$.next();
    this.stop$.complete();
  }

  private readonly stateChangedHandlers = {
    batteryLevel: async (level: number) => {
      this.log.debug(`Battery level: ${level}`);
      await this.endpoint?.updateAttribute(PowerSource.Cluster.id, 'batPercentRemaining', level * 2);
      await this.endpoint?.updateAttribute(PowerSource.Cluster.id, 'batChargeLevel', getBatteryChargeLevel(level));
    },
    charging: async (charging: boolean) => {
      await this.endpoint?.updateAttribute(
        PowerSource.Cluster.id,
        'batChargeState',
        charging === true ? PowerSource.BatChargeState.IsCharging : PowerSource.BatChargeState.IsNotCharging,
      );
      if (charging === true) {
        await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Charging);
      }
    },
    cleaning: async (cleaning: boolean) => {
      await this.endpoint?.updateAttribute(RvcRunMode.Cluster.id, 'currentMode', cleaning === false ? SUPPORTED_MODES[0].mode : SUPPORTED_MODES[1].mode);
      if (cleaning) {
        await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Running);
      }
    },
    in_cleaning: async (inCleaning: number) => {
      await this.stateChangedHandlers.cleaning(!!inCleaning);
    },
    in_returning: async (inReturning: number) => {
      if (inReturning) {
        await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.SeekingCharger);
      }
    },
    fanSpeed: async (miLevel: number) => {
      const currentMopLevel = this.deviceManager.property<number>('water_box_mode');
      const cleanMode = this.supportedCleanModes.find(({ miLevels }) => miLevels.vacuum === miLevel && miLevels.mop === currentMopLevel);
      if (cleanMode) {
        await this.endpoint?.updateAttribute(RvcCleanMode.Cluster.id, 'currentMode', cleanMode.mode);
      }
    },
    water_box_mode: async (miLevel: number) => {
      const currentVacuumLevel = this.deviceManager.property<number>('fanSpeed');
      const cleanMode = this.supportedCleanModes.find(({ miLevels }) => miLevels.mop === miLevel && miLevels.vacuum === currentVacuumLevel);
      if (cleanMode) {
        await this.endpoint?.updateAttribute(RvcCleanMode.Cluster.id, 'currentMode', cleanMode.mode);
      }
    },
    state: async (state: string) => {
      await this.stateChangedHandlers.charging(state === 'charging');
      switch (state) {
        case 'paused':
          await this.endpoint?.updateAttribute(RvcRunMode.Cluster.id, 'currentMode', SUPPORTED_MODES[0].mode);
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Paused);
          break;

        case 'cleaning':
        case 'spot-cleaning':
        case 'room-cleaning':
        case 'zone-cleaning':
          await this.endpoint?.updateAttribute(RvcRunMode.Cluster.id, 'currentMode', SUPPORTED_MODES[1].mode);
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Running);
          break;

        case 'returning': // We might want to emit the optional RvcOperationalState.Cluster.events.operationCompletion when completed cleaning (or when errors occur)
        case 'docking':
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.SeekingCharger);
          break;

        case 'error':
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Error);
          // await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalError', RvcOperationalState.ErrorState.CommandInvalidInState);
          // We might want to emit the optional RvcOperationalState.Cluster.events.operationCompletion when completed cleaning (or when errors occur)
          break;

        case 'fully-charged':
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Docked);
          break;

        case 'charging-error':
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Error);
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalError', RvcOperationalState.ErrorState.FailedToFindChargingDock);
          break;

        case 'initializing':
        case 'idle':
        case 'sleeping':
          await this.endpoint?.updateAttribute(RvcRunMode.Cluster.id, 'currentMode', SUPPORTED_MODES[0].mode);
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Stopped);
          break;

        case 'charging':
          await this.endpoint?.updateAttribute(RvcRunMode.Cluster.id, 'currentMode', SUPPORTED_MODES[0].mode);
          await this.endpoint?.updateAttribute(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Charging);
          break;

        default:
          this.log.warn(`Unknown state: ${state}`);
          break;
      }
    },
  };

  private async getServiceAreas(): Promise<ServiceArea.Area[]> {
    // It should try to retrieve the map from the device.
    // If empty, try the timer workaround.
    // Else, return an empty array.

    const roomMapping = await this.deviceManager.device.getRoomMap();
    if (roomMapping.length > 0) {
      this.log.info(`Room mapping found: ${JSON.stringify(roomMapping)}`);
      this.log.info(`Creating service areas from room mapping...`);
      return roomMapping.map(
        ([roomId, roomName]): ServiceArea.Area => ({
          areaId: parseInt(roomId),
          mapId: null,
          areaInfo: {
            locationInfo: {
              locationName: `${roomName}`,
              floorNumber: null,
              areaType: null,
            },
            landmarkInfo: null,
          },
        }),
      );
    }

    const timers = await this.deviceManager.device.getTimer();
    if (timers.length > 0) {
      const timer = timers.find(([id, status, definition]) => {
        if (['off', 'disabled'].includes(status)) {
          const [cronExpression, action] = definition;
          // Who sets up a timer that runs at midnight for a Vacuum Cleaner? This should be it.
          if (cronExpression.startsWith('0 0 * *')) {
            const [, params] = action;
            if (params.segments) {
              this.log.debug(`Potential timer found with ID ${id}: ${JSON.stringify(action)}}`);
              return true;
            }
          }
        }
        return false;
      });
      if (timer) {
        const segments = timer[2][1][1].segments.split(',');
        return segments.map(
          (roomId, index): ServiceArea.Area => ({
            areaId: parseInt(roomId),
            mapId: null,
            areaInfo: {
              locationInfo: {
                // Can't know the name in these models. Users will need to rename it in their apps.
                locationName: this.config.roomNames?.[index] ?? `Room ${roomId}`,
                floorNumber: null,
                areaType: null,
              },
              landmarkInfo: null,
            },
          }),
        );
      }
    }

    return [];
  }

  private get selectedAreas(): number[] {
    const selectedAreas = (this.endpoint?.getAttribute(ServiceArea.Cluster.id, 'selectedAreas') as number[] | undefined) ?? [];
    if (selectedAreas.length === this.serviceAreas.length) {
      // If all selected, return empty array to trigger full cleaning
      return [];
    }
    return selectedAreas;
  }

  private get supportedCleanModes(): Array<SupportedCleanMode> {
    const [vacuumSpeedOff, ...vacuumSpeedModes] = this.modelSpeeds.speed;
    const [mopSpeedOff, ...mopSpeedModes] = this.modelSpeeds.waterspeed ?? [];

    let mode = 1;

    const supportedCleanModes: SupportedCleanMode[] = vacuumSpeedModes.map(({ name, miLevel, label }) => ({
      label: `${name} Vacuum`,
      mode: mode++,
      modeTags: [
        // If the label is "Mop", do not add "Vacuum" as a mode tag.
        ...(label === RvcCleanMode.ModeTag.Mop ? [] : [{ value: RvcCleanMode.ModeTag.Vacuum }]),
        { value: label },
      ],
      miLevels: {
        vacuum: miLevel,
        mop: mopSpeedOff?.miLevel,
      },
    }));

    mopSpeedModes.forEach(({ name, miLevel, label }) => {
      supportedCleanModes.push({
        label: `${name} Mop`,
        mode: mode++,
        modeTags: [{ value: RvcCleanMode.ModeTag.Mop }, { value: label }],
        miLevels: {
          vacuum: vacuumSpeedOff.miLevel,
          mop: miLevel,
        },
      });
    });

    return supportedCleanModes;
  }
}

/**
 *
 * @param {number} batteryLevel The battery level in percentage
 * @returns {PowerSource.BatChargeLevel} The battery charge level (OK, Warning, Critical)
 */
function getBatteryChargeLevel(batteryLevel: number): PowerSource.BatChargeLevel {
  return batteryLevel < 10 ? PowerSource.BatChargeLevel.Critical : batteryLevel < 20 ? PowerSource.BatChargeLevel.Warning : PowerSource.BatChargeLevel.Ok;
}
