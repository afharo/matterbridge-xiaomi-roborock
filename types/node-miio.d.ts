// eslint-disable-file no-unused-vars

import type { Socket } from 'node:net';

// TODO: Move these to the `node-miio` library once it supports typescript

declare module 'node-miio' {
  export function device(options: MiioDeviceOptions): Promise<MiioDevice>;

  export interface MiioDeviceOptions {
    address: string;
    token: string;
  }

  export interface MiioDevice {
    miioModel?: string;
    handle: {
      api: {
        parent: {
          get socket(): Socket;
        };
      };
    };
    call: <T>(method: string, args?: string[], options?: Record<string, unknown>) => Promise<T>;
    destroy: () => void;
    property: <T>(propertyName: string) => T | undefined;
    properties: Record<string, unknown>;
    on: <T>(eventName: string, cb: (value: T) => void) => void;
    matches: (str: string) => boolean;
    poll: () => Promise<void>;
    find: () => Promise<void>;
    state: () => Promise<MiioState>;
    getDeviceInfo: () => Promise<MiioDeviceInfo>;
    getSerialNumber: () => Promise<string>;
    batteryLevel: () => Promise<number>;
    getTimer: () => Promise<GetTimerResponseTimer[]>;
    getRoomMap: () => Promise<[string, string][]>;
    activateCleaning: () => Promise<void>;
    deactivateCleaning: () => Promise<void>;
    activateCharging: () => Promise<void>;
    pause: () => Promise<void>;
    cleanRooms: (roomIds: number[]) => Promise<void>;
    resumeCleanRooms: (roomIds: number[]) => Promise<void>;
    fanSpeed: () => Promise<number>;
    changeFanSpeed: (miLevel: number) => Promise<void>;
    getWaterBoxMode: () => Promise<number>;
    setWaterBoxMode: (miLevel: number) => Promise<void>;
    startDustCollection: () => Promise<void>;
    stopDustCollection: () => Promise<void>;
    sendToLocation: (x: number, y: number) => Promise<void>;
    setRawProperty: (key: string, value: unknown) => Promise<void>;
    cleanZones: (zonesToClean: number[][]) => Promise<void>;
    /** Available since node-miio 0.3.0-beta.4 */
    fanSpeeds?: () => Promise<MiioVacuumMode[]>;
    /** MIoT only (node-miio > 0.3.0-beta.4): vacuum only, mop only, both, vacuum then mop… */
    cleaningTypes?: () => Promise<MiioVacuumMode[]>;
    setCleaningType?: (value: number) => Promise<void>;
    /** Available since node-miio 0.3.0-beta.4 (legacy Roborock only): the saved maps (multi-floor) */
    getMaps?: () => Promise<Array<{ id: number; name: string }>>;
    /** Available since node-miio 0.3.0-beta.4 (empty if the model doesn't support it) */
    waterBoxModes?: () => Promise<MiioVacuumMode[]>;
  }

  export interface MiioVacuumMode {
    value: number;
    name: string;
  }

  export interface MiioState {
    cleaning?: boolean;
    charging?: boolean;
    fanSpeed?: number;
    batteryLevel?: number;
    water_box_mode?: string;
    error?: MiioErrorChangedEvent;
  }

  /** The error emitted with `errorChanged` (`null` when the error is cleared) */
  export interface MiioErrorChangedEvent {
    code: number | string;
    message?: string;
  }

  export interface MiioDeviceInfo {
    fw_ver: string;
  }

  export type GetTimerResponseTimer = [
    string, // timer ID
    'off' | 'disable' | 'on' | 'enable', // status
    GetTimerResponseTimerDefinition, // timer definition
  ];

  export type GetTimerResponseTimerDefinition = [
    string, // cron expression
    GetTimerResponseTimerDefinitionAction, // action
  ];

  export type GetTimerResponseTimerDefinitionAction = [
    string, // method
    GetTimerResponseTimerDefinitionActionParams, // params
  ];

  export type GetTimerResponseTimerDefinitionActionParams = {
    fan_power: number;
    segments: string; // comma-separated list of segments (e.g.: '28,19,18,17,16,20,29,23,26,25,24')
    repeat: number;
    clean_order_mode: number;
  };
}
