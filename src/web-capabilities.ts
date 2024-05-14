import { CpuInfo, getCpuInfo } from './cpu-info';

/**
 * Used by the {@link WebCapabilities} class to mark features as "not capable", "capable", or
 * "unknown". A feature marked as "unknown" means that there is not enough information to determine
 * whether the machine is currently capable of that feature.
 */
export enum CapabilityState {
  NOT_CAPABLE = 'not capable',
  CAPABLE = 'capable',
  UNKNOWN = 'unknown',
}

/**
 * A class that checks whether the machine is capable of certain features based on the available
 * information.
 */
export class WebCapabilities {
  private static cpuInfo = getCpuInfo();

  /**
   * Checks whether the machine is capable of background noise removal.
   *
   * @returns A {@link CapabilityState}.
   */
  static isCapableOfBackgroundNoiseRemoval(): CapabilityState {
    if (WebCapabilities.cpuInfo.numLogicalCores === undefined) {
      return CapabilityState.UNKNOWN;
    }
    if (WebCapabilities.cpuInfo.numLogicalCores < 2) {
      return CapabilityState.NOT_CAPABLE;
    }
    return CapabilityState.CAPABLE;
  }

  /**
   * Checks whether the machine is capable of virtual background.
   *
   * @returns A {@link CapabilityState}.
   */
  static isCapableOfVirtualBackground(): CapabilityState {
    if (WebCapabilities.cpuInfo.numLogicalCores === undefined) {
      return CapabilityState.UNKNOWN;
    }
    if (WebCapabilities.cpuInfo.numLogicalCores < 2) {
      return CapabilityState.NOT_CAPABLE;
    }
    return CapabilityState.CAPABLE;
  }

  /**
   * Checks whether the machine is capable of receiving 1080p video.
   *
   * @returns A {@link CapabilityState}.
   */
  static isCapableOfReceiving1080pVideo(): CapabilityState {
    if (WebCapabilities.cpuInfo.numLogicalCores === undefined) {
      return CapabilityState.UNKNOWN;
    }
    if (WebCapabilities.cpuInfo.numLogicalCores < 2) {
      return CapabilityState.NOT_CAPABLE;
    }
    return CapabilityState.CAPABLE;
  }

  /**
   * Checks whether the machine is capable of sending 1080p video.
   *
   * @returns A {@link CapabilityState}.
   */
  static isCapableOfSending1080pVideo(): CapabilityState {
    if (WebCapabilities.cpuInfo.numLogicalCores === undefined) {
      return CapabilityState.UNKNOWN;
    }
    if (WebCapabilities.cpuInfo.numLogicalCores < 8) {
      return CapabilityState.NOT_CAPABLE;
    }
    return CapabilityState.CAPABLE;
  }

  /**
   * Retrieves the current CPU information of the system.
   *
   * @returns An object containing details about the CPU.
   */
  static getCpuInfo(): CpuInfo {
    return WebCapabilities.cpuInfo;
  }
}
