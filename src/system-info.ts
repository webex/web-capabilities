/* eslint-disable max-classes-per-file */

import { EventEmitter } from 'events';

// PressureObserver is a W3C standard API that provides information about the system's pressure state.
// It allows web applications to observe the pressure state of the system, which can help them adapt
// their behavior based on the system's performance and resource availability.
// Pressure API is supported in modern browsers, but it is not available in all environments.
// Currently, it's not supported by TypeScript, so we need to define the types ourselves.
// NOTE: Consider removing this once TypeScript supports PressureObserver.

// https://w3c.github.io/compute-pressure/#pressure-states
// ⚪ Nominal: Work is minimal and the system is running on lower clock speed to preserve power.
//
// 🟢 Fair: The system is doing fine, everything is smooth and it can take on additional work without issues.
//
// 🟡 Serious: There is some serious pressure on the system, but it is sustainable and the system is doing well,
//              but it is getting close to its limits:
//
// Clock speed (depending on AC or DC power) is consistently high
// Thermals are high but system can handle it
// At this point, if you add more work the system may move into critical.
//
// 🔴 Critical: The system is now about to reach its limits, but it hasn’t reached the limit yet.
//               Critical doesn’t mean that the system is being actively throttled,
//               but this state is not sustainable for the long run and might result in throttling if the workload remains the same.
//               This signal is the last call for the web application to lighten its workload.

export type PressureSource = 'cpu';

export type PressureState = 'nominal' | 'fair' | 'serious' | 'critical';

interface PressureRecord {
  source: string;
  state: PressureState;
  time: number;
}

interface PressureObserver {
  observe(source: PressureSource): Promise<void>;
  unobserve(source: PressureSource): void;
  disconnect(): void;
  takeRecords(): PressureRecord[];
}

declare global {
  interface Window {
    PressureObserver?: PressureObserver;
  }
}

export enum SystemInfoEvents {
  CpuPressureStateChange = 'cpu-pressure-state-change',
}

/**
 * PressureObserverHelper class to wrap the PressureObserver API
 * and provide a simple interface for observing pressure state changes.
 */
class PressureObserverHelper extends EventEmitter {
  private observer?: PressureObserver;

  private lastCpuPressure?: PressureState = undefined;

  /**
   * Creates an instance of PressureObserverHelper.
   */
  constructor() {
    super();

    if (PressureObserverHelper.isPressureObserverSupported()) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.observer = new PressureObserver(this.handleStateChange.bind(this));
      if (this.observer) {
        this.observer.observe('cpu');
      }
    }
  }

  /**
   * Handles updates from the PressureObserver.
   *
   * @param records - The records from the PressureObserver.
   */
  private handleStateChange(records: PressureRecord[]) {
    records.forEach((record: PressureRecord) => {
      if (record.source === 'cpu' && record.state !== this.lastCpuPressure) {
        this.lastCpuPressure = record.state;

        this.emit(SystemInfoEvents.CpuPressureStateChange, record.state);
      }
    });
  }

  /**
   * Gets the current CPU pressure state.
   *
   * @returns The current CPU pressure state, or undefined if API is not supported.
   */
  getCpuPressure(): PressureState | undefined {
    return this.lastCpuPressure;
  }

  /**
   * Checks if the Compute Pressure API is supported in the current environment.
   *
   * @returns True if the Compute Pressure API is supported, false otherwise.
   */
  static isPressureObserverSupported(): boolean {
    return 'PressureObserver' in window;
  }
}

const pressureObserverHelper = new PressureObserverHelper();

/**
 * SystemInfo class to provide static methods for system information.
 */
export class SystemInfo {
  /**
   * Checks if the Compute Pressure API is supported in the current environment.
   *
   * @returns True if the Compute Pressure API is supported, false otherwise.
   */
  static isPressureObserverSupported(): boolean {
    return PressureObserverHelper.isPressureObserverSupported();
  }

  /**
   * Gets the current CPU pressure state.
   *
   * @returns The current CPU pressure state, or undefined if API is not supported.
   */
  static getCpuPressure(): PressureState | undefined {
    if (!SystemInfo.isPressureObserverSupported()) {
      return undefined;
    }

    return pressureObserverHelper.getCpuPressure();
  }

  /**
   * Registers a callback to be called when the CPU pressure state changes.
   *
   * @param callback - Callback to be called when the CPU pressure state changes.
   */
  static onCpuPressureChange(callback: (state: PressureState) => void): void {
    if (!SystemInfo.isPressureObserverSupported()) {
      throw new Error('PressureObserver is not supported in this environment.');
    }

    pressureObserverHelper.on(SystemInfoEvents.CpuPressureStateChange, callback);

    // There might be possibility that the CPU pressure state has already changed
    // before the callback was registered, so we check the current state
    // and call the callback immediately if the state is available.
    const state = SystemInfo.getCpuPressure();
    if (state !== undefined) {
      callback(state);
    }
  }

  /**
   * Unregisters a callback that was registered to be called when the CPU pressure state changes.
   *
   * @param callback - Callback to be called when the CPU pressure state changes.
   */
  static offCpuPressureChange(callback: (state: PressureState) => void): void {
    if (!SystemInfo.isPressureObserverSupported()) {
      throw new Error('PressureObserver is not supported in this environment.');
    }

    pressureObserverHelper.off(SystemInfoEvents.CpuPressureStateChange, callback);
  }

  /**
   * Gets the number of logical CPU cores.
   *
   * @returns The number of logical CPU cores, or undefined if not available.
   */
  static getNumLogicalCores(): number | undefined {
    return navigator.hardwareConcurrency;
  }
}
