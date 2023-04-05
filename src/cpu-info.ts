export type CpuInfo = {
  numLogicalCores?: number;
};

/**
 * Get the available information about the machine's CPU.
 *
 * @returns The {@link CpuInfo}.
 */
export function getCpuInfo(): CpuInfo {
  const cpuInfo = {} as CpuInfo;

  if (navigator.hardwareConcurrency) {
    cpuInfo.numLogicalCores = navigator.hardwareConcurrency;
  }

  return cpuInfo;
}
