/**
 * A class that provides information about the CPU.
 */
export class CpuInfo {
  /**
   * Gets the number of logical CPU cores.
   *
   * @returns The number of logical CPU cores, or undefined if not available.
   */
  static getNumLogicalCores(): number | undefined{
    return navigator.hardwareConcurrency;
  }
}
