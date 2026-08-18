import type { MiioDevice } from 'node-miio';

import type { ModelLogger } from '../utils/logger.ts';

/**
 * Dreame vacuums do not implement the Roborock RPCs (`app_start`, `get_status`, ...)
 * that `node-miio` exposes through its typed helpers. Sending them makes the robot
 * reply with `{ code: -9999, message: 'user ack timeout' }`.
 *
 * This adapter keeps the `node-miio` connection (handshake, encryption, socket
 * reuse) but routes every read and command through the MIoT protocol
 * (`get_properties` / `set_properties` / `action`).
 *
 * The property/action map below is the one shared by the F9 family:
 * p2008 (F9), p2009 (D9), p2028 (Z10 Pro), p2041o, p2150a and p2150o.
 *
 * @see https://home.miot-spec.com/spec/dreame.vacuum.p2008
 */

interface MiotProperty {
  siid: number;
  piid: number;
}

interface MiotAction {
  siid: number;
  aiid: number;
}

const PROPS: Record<string, MiotProperty> = {
  battery_level: { siid: 3, piid: 1 },
  charging_state: { siid: 3, piid: 2 },
  device_fault: { siid: 2, piid: 2 },
  device_status: { siid: 2, piid: 1 },
  operating_mode: { siid: 4, piid: 1 },
  cleaning_mode: { siid: 4, piid: 4 },
  water_flow: { siid: 4, piid: 5 },
  water_box_carriage_status: { siid: 4, piid: 6 },
};

const ACTIONS: Record<string, MiotAction> = {
  home: { siid: 3, aiid: 1 },
  locate: { siid: 7, aiid: 1 },
  start_clean: { siid: 4, aiid: 1 },
  stop_clean: { siid: 4, aiid: 2 },
};

/** `device_status` enum mapped onto the state strings the accessory understands. */
const DEVICE_STATUS: Record<number, string> = {
  1: 'cleaning', // Sweeping
  2: 'idle',
  3: 'paused',
  4: 'error',
  5: 'returning', // GoCharging
  6: 'charging',
  7: 'mopping',
  13: 'manual-cleaning', // ManualSweeping
};

const CHARGING_STATE: Record<number, boolean> = {
  1: true, // Charging
  2: false, // Discharging
  4: true, // Charging2
  5: false, // GoCharging
};

const CLEANING_STATES = ['cleaning', 'mopping', 'manual-cleaning'];

/** Room configuration used to advertise service areas. */
export interface DreameRoomsConfig {
  /** The segment IDs as reported by the Xiaomi Home app. */
  roomIds?: number[];
  /** Optional names, applied in the same order as `roomIds`. */
  roomNames?: string[];
}

/**
 * Whether the connected device is a Dreame vacuum and needs the MIoT adapter.
 *
 * @param {string?} model The `miioModel` reported by node-miio.
 * @returns {boolean} `true` when the model belongs to the Dreame family.
 */
export function isDreame(model: string | undefined): boolean {
  return typeof model === 'string' && model.startsWith('dreame.');
}

/**
 * Wraps a raw `node-miio` device so it speaks MIoT instead of the Roborock RPCs.
 *
 * @param {MiioDevice} raw The connected node-miio device.
 * @param {ModelLogger} log The plugin logger, used to report unsupported operations.
 * @param {DreameRoomsConfig} rooms The room configuration, if the user declared any.
 * @returns {MiioDevice} A device exposing the same surface the accessory expects.
 */
export function wrapDreame(raw: MiioDevice, log: ModelLogger, rooms: DreameRoomsConfig = {}): MiioDevice {
  return new DreameDevice(raw, log, rooms) as unknown as MiioDevice;
}

interface MiotPropertyResult {
  did: string;
  code: number;
  value: unknown;
}

class DreameDevice {
  private cache: Record<string, unknown> = {};
  private readonly listeners: Record<string, Array<(payload: unknown) => void>> = {
    stateChanged: [],
    errorChanged: [],
  };

  constructor(
    private readonly raw: MiioDevice,
    private readonly log: ModelLogger,
    private readonly rooms: DreameRoomsConfig,
  ) {}

  // --- plumbing the DeviceManager relies on ---------------------------------

  /** @returns {string?} The model reported by the device. */
  get miioModel(): string | undefined {
    return this.raw.miioModel;
  }

  /**
   * `DeviceManager.ensureDevice` inspects `handle.api.parent.socket` to reuse sockets.
   *
   * @returns {MiioDevice['handle']} The underlying node-miio handle.
   */
  get handle(): MiioDevice['handle'] {
    return this.raw.handle;
  }

  matches(): boolean {
    // We only wrap devices already identified as Dreame vacuums.
    return true;
  }

  destroy(): void {
    this.raw.destroy();
  }

  on(event: string, cb: (payload: unknown) => void): void {
    this.listeners[event]?.push(cb);
  }

  // --- MIoT transport -------------------------------------------------------

  /**
   * `node-miio` types `call` for the Roborock RPCs, whose arguments are plain
   * strings. MIoT payloads are objects, so the signature is widened here.
   */
  /**
   * @param {string} method The miIO method to invoke.
   * @param {unknown} args The MIoT payload, either an array or an object.
   * @returns {Promise<unknown>} The raw response from the device.
   */
  private rawCall(method: string, args: unknown): Promise<unknown> {
    const call = this.raw.call as unknown as (method: string, args: unknown) => Promise<unknown>;
    return call.call(this.raw, method, args);
  }

  private async getProperties(names: string[] = Object.keys(PROPS)): Promise<Record<string, unknown>> {
    const params = names.map((did) => ({ did, ...PROPS[did] }));
    const results = (await this.rawCall('get_properties', params)) as MiotPropertyResult[];
    const out: Record<string, unknown> = {};
    for (const entry of results ?? []) {
      if (entry?.code === 0) {
        out[entry.did] = entry.value;
      }
    }
    return out;
  }

  private async setProperty(name: string, value: number): Promise<unknown> {
    const spec = PROPS[name];
    if (!spec) {
      throw new Error(`Unknown Dreame property: ${name}`);
    }
    return this.rawCall('set_properties', [{ did: name, ...spec, value }]);
  }

  private async callAction(name: string, params: unknown[] = []): Promise<unknown> {
    const spec = ACTIONS[name];
    if (!spec) {
      throw new Error(`Unknown Dreame action: ${name}`);
    }
    return this.rawCall('action', { did: name, ...spec, in: params });
  }

  // --- state ----------------------------------------------------------------

  async poll(): Promise<Record<string, unknown>> {
    this.cache = await this.getProperties();
    return this.cache;
  }

  async state(): Promise<Record<string, unknown>> {
    const status = DEVICE_STATUS[this.cache.device_status as number] ?? 'idle';
    const charging = CHARGING_STATE[this.cache.charging_state as number] ?? false;
    const battery = typeof this.cache.battery_level === 'number' ? this.cache.battery_level : 0;
    const fault = this.cache.device_fault as number | undefined;

    return {
      state: charging && battery >= 100 ? 'fully-charged' : status,
      batteryLevel: battery,
      charging,
      cleaning: CLEANING_STATES.includes(status),
      in_returning: status === 'returning',
      fanSpeed: this.cache.cleaning_mode,
      water_box_mode: this.cache.water_flow,
      ...(fault ? { error: fault } : {}),
    };
  }

  /** @returns {Record<string, unknown>} The most recently polled raw MIoT values. */
  get properties(): Record<string, unknown> {
    return this.cache;
  }

  property(name: string): unknown {
    switch (name) {
      case 'batteryLevel':
        return this.cache.battery_level;
      case 'fanSpeed':
        return this.cache.cleaning_mode;
      case 'water_box_mode':
        return this.cache.water_flow;
      case 'state':
        return DEVICE_STATUS[this.cache.device_status as number] ?? 'idle';
      default:
        return this.cache[name];
    }
  }

  // --- device info ----------------------------------------------------------

  private async miioInfo(): Promise<Record<string, string> | undefined> {
    try {
      return (await this.rawCall('miIO.info', [])) as Record<string, string>;
    } catch (error) {
      this.log.debug(`dreame | miIO.info failed: ${error}`);
      return undefined;
    }
  }

  async getSerialNumber(): Promise<string> {
    const info = await this.miioInfo();
    // Matter rejects separators in the serial number, so strip them.
    return String(info?.mac ?? info?.did ?? 'Unknown').replace(/[^A-Za-z0-9]/g, '');
  }

  async getDeviceInfo(): Promise<{ fw_ver: string }> {
    const info = await this.miioInfo();
    return { fw_ver: info?.fw_ver ?? 'Unknown' };
  }

  // --- commands -------------------------------------------------------------

  async activateCleaning(): Promise<unknown> {
    return this.callAction('start_clean');
  }

  async deactivateCleaning(): Promise<unknown> {
    return this.callAction('stop_clean');
  }

  async pause(): Promise<unknown> {
    // The F9 family has no dedicated pause action; stop_clean halts in place.
    return this.callAction('stop_clean');
  }

  async activateCharging(): Promise<unknown> {
    return this.callAction('home');
  }

  async find(): Promise<unknown> {
    return this.callAction('locate');
  }

  async changeFanSpeed(level: number): Promise<unknown> {
    if (typeof level !== 'number' || level < 0) {
      return undefined;
    }
    return this.setProperty('cleaning_mode', level);
  }

  async setWaterBoxMode(level: number): Promise<unknown> {
    if (typeof level !== 'number' || level < 1) {
      return undefined;
    }
    return this.setProperty('water_flow', level);
  }

  // --- rooms ----------------------------------------------------------------
  // The F9 family does not expose its segment list over MIoT (the map is only
  // available as an opaque blob), so rooms cannot be discovered automatically.
  // They can instead be declared in the plugin configuration; run
  // `mibridge rooms <did>` or check the Xiaomi Home app to find the IDs.

  /** @returns {Promise<Array<[string, string]>>} The rooms declared in the configuration, if any. */
  async getRoomMap(): Promise<Array<[string, string]>> {
    const { roomIds, roomNames } = this.rooms;

    if (!roomIds?.length) {
      return [];
    }

    return roomIds.map((id, index) => [String(id), roomNames?.[index] ?? `Room ${id}`]);
  }

  async getTimer(): Promise<unknown[]> {
    return [];
  }

  async cleanRooms(areas: number[]): Promise<unknown> {
    this.log.warn(`dreame | Room cleaning is not implemented for ${this.miioModel} yet (requested: ${areas.join(', ')}). Starting a full clean instead.`);
    return this.activateCleaning();
  }

  async resumeCleanRooms(areas: number[]): Promise<unknown> {
    return this.cleanRooms(areas);
  }
}
