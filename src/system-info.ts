/* eslint-disable max-classes-per-file */
import { EventEmitter } from 'events';

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

type PressureState = 'nominal' | 'fair' | 'serious' | 'critical';

interface PressureRecord {
  source: string;
  state: PressureState;
  time: number;
}

export enum ComputePressureEvents {
  CpuPressureStateChange = 'cpu-pressure-state-change',
}

/**
 * Events emitted by the ComputePressureObserver.
 */
class ComputePressureObserver extends EventEmitter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private observer?: any;

  /**
   * Creates an instance of ComputePressureObserver.
   */
  constructor() {
    super();

    if ('PressureObserver' in window) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.observer = new PressureObserver(this.onUpdate.bind(this));

      this.observer.observe('cpu', {
        sampleInterval: 1000,
      });
    }
  }

  /**
   * Handles updates from the PressureObserver.
   *
   * @param records - The records from the PressureObserver.
   */
  private onUpdate(records: PressureRecord[]) {
    records.forEach((record: PressureRecord) => {
      if (record.source === 'cpu') {
        this.emit(ComputePressureEvents.CpuPressureStateChange, record.state);
      }
    });
  }
}

/**
 * SystemInfo class to manage system information and pressure states.
 */
export default class SystemInfo {
  private static observer?: ComputePressureObserver = undefined;

  private static lastCpuPressure?: PressureState = undefined;

  /**
   * Retrieves the ComputePressureObserver instance, creating it if it doesn't exist.
   *
   * @returns The ComputePressureObserver instance.
   */
  private static getObserver(): ComputePressureObserver | undefined {
    if (this.observer) {
      return this.observer;
    }

    if ('PressureObserver' in window) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.observer = new ComputePressureObserver();
      this.observer.on(ComputePressureEvents.CpuPressureStateChange, (state: PressureState) => {
        this.lastCpuPressure = state;
      });
    }

    return this.observer;
  }

  /**
   * Gets the current CPU pressure state.
   *
   * @returns The current CPU pressure state, or undefined if API is not supported.
   */
  static async getCpuPressure(): Promise<PressureState | undefined> {
    if (this.lastCpuPressure) {
      return Promise.resolve(this.lastCpuPressure);
    }

    const observer = this.getObserver();
    if (!observer) {
      return Promise.resolve(undefined);
    }

    return new Promise((resolve) => {
      // eslint-disable-next-line jsdoc/require-jsdoc
      const handleFirstUpdate = (records: PressureState) => {
        this.lastCpuPressure = records;

        observer.removeListener('cpu-pressure-state-change', handleFirstUpdate);

        resolve(records);
      };

      observer.addListener(ComputePressureEvents.CpuPressureStateChange, handleFirstUpdate);
    });
  }
}
