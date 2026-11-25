import { MatterbridgeEndpoint } from 'matterbridge';
import { MatterbridgeRvcOperationalStateServer, RoboticVacuumCleaner } from 'matterbridge/devices';
import type { Logger } from 'matterbridge/logger';
import { firstValueFrom, mergeMap, Observable, Subject, switchMap, takeUntil } from 'rxjs';
import type { MapWatcher } from 'node-miio';
import { PowerSource, RvcRunMode, RvcCleanMode, RvcOperationalState, ServiceArea } from 'matterbridge/matter/clusters';

import { applyConfigDefaults, type Config } from './services/config_service.js';
import type { CloudService } from './services/cloud_service.js';
import { DeviceManager } from './services/device_manager.js';
import { getLogger, type ModelLogger } from './utils/logger.js';
import { findSpeedModes, isSupportedLevel, resolveSpeedModes } from './utils/find_speed_modes.js';
import type { ModelDefinition } from './models/types.js';
import { type MiioError, toAuxiliaryOperationalState, toErrorStateId } from './utils/rvc_mappings.js';
import { buildCleanModePresets } from './utils/clean_mode_presets.js';
import type { GetTimerResponseTimer, RoomMapping } from './utils/miio_types.js';

type SupportedCleanMode = RvcCleanMode.ModeOption & { miLevels: { vacuum?: number; mop?: number; cleaningType?: number } };

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
  // Revision 4 of the cluster: dock and maintenance activities
  { operationalStateId: RvcOperationalState.OperationalState.EmptyingDustBin },
  { operationalStateId: RvcOperationalState.OperationalState.CleaningMop },
  { operationalStateId: RvcOperationalState.OperationalState.FillingWaterTank },
  { operationalStateId: RvcOperationalState.OperationalState.UpdatingMaps },
];

/** Operational states that end an operation (for the OperationCompletion event) */
const OPERATION_END_STATES = new Set<RvcOperationalState.OperationalState>([
  RvcOperationalState.OperationalState.SeekingCharger,
  RvcOperationalState.OperationalState.Charging,
  RvcOperationalState.OperationalState.Docked,
  RvcOperationalState.OperationalState.Stopped,
]);

/** How long to wait for the robot on startup, when there's info saved from a previous connection */
export const CONNECT_TIMEOUT_WITH_SNAPSHOT_MS = 15_000;
/** How long to wait for the robot on startup, when it was never connected before */
export const CONNECT_TIMEOUT_MS = 60_000;

/** Everything needed to build the Matter device, saved after each successful connection */
export interface DeviceSnapshot {
  model: string;
  serialNumber: string;
  firmware: string;
  modelSpeeds: ModelDefinition;
  serviceAreas: ServiceArea.Area[];
  supportedMaps: ServiceArea.Map[];
}

/** Persistent storage (e.g. the platform's `context`) */
export interface SnapshotStore {
  get<T>(key: string, defaultValue?: T): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

/**
 * Whether a clean mode is the robot's current one: every level the mode sets matches the robot's. The levels it doesn't
 * set (e.g. the fan speed of the mop-only modes, never sent to the robot) match any, but it must set at least one.
 *
 * @param {{ vacuum?: number; mop?: number }} miLevels The clean mode's levels
 * @param {number} [miLevels.vacuum] The fan speed it sets
 * @param {number} [miLevels.mop] The water level it sets
 * @param {number | undefined} fanSpeed The robot's fan speed
 * @param {number | undefined} waterBoxMode The robot's water level
 * @returns {boolean} `true` if it's the current mode
 */
function levelsMatch(miLevels: { vacuum?: number; mop?: number }, fanSpeed: number | undefined, waterBoxMode: number | undefined): boolean {
  const levels = [
    [miLevels.vacuum, fanSpeed],
    [miLevels.mop, waterBoxMode],
  ].filter(([level]) => isSupportedLevel(level));
  return levels.length > 0 && levels.every(([level, current]) => level === current);
}

export class VacuumDeviceAccessory {
  private readonly config: Config;
  private readonly log: ModelLogger;
  private readonly deviceManager: DeviceManager;
  private readonly stop$ = new Subject<void>();
  private endpoint?: RoboticVacuumCleaner;
  private serviceAreas: ServiceArea.Area[] = [];
  // The default speeds until the model is known
  private modelSpeeds: ModelDefinition = findSpeedModes('');
  /** Saved maps (multi-floor), only when the robot has more than one */
  private supportedMaps: ServiceArea.Map[] = [];
  /** Areas of the current room-cleaning operation (to support SkipArea) */
  private activeAreas: number[] = [];

  constructor(
    config: Partial<Config>,
    logger: Logger,
    private readonly snapshotStore?: SnapshotStore,
    /** The Xiaomi Cloud, to know which room the robot is cleaning (opt-in) */
    private readonly cloudService?: CloudService,
  ) {
    this.config = applyConfigDefaults(config);
    this.log = getLogger(logger, this.config);
    this.deviceManager = new DeviceManager(this.log, this.config, cloudService && ((current) => cloudService.locate({ did: this.config.did, ...current }, { fresh: true })));
  }

  private get snapshotKey() {
    // The did when known: the IP may change
    return `device-snapshot:${this.config.did ?? this.config.ip}:${this.config.name}`;
  }

  private async readSnapshot(): Promise<DeviceSnapshot | undefined> {
    try {
      return (await this.snapshotStore?.get<DeviceSnapshot>(this.snapshotKey)) ?? undefined;
    } catch (error) {
      this.log.debug(`Failed to read the saved device info: ${error}`);
      return undefined;
    }
  }

  private async writeSnapshot(snapshot: DeviceSnapshot) {
    try {
      await this.snapshotStore?.set(this.snapshotKey, snapshot);
    } catch (error) {
      this.log.debug(`Failed to save the device info: ${error}`);
    }
  }

  /**
   * Reads everything needed to build the Matter device from the (connected) robot.
   *
   * The serial number of an already saved robot is kept: Matterbridge derives the endpoint's id and uniqueId from it,
   * so a new one (e.g. node-miio now reading it from `serial-no` instead of `"unknown"`) would make the controllers
   * see a new device, losing its room, name and automations.
   *
   * @param {DeviceSnapshot} [saved] The info saved from the last connection
   * @returns {Promise<DeviceSnapshot>} The device info
   */
  private async takeSnapshot(saved?: DeviceSnapshot): Promise<DeviceSnapshot> {
    const serialNumber = await this.deviceManager.device.getSerialNumber().catch((error) => {
      this.log.warn(`Failed to retrieve serial number: ${error}`);
      return 'Unknown';
    });
    if (saved?.serialNumber && saved.serialNumber !== serialNumber) {
      this.log.debug(`Keeping the saved serial number ${saved.serialNumber} (the robot reports ${serialNumber}), so the controllers don't register it as a new device`);
    }
    const deviceInfo = await this.deviceManager.device.getDeviceInfo().catch((error) => {
      this.log.warn(`Failed to retrieve device info: ${error}`);
      return { fw_ver: 'Unknown' };
    });
    this.log.info(`Serial number: ${serialNumber}`);
    this.log.info(`Firmware: ${deviceInfo.fw_ver}`);

    this.modelSpeeds = await resolveSpeedModes(this.deviceManager.device, this.deviceManager.model, deviceInfo.fw_ver);
    this.serviceAreas = await this.getServiceAreas().catch((error) => {
      this.log.warn(`Failed to retrieve service areas: ${error}`);
      return [];
    });
    this.supportedMaps = [];
    await this.assignMaps();

    return {
      model: this.deviceManager.model,
      serialNumber: saved?.serialNumber || serialNumber,
      firmware: deviceInfo.fw_ver,
      modelSpeeds: this.modelSpeeds,
      serviceAreas: this.serviceAreas,
      supportedMaps: this.supportedMaps,
    };
  }

  private async refreshSnapshotWhenConnected(connected: Promise<boolean>, saved: DeviceSnapshot) {
    try {
      await connected;
      const fresh = await this.takeSnapshot(saved);
      await this.writeSnapshot(fresh);
      if (JSON.stringify(fresh) !== JSON.stringify(saved)) {
        this.log.info(`The vacuum's modes or rooms changed since the last connection: restart the plugin to apply them.`);
      }
    } catch (error) {
      this.log.debug(`Failed to refresh the saved device info: ${error}`);
    }
  }

  /**
   * Resolves the device info: from the robot if it connects in time, or from the last connection otherwise,
   * so an offline robot doesn't prevent Matterbridge from starting.
   *
   * @returns {Promise<DeviceSnapshot | undefined>} The device info, or `undefined` if the robot is not reachable and was never connected before
   */
  private async resolveSnapshot(): Promise<DeviceSnapshot | undefined> {
    // Subscribe before anything else, so a connection that happens meanwhile is not missed
    const connected = firstValueFrom(this.deviceManager.deviceConnected$).then(() => true);
    const saved = await this.readSnapshot();
    const timeoutMs = saved ? CONNECT_TIMEOUT_WITH_SNAPSHOT_MS : CONNECT_TIMEOUT_MS;
    this.log.info(`Waiting for the connection to the vacuum to be established (up to ${timeoutMs / 1000}s)...`);

    if (await waitAtMost(connected, timeoutMs)) {
      this.log.info(`Connected to device!`);
      const snapshot = await this.takeSnapshot(saved);
      await this.writeSnapshot(snapshot);
      return snapshot;
    }

    if (saved) {
      this.log.warn(`The vacuum is not reachable: using the info saved from the last connection. Its state will update once it's back online.`);
      // Refresh the saved info once the robot is reachable again
      void this.refreshSnapshotWhenConnected(connected, saved);
      return saved;
    }

    return undefined;
  }

  /**
   * Builds the Matter device. Returns `undefined` when the robot is not reachable and was never connected before
   * (there's nothing to build it from): the caller should skip it, so the other devices and plugins can start.
   *
   * @returns {Promise<MatterbridgeEndpoint | undefined>} The endpoint to register
   */
  public async initializeMatterbridgeEndpoint(): Promise<MatterbridgeEndpoint | undefined> {
    const snapshot = await this.resolveSnapshot();
    if (!snapshot) {
      this.log.error(
        `Could not connect to the vacuum within ${CONNECT_TIMEOUT_MS / 1000}s, and there is no info saved from a previous connection. ` +
          `Skipping it so the other devices and plugins can start: restart the plugin once the vacuum is online.`,
      );
      this.deviceManager.stop();
      return undefined;
    }

    this.modelSpeeds = snapshot.modelSpeeds;
    this.serviceAreas = snapshot.serviceAreas;
    this.supportedMaps = snapshot.supportedMaps ?? [];
    const { serialNumber } = snapshot;
    const deviceInfo = { fw_ver: snapshot.firmware };
    const supportedCleanModes = this.supportedCleanModes;

    this.endpoint = new RoboticVacuumCleaner(this.config.name, serialNumber, {
      mode: 'server',
      // RvcRunMode
      currentRunMode: SUPPORTED_MODES[0].mode,
      supportedRunModes: SUPPORTED_MODES,
      // RvcCleanMode
      currentCleanMode: (supportedCleanModes.find(({ mode }) => mode === 1) ?? supportedCleanModes[0]).mode,
      supportedCleanModes,
      operationalState: RvcOperationalState.OperationalState.Docked,
      operationalStateList: SUPPORTED_OPERATIONAL_STATES,
      supportedAreas: this.serviceAreas.length > 0 ? this.serviceAreas : undefined,
      ...(this.supportedMaps.length > 0 ? { supportedMaps: this.supportedMaps } : {}),
      selectedAreas: [],
      currentArea: this.serviceAreas[0]?.areaId,
    });

    this.endpoint.vendorName = 'Xiaomi';
    this.endpoint.productName = snapshot.model;
    this.endpoint.softwareVersionString = deviceInfo.fw_ver;
    this.endpoint.productUrl = 'https://github.com/afharo/matterbridge-xiaomi-roborock';
    this.endpoint.hardwareVersionString = snapshot.model;

    this.endpoint.lifecycle.destroying.on(() => {
      this.deviceManager.stop();
    });

    this.endpoint.addCommandHandler('RvcCleanMode.changeToMode', async (data) => {
      // Defines the selected cleaning mode (mop or vacuum)
      // Modes are looked up by number: the presets are listed first, but numbered after the other modes (stable numbers)
      const newCleanMode = supportedCleanModes.find(({ mode }) => mode === data.request.newMode);
      if (!newCleanMode) {
        this.log.warn(`Unknown clean mode ${data.request.newMode}`);
        return;
      }
      // MIoT devices: switch between vacuum only / mop only / both / vacuum then mop
      const { device } = this.deviceManager;
      if (isSupportedLevel(newCleanMode.miLevels.cleaningType) && 'setCleaningType' in device) {
        await device.setCleaningType(newCleanMode.miLevels.cleaningType);
      }
      // Some devices (e.g. MIoT) can't turn off the vacuum or the water: skip unsupported levels
      if (isSupportedLevel(newCleanMode.miLevels.vacuum)) {
        await device.changeFanSpeed(newCleanMode.miLevels.vacuum);
      }
      // Not every vacuum has a water box (e.g. the legacy Viomi): they don't report water levels either
      if (isSupportedLevel(newCleanMode.miLevels.mop) && 'setWaterBoxMode' in device) {
        await device.setWaterBoxMode(newCleanMode.miLevels.mop);
      }
    });

    this.endpoint.addCommandHandler('RvcRunMode.changeToMode', async (data) => {
      // Actual start command
      switch (data.request.newMode) {
        case 1: // Idle
          await this.deviceManager.device.activateCharging();
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
            this.activeAreas = [...selectedAreas];
            // HACK: Assign the first selected area as the current area so that we can control speeds while room cleaning
            await this.endpoint?.updateAttribute(ServiceArea, 'currentArea', selectedAreas[0]);
          }
          break;
        }
        default:
          this.log.warn(`Unknown mode ${data.request.newMode}`);
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
        this.activeAreas = [...selectedAreas];
      } else {
        await this.deviceManager.device.activateCleaning();
      }
    });
    this.endpoint.addCommandHandler('goHome', async () => {
      await this.deviceManager.device.activateCharging();
    });
    this.endpoint.addCommandHandler('identify', async () => {
      await this.deviceManager.device.find();
    });
    this.endpoint.addCommandHandler('selectAreas', async (data) => {
      this.log.debug(`Select areas command received: ${data.request.newAreas}`);
      let selectedAreas = data.request.newAreas;
      if ((data.attributes.supportedAreas as ServiceArea.Area[])?.length === selectedAreas.length) {
        selectedAreas = []; // Force empty if all areas are selected
      }
      await this.endpoint?.updateAttribute(ServiceArea, 'selectedAreas', selectedAreas);
    });
    this.endpoint.addCommandHandler('skipArea', async ({ request }) => {
      await this.skipArea(request.skippedArea);
    });

    return this.endpoint;
  }

  public async postRegister() {
    this.deviceManager.stateChanged$
      .pipe(
        // Failures are caught per event: an error in `mergeMap` would end the stream (no later change would be handled)
        // and RxJS would rethrow it as an uncaught exception.
        mergeMap(async ({ key, value }) => {
          this.log.debug(`Device state changed: ${key} = ${value}`);

          if (key in this.stateChangedHandlers) {
            try {
              // @ts-expect-error key is a string, this.stateChangedHandlers is not an index signature, and value is unknown
              await this.stateChangedHandlers[key](value);
            } catch (error) {
              this.log.error(`Failed to handle the state change ${key} = ${value}: ${error}`);
            }
          }
        }),
        takeUntil(this.stop$),
      )
      .subscribe();

    this.deviceManager.errorChanged$
      .pipe(
        mergeMap(async (error) => {
          try {
            await this.updateOperationalError(error as MiioError | null);
          } catch (err) {
            this.log.error(`Failed to report the robot's error: ${err}`);
          }
        }),
        takeUntil(this.stop$),
      )
      .subscribe();

    // The current area is unknown until the robot cleans (and only with the Xiaomi Cloud enabled)
    await this.endpoint?.updateAttribute(ServiceArea, 'currentArea', null);

    // If no areas are found, we need to clear the serviceAreas and the currentArea attributes
    // (the constructor doesn't allow setting them to null as it fallbacks to defaults).
    if (this.serviceAreas.length === 0) {
      await this.endpoint?.updateAttribute(ServiceArea, 'currentArea', null);
      await this.endpoint?.updateAttribute(ServiceArea, 'supportedAreas', []);
    }

    this.followCurrentRoom();
  }

  /**
   * With the Xiaomi Cloud enabled, the robot's map is downloaded while it cleans, to report the room it's in
   * (ServiceArea `currentArea`). A new watcher is created every time the robot (re)connects.
   */
  private followCurrentRoom() {
    const { cloudService } = this;
    if (!cloudService || this.serviceAreas.length === 0) return;
    this.deviceManager.deviceConnected$
      .pipe(
        switchMap(
          (device) =>
            new Observable<number | undefined>((subscriber) => {
              let watcher: MapWatcher | undefined;
              let closed = false;
              const follow = async () => {
                const created = await cloudService.createMapWatcher(device, { did: this.config.did, ip: this.config.ip, token: this.config.token });
                if (!created || closed) return;
                watcher = created;
                watcher.on('currentRoom', (room) => subscriber.next(room));
                watcher.on('position', (position) => this.log.debug(`Robot position: ${JSON.stringify(position)}`));
                await watcher.start();
              };
              follow().catch((error) => this.log.debug(`Failed to follow the robot's map: ${error}`));
              return () => {
                closed = true;
                watcher?.stop();
              };
            }),
        ),
        mergeMap(async (room) => {
          try {
            await this.updateCurrentArea(room);
          } catch (error) {
            this.log.error(`Failed to report the current room: ${error}`);
          }
        }),
        takeUntil(this.stop$),
      )
      .subscribe();
  }

  /**
   * @param {number | undefined} room The room (segment) the robot is in, from its map or its status
   */
  private async updateCurrentArea(room: number | undefined) {
    const area = this.serviceAreas.find(({ areaId }) => areaId === room);
    if (area) {
      this.log.info(`The robot is in "${area.areaInfo.locationInfo?.locationName ?? area.areaId}"`);
    } else if (room !== undefined) {
      this.log.debug(`The robot is in room ${room}, which is not one of its areas`);
    }
    await this.endpoint?.updateAttribute(ServiceArea, 'currentArea', area?.areaId ?? null);
  }

  public stop() {
    this.deviceManager.stop();
    this.stop$.next();
    this.stop$.complete();
  }

  private readonly stateChangedHandlers = {
    batteryLevel: async (level: number) => {
      this.log.debug(`Battery level: ${level}`);
      await this.endpoint?.updateAttribute(PowerSource, 'batPercentRemaining', level * 2);
      await this.endpoint?.updateAttribute(PowerSource, 'batChargeLevel', getBatteryChargeLevel(level));
    },
    charging: async (charging: boolean) => {
      const isCharging = charging === true;
      const isChargingAndFull = isCharging && this.deviceManager.property<number>('batteryLevel') === 100;

      await this.endpoint?.updateAttribute(
        PowerSource,
        'batChargeState',
        isChargingAndFull ? PowerSource.BatChargeState.IsAtFullCharge : isCharging ? PowerSource.BatChargeState.IsCharging : PowerSource.BatChargeState.IsNotCharging,
      );
      if (isChargingAndFull) {
        await this.setOperationalState(RvcOperationalState.OperationalState.Docked);
      } else if (isCharging) {
        await this.setOperationalState(RvcOperationalState.OperationalState.Charging);
      }
    },
    cleaning: async (cleaning: boolean) => {
      if (this.deviceManager.property('state') === 'error' || this.deviceManager.property('state') === 'paused') {
        return; // Do not update the state if there is an error or paused
      }
      await this.endpoint?.updateAttribute(RvcRunMode, 'currentMode', cleaning === false ? SUPPORTED_MODES[0].mode : SUPPORTED_MODES[1].mode);
      if (cleaning) {
        await this.setOperationalState(RvcOperationalState.OperationalState.Running);
      }
    },
    cleaningMode: async (cleaningMode: string) => {
      if (this.deviceManager.property<string>('state') === 'paused') {
        await this.stateChangedHandlers.cleaning(false);
      } else {
        await this.stateChangedHandlers.cleaning(['cleaning', 'zone-cleaning', 'spot-cleaning', 'room-cleaning', 'manual-cleaning'].includes(cleaningMode));
      }
    },
    in_returning: async (inReturning: number) => {
      if (this.deviceManager.property('state') === 'paused') {
        return;
      }
      if (inReturning) {
        await this.setOperationalState(RvcOperationalState.OperationalState.SeekingCharger);
      }
    },
    fanSpeed: async (miLevel: number) => {
      const currentMopLevel = this.deviceManager.property<number>('waterBoxMode');
      const cleanMode = this.supportedCleanModes.find(({ miLevels }) => levelsMatch(miLevels, miLevel, currentMopLevel));
      if (cleanMode) {
        await this.endpoint?.updateAttribute(RvcCleanMode, 'currentMode', cleanMode.mode);
      }
    },
    // The room the robot is cleaning, as newer Roborock robots report it in their status (node-miio >= 0.10).
    // With the Xiaomi Cloud, the map watcher reports it instead.
    currentSegment: async (segment: number | undefined) => {
      if (this.cloudService || this.serviceAreas.length === 0) return;
      await this.updateCurrentArea(typeof segment === 'number' ? segment : undefined);
    },
    // node-miio's property (and stateChanged key) for the water level
    waterBoxMode: async (miLevel: number) => {
      const currentVacuumLevel = this.deviceManager.property<number>('fanSpeed');
      const cleanMode = this.supportedCleanModes.find(({ miLevels }) => levelsMatch(miLevels, currentVacuumLevel, miLevel));
      if (cleanMode) {
        await this.endpoint?.updateAttribute(RvcCleanMode, 'currentMode', cleanMode.mode);
      }
    },
    cleaningType: async (cleaningType: number) => {
      // Only the combined modes are identified by the cleaning type alone
      const cleanMode = this.supportedCleanModes.find(({ miLevels }) => miLevels.cleaningType === cleaningType && miLevels.vacuum === undefined && miLevels.mop === undefined);
      if (cleanMode) {
        await this.endpoint?.updateAttribute(RvcCleanMode, 'currentMode', cleanMode.mode);
      }
    },
    state: async (state: string) => {
      await this.stateChangedHandlers.charging(state === 'charging');
      switch (state) {
        case 'charging':
          // No need to call it again, as it's called 3 lines above.
          // await this.stateChangedHandlers.charging(true);
          break;

        case 'paused':
          await this.endpoint?.updateAttribute(RvcRunMode, 'currentMode', SUPPORTED_MODES[0].mode);
          await this.setOperationalState(RvcOperationalState.OperationalState.Paused);
          break;

        case 'cleaning':
        case 'spot-cleaning':
        case 'room-cleaning':
        case 'zone-cleaning':
        case 'sweeping':
        case 'mopping':
        case 'sweeping-and-mopping':
          await this.endpoint?.updateAttribute(RvcRunMode, 'currentMode', SUPPORTED_MODES[1].mode);
          await this.setOperationalState(RvcOperationalState.OperationalState.Running);
          break;

        case 'returning': // We might want to emit the optional RvcOperationalState.Cluster.events.operationCompletion when completed cleaning (or when errors occur)
        case 'docking':
          await this.setOperationalState(RvcOperationalState.OperationalState.SeekingCharger);
          break;

        case 'error':
          await this.setOperationalState(RvcOperationalState.OperationalState.Error);
          // await this.endpoint?.updateAttribute(RvcOperationalState, 'operationalError', RvcOperationalState.ErrorState.CommandInvalidInState);
          // We might want to emit the optional RvcOperationalState.Cluster.events.operationCompletion when completed cleaning (or when errors occur)
          break;

        case 'fully-charged':
          await this.setOperationalState(RvcOperationalState.OperationalState.Docked);
          break;

        case 'charging-error':
          await this.setOperationalState(RvcOperationalState.OperationalState.Error);
          await this.endpoint?.updateAttribute(RvcOperationalState, 'operationalError', { errorStateId: RvcOperationalState.ErrorState.FailedToFindChargingDock });
          break;

        case 'initializing':
        case 'idle':
        case 'sleeping':
          await this.endpoint?.updateAttribute(RvcRunMode, 'currentMode', SUPPORTED_MODES[0].mode);
          await this.setOperationalState(RvcOperationalState.OperationalState.Stopped);
          break;

        default: {
          const auxiliaryState = toAuxiliaryOperationalState(state);
          if (auxiliaryState !== undefined) {
            await this.setOperationalState(auxiliaryState);
          } else {
            this.log.warn(`Unknown state: ${state}`);
          }
          break;
        }
      }
    },
  };

  /**
   * Updates the operational state, keeping track of the operation for the mandatory OperationCompletion event.
   * matterbridge only tracks the operations started from Matter: this also covers the ones started from the
   * Mi Home app, schedules or the robot's buttons.
   *
   * @param {RvcOperationalState.OperationalState} operationalState The new state
   */
  private async setOperationalState(operationalState: RvcOperationalState.OperationalState) {
    if (operationalState === RvcOperationalState.OperationalState.Running) {
      this.trackOperation('begin');
    } else if (OPERATION_END_STATES.has(operationalState)) {
      this.trackOperation('complete');
      this.activeAreas = [];
    }
    await this.endpoint?.updateAttribute(RvcOperationalState, 'operationalState', operationalState);
  }

  private trackOperation(step: 'begin' | 'complete') {
    const onError = (error: unknown) => this.log.debug(`Failed to track the operation (${step}): ${error}`);
    try {
      // Both methods are idempotent: begin only starts timing once, and complete is a no-op without an operation.
      Promise.resolve(
        this.endpoint?.act((agent) => {
          const operationalState = agent.get(MatterbridgeRvcOperationalStateServer);
          if (step === 'begin') operationalState.beginOperation();
          else operationalState.completeOperation();
        }),
      ).catch(onError);
    } catch (error) {
      onError(error);
    }
  }

  /**
   * Reports the robot's error (or clears it) in the RVC Operational State cluster.
   *
   * @param {MiioError | null} error The error reported by node-miio (`null` when cleared)
   */
  private async updateOperationalError(error: MiioError | null) {
    if (!error) {
      await this.endpoint?.updateAttribute(RvcOperationalState, 'operationalError', { errorStateId: RvcOperationalState.ErrorState.NoError });
      return;
    }
    const errorStateId = toErrorStateId(this.deviceManager.model, error);
    this.log.warn(`Robot error ${error.id}: ${error.description ?? 'unknown'} (Matter error state ${errorStateId})`);
    await this.endpoint?.updateAttribute(RvcOperationalState, 'operationalError', {
      errorStateId,
      ...(error.description ? { errorStateDetails: error.description.slice(0, 64) } : {}),
    });
    await this.setOperationalState(RvcOperationalState.OperationalState.Error);
  }

  /**
   * Skips an area of the current room cleaning: the robot carries on with the remaining areas, or goes home if
   * none is left.
   *
   * @param {number} skippedArea The area to skip
   */
  private async skipArea(skippedArea: number) {
    if (!this.activeAreas.includes(skippedArea)) {
      this.log.info(`Skip area ${skippedArea}: it's not part of the current room cleaning, nothing to do.`);
      return;
    }
    const remainingAreas = this.activeAreas.filter((area) => area !== skippedArea);
    this.log.info(`Skipping area ${skippedArea}. Remaining areas: [${remainingAreas.join(', ')}]`);
    if (remainingAreas.length === 0) {
      this.activeAreas = [];
      await this.deviceManager.device.activateCharging();
      return;
    }
    await this.deviceManager.device.cleanRooms(remainingAreas);
    this.activeAreas = remainingAreas;
    await this.endpoint?.updateAttribute(ServiceArea, 'currentArea', remainingAreas[0]);
  }

  /**
   * Multi-floor maps: when the robot has more than one saved map, the maps are exposed as `supportedMaps` and the
   * areas are assigned to the current map. The robot only reports the rooms of its current map, so the rooms of the
   * other floors are not listed (that would require switching the robot's map).
   *
   * The current map is `map_status >> 2` from `get_status` (legacy Roborock). Untested on real hardware: if anything
   * looks off, the maps are skipped and the areas are exposed without a map (the previous behaviour).
   */
  private async assignMaps() {
    const { device } = this.deviceManager;
    // Multi-floor maps are only available on the legacy Roborock vacuums
    if (this.serviceAreas.length === 0 || !('getMaps' in device)) return;
    try {
      const maps = await device.getMaps();
      if (maps.length < 2) return;
      const [status] = await device.call('get_status', []);
      const mapStatus = status?.map_status;
      const currentMapId = typeof mapStatus === 'number' ? mapStatus >> 2 : undefined;
      if (currentMapId === undefined || !maps.some(({ id }) => id === currentMapId)) {
        this.log.debug(`Could not determine the current map (map_status: ${mapStatus}), skipping the multi-floor maps`);
        return;
      }
      this.supportedMaps = maps.map(({ id, name }) => ({ mapId: id, name: (name || `Floor ${id + 1}`).slice(0, 64) }));
      this.serviceAreas = this.serviceAreas.map((area) => ({ ...area, mapId: currentMapId }));
      this.log.info(`Multi-floor maps: ${JSON.stringify(this.supportedMaps)}. The current map is ${currentMapId}.`);
    } catch (error) {
      this.log.debug(`Failed to retrieve the maps: ${error}`);
    }
  }

  private async getServiceAreas(): Promise<ServiceArea.Area[]> {
    // It should try to retrieve the map from the device.
    // If empty, try the timer workaround.
    // Else, return an empty array.

    const roomMapping = (await this.deviceManager.device.getRoomMap()) as RoomMapping;
    if (roomMapping.length > 0) {
      this.log.info(`Room mapping found: ${JSON.stringify(roomMapping)}`);
      this.log.info(`Creating service areas from room mapping...`);
      return roomMapping.map(([roomId, roomName], index): ServiceArea.Area => ({
        areaId: parseInt(roomId),
        mapId: null,
        areaInfo: {
          locationInfo: {
            locationName: this.config.roomNames?.[index] || `${roomName}`,
            floorNumber: null,
            areaType: null,
          },
          landmarkInfo: null,
        },
      }));
    }

    const timers = (await this.deviceManager.device.getTimer()) as GetTimerResponseTimer[];
    if (timers.length > 0) {
      const timer = timers.find(([id, status, definition]) => {
        if (['off', 'disabled', 'disable'].includes(status)) {
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
        return segments.map((roomId, index): ServiceArea.Area => ({
          areaId: parseInt(roomId),
          mapId: null,
          areaInfo: {
            locationInfo: {
              // Can't know the name in these models. Users will need to rename it in their apps.
              locationName: this.config.roomNames?.[index] || `Room ${roomId}`,
              floorNumber: null,
              areaType: null,
            },
            landmarkInfo: null,
          },
        }));
      }
    }

    return [];
  }

  private get selectedAreas(): number[] {
    const selectedAreas = (this.endpoint?.getAttribute(ServiceArea, 'selectedAreas') as number[] | undefined) ?? [];
    if (selectedAreas.length === this.serviceAreas.length) {
      // If all selected, return empty array to trigger full cleaning
      return [];
    }
    return selectedAreas;
  }

  private get supportedCleanModes(): Array<SupportedCleanMode> {
    const [vacuumSpeedOff, ...vacuumSpeedModes] = this.modelSpeeds.speed;
    const [mopSpeedOff, ...mopSpeedModes] = this.modelSpeeds.waterspeed ?? [];

    const cleaningTypes = this.modelSpeeds.cleaningTypes ?? {};
    let mode = 1;

    const supportedCleanModes: SupportedCleanMode[] = vacuumSpeedModes.map(({ name, miLevel, tags }) => ({
      label: `${name} Vacuum`,
      mode: mode++,
      modeTags: [
        // The mop-only fan speed ("Mop") doesn't vacuum
        ...(tags.includes(RvcCleanMode.ModeTag.Mop) ? [] : [{ value: RvcCleanMode.ModeTag.Vacuum }]),
        ...tags.map((value) => ({ value })),
      ],
      miLevels: {
        vacuum: miLevel,
        mop: mopSpeedOff?.miLevel,
        cleaningType: cleaningTypes.vacuum,
      },
    }));

    mopSpeedModes.forEach(({ name, miLevel, tags }) => {
      supportedCleanModes.push({
        label: `${name} Mop`,
        mode: mode++,
        modeTags: [{ value: RvcCleanMode.ModeTag.Mop }, ...tags.map((value) => ({ value }))],
        miLevels: {
          vacuum: vacuumSpeedOff.miLevel,
          mop: miLevel,
          cleaningType: cleaningTypes.mop,
        },
      });
    });

    // Vacuum & mop presets (#162), like the native Matter vacuums: listed first, but numbered after the other modes,
    // so the numbers of the existing modes don't change (controllers and automations refer to modes by number)
    const presets = buildCleanModePresets(this.modelSpeeds.speed, this.modelSpeeds.waterspeed, cleaningTypes);

    // MIoT devices that can vacuum and mop at the same time (when there are no presets), or vacuum and then mop (keep the current levels)
    if (cleaningTypes.vacuumAndMop !== undefined && presets.length === 0) {
      supportedCleanModes.push({
        label: 'Vacuum & Mop',
        mode: mode++,
        modeTags: [{ value: RvcCleanMode.ModeTag.Vacuum }, { value: RvcCleanMode.ModeTag.Mop }],
        miLevels: { cleaningType: cleaningTypes.vacuumAndMop },
      });
    }
    if (cleaningTypes.vacuumThenMop !== undefined) {
      supportedCleanModes.push({
        label: 'Vacuum then Mop',
        mode: mode++,
        modeTags: [{ value: RvcCleanMode.ModeTag.VacuumThenMop }],
        miLevels: { cleaningType: cleaningTypes.vacuumThenMop },
      });
    }

    return [...presets.map((preset) => ({ ...preset, mode: mode++ })), ...supportedCleanModes];
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

/**
 * Waits for the promise, but not longer than `timeoutMs`.
 *
 * @param {Promise<boolean>} promise Resolves to `true` when the awaited event happens
 * @param {number} timeoutMs How long to wait
 * @returns {Promise<boolean>} `true` if it happened in time
 */
async function waitAtMost(promise: Promise<boolean>, timeoutMs: number): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
