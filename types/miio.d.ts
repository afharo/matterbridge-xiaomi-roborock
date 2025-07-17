// eslint-disable-file no-unused-vars

import type { Socket } from 'node:net';

// TODO: Move these to the `miio` library once it supports typescript

declare module 'miio' {
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
    getTimer: () => Promise<unknown>;
    getRoomMap: () => Promise<[string, string][]>;
    activateCleaning: () => Promise<void>;
    activateCharging: () => Promise<void>;
    pause: () => Promise<void>;
    cleanRooms: (roomIds: string[]) => Promise<void>;
    resumeCleanRooms: (roomIds: string[]) => Promise<void>;
    fanSpeed: () => Promise<number>;
    changeFanSpeed: (miLevel: number) => Promise<void>;
    getWaterBoxMode: () => Promise<number>;
    setWaterBoxMode: (miLevel: number) => Promise<void>;
    startDustCollection: () => Promise<void>;
    stopDustCollection: () => Promise<void>;
    sendToLocation: (x: number, y: number) => Promise<void>;
    setRawProperty: (key: string, value: unknown) => Promise<void>;
    cleanZones: (zonesToClean: number[][]) => Promise<void>;
  }

  export interface MiioState {
    cleaning?: boolean;
    charging?: boolean;
    fanSpeed?: number;
    batteryLevel?: number;
    water_box_mode?: string;
    error?: MiioErrorChangedEvent;
  }

  export interface MiioErrorChangedEvent {
    id: string;
    description: unknown;
  }

  export interface MiioDeviceInfo {
    fw_ver: string;
  }
}
