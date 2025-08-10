import { BehaviorSubject, concat, defer, distinct, exhaustMap, filter, from, Subject, takeUntil, timer } from 'rxjs';
import * as miio from 'node-miio';
import type { MiioDevice, MiioErrorChangedEvent, MiioState } from 'node-miio';

import { cleaningStatuses } from '../utils/constants.js';
import type { ModelLogger } from '../utils/logger.ts';

export interface DeviceManagerConfig {
  ip?: string;
  token?: string;
}

export interface StateChangedEvent {
  key: string;
  value: unknown;
}

const GET_STATE_INTERVAL_MS = 10000; // 30s

export class DeviceManager {
  private readonly internalDevice$ = new BehaviorSubject<MiioDevice | undefined>(undefined);

  private readonly ip: string;
  private readonly token: string;

  private readonly internalErrorChanged$ = new Subject<MiioErrorChangedEvent>();
  private readonly internalStateChanged$ = new Subject<StateChangedEvent>();
  private readonly stop$ = new Subject<void>();
  public readonly errorChanged$ = this.internalErrorChanged$.pipe(distinct());
  public readonly stateChanged$ = concat(
    defer(() => {
      const allInitialProps = Object.entries(this.device.properties).map(([key, value]) => ({ key, value }));
      return from(allInitialProps);
    }),
    this.internalStateChanged$,
  );
  public readonly deviceConnected$ = this.internalDevice$.pipe(filter(Boolean));

  private connectingPromise: Promise<void> | null = null;
  private connectRetry = setTimeout(() => void 0, 100); // Noop timeout only to initialise the property
  constructor(
    private readonly log: ModelLogger,
    config: DeviceManagerConfig,
  ) {
    if (!config.ip) {
      throw new Error('You must provide an ip address of the vacuum cleaner.');
    }
    this.ip = config.ip;

    if (!config.token) {
      throw new Error('You must provide a token of the vacuum cleaner.');
    }
    this.token = config.token;

    this.connect().catch(() => {
      // Do nothing in the catch because this function already logs the error internally and retries after 2 minutes.
    });
  }

  public get model() {
    return this.internalDevice$.value?.miioModel || 'unknown model';
  }

  public get state() {
    return this.property('state') as string;
  }

  public get isCleaning() {
    return cleaningStatuses.includes(this.state);
  }

  public get isPaused() {
    return this.state === 'paused';
  }

  public get device() {
    if (!this.internalDevice$.value) {
      throw new Error('Not connected yet');
    }
    return this.internalDevice$.value;
  }

  public property<T>(propertyName: string) {
    return this.device.property<T>(propertyName);
  }

  public async ensureDevice(callingMethod: string) {
    try {
      if (!this.internalDevice$.value) {
        const errMsg = `${callingMethod} | No vacuum cleaner is discovered yet.`;
        this.log.error(errMsg);
        throw new Error(errMsg);
      }

      // checking if the device has an open socket it will fail retrieving it if not
      // https://github.com/aholstenson/miio/blob/master/lib/network.js#L227
      if (this.internalDevice$.value.handle.api.parent.socket) {
        this.log.debug(`DEB ensureDevice | ${this.model} | The socket is still on. Reusing it.`);
      }
    } catch (error) {
      const err = error as Error;
      if (/destroyed/i.test(err.message) || /No vacuum cleaner is discovered yet/.test(err.message)) {
        this.log.info(`INF ensureDevice | ${this.model} | The socket was destroyed or not initialised, initialising the device`);
        await this.connect();
      } else {
        this.log.error(err.message, err);
        throw err;
      }
    }
  }

  public stop() {
    this.internalStateChanged$.complete();
    this.internalErrorChanged$.complete();
    this.stop$.next();
    this.stop$.complete();
    this.internalDevice$.value?.destroy();
    this.internalDevice$.complete();
  }

  private async connect() {
    if (this.connectingPromise === null) {
      // if already trying to connect, don't trigger yet another one
      this.connectingPromise = this.initializeDevice().catch((error) => {
        this.log.error(`ERR connect | miio.device, next try in 10 seconds | ${error}`);
        clearTimeout(this.connectRetry);
        // Using setTimeout instead of holding the promise. This way we'll keep retrying but not holding the other actions
        // eslint-disable-next-line promise/no-nesting
        this.connectRetry = setTimeout(() => this.connect().catch(() => {}), 10000);
        throw error;
      });
    }
    try {
      await this.connectingPromise;
      clearTimeout(this.connectRetry);
    } finally {
      this.connectingPromise = null;
    }
  }

  private async initializeDevice() {
    this.log.debug('DEB getDevice | Discovering vacuum cleaner');

    const device = await miio.device({ address: this.ip, token: this.token });

    if (device.matches('type:vaccuum')) {
      this.internalDevice$.next(device);

      this.log.setModel(this.model);

      this.log.info(`STA getDevice | Connected to: ${this.ip}`);
      this.log.info(`STA getDevice | Model: ${this.model}`);
      this.log.info(`STA getDevice | State: ${this.property('state')}`);
      this.log.info(`STA getDevice | FanSpeed: ${this.property('fanSpeed')}`);
      this.log.info(`STA getDevice | BatteryLevel: ${this.property('batteryLevel')}`);

      Object.entries(this.device.properties).forEach(([key, value]) => this.internalStateChanged$.next({ key, value }));

      this.device.on<MiioErrorChangedEvent>('errorChanged', (error) => this.internalErrorChanged$.next(error));
      this.device.on<StateChangedEvent>('stateChanged', (state) => this.internalStateChanged$.next(state));

      // Refresh the state every 10s so miio maintains a fresh connection (or recovers connection if lost)
      timer(0, GET_STATE_INTERVAL_MS)
        .pipe(
          takeUntil(this.stop$),
          exhaustMap(() => this.getState()),
        )
        .subscribe();
    } else {
      const model = (device || {}).miioModel;
      this.log.error(
        `Device "${model}" is not registered as a vacuum cleaner! If you think it should be, please open an issue at https://github.com/afharo/matterbridge-xiaomi-roborock/issues/new and provide this line.`,
      );
      this.log.debug(device);
      device.destroy();
    }
  }

  private async getState() {
    try {
      this.log.debug(`DEB getState | ${this.model} | Polling...`);
      await this.ensureDevice('getState');
      await this.device.poll();
      const state = await this.device.state();
      this.log.debug(`DEB getState | ${this.model} | State ${JSON.stringify(state)} | Props ${JSON.stringify(this.device.properties)}`);

      for (const key in state) {
        if (key === 'error' && state[key]) {
          this.internalErrorChanged$.next(state[key]);
        } else {
          this.internalStateChanged$.next({ key, value: state[key as keyof MiioState] });
        }
      }
    } catch (err) {
      this.log.error(`getState | ${err}`, err);
    }
  }
}
