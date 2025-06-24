/* eslint-disable max-classes-per-file */
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

export type PressureState = 'nominal' | 'fair' | 'serious' | 'critical';

interface PressureRecord {
  source: string;
  state: PressureState;
  time: number;
}

/**
 * SystemInfo class to manage system information and pressure states.
 */
class SystemInfoInternal {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private observer?: any;

  private lastCpuPressure?: PressureState = undefined;

  /**
   * Creates an instance of SystemInfo.
   */
  constructor() {
    if ('PressureObserver' in window) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.observer = new PressureObserver(this.handleStateChange.bind(this));

      this.observer.observe('cpu');
    }
  }

  /**
   * Handles updates from the PressureObserver.
   *
   * @param records - The records from the PressureObserver.
   */
  private handleStateChange(records: PressureRecord[]) {
    records.forEach((record: PressureRecord) => {
      if (record.source === 'cpu') {
        this.lastCpuPressure = record.state;
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
}

const systemInfo = new SystemInfoInternal();

/**
 * SystemInfo class to provide static methods for system information.
 */
export class SystemInfo {
  /**
   * Gets the current CPU pressure state.
   *
   * @returns The current CPU pressure state, or undefined if API is not supported.
   */
  static getCpuPressure(): PressureState | undefined {
    return systemInfo.getCpuPressure();
  }
}
