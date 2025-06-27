/**
 * A class that provides information about the CPU.
 * @deprecated Use `SystemInfo` instead.
 */
export class CpuInfo {
  /**
   * Gets the number of logical CPU cores.
   * @deprecated Use `SystemInfo.getNumLogicalCores()` instead.
   *
   * @returns The number of logical CPU cores, or undefined if not available.
   */
  static getNumLogicalCores(): number | undefined {
    return navigator.hardwareConcurrency;
  }
}
