import { CpuInfo } from './cpu-info';

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
  /**
   * Checks whether the machine is capable of background noise removal.
   *
   * @returns A {@link CapabilityState}.
   */
  static isCapableOfBackgroundNoiseRemoval(): CapabilityState {
    const numCores = CpuInfo.getNumLogicalCores();
    if (numCores === undefined) {
      return CapabilityState.UNKNOWN;
    }
    if (numCores < 2) {
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
    const numCores = CpuInfo.getNumLogicalCores();
    if (numCores === undefined) {
      return CapabilityState.UNKNOWN;
    }
    if (numCores < 2) {
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
    const numCores = CpuInfo.getNumLogicalCores();
    if (numCores === undefined) {
      return CapabilityState.UNKNOWN;
    }
    if (numCores < 2) {
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
    const numCores = CpuInfo.getNumLogicalCores();
    if (numCores === undefined) {
      return CapabilityState.UNKNOWN;
    }
    if (numCores < 8) {
      return CapabilityState.NOT_CAPABLE;
    }
    return CapabilityState.CAPABLE;
  }

  /**
   * Checks whether the browser supports encoded stream transforms.
   *
   * @returns A {@link CapabilityState}.
   */
  static supportsEncodedStreamTransforms(): CapabilityState {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).RTCRtpScriptTransform &&
      window.RTCRtpSender &&
      'transform' in RTCRtpSender.prototype &&
      window.RTCRtpReceiver &&
      'transform' in RTCRtpReceiver.prototype
      ? CapabilityState.CAPABLE
      : CapabilityState.NOT_CAPABLE;
  }
}
