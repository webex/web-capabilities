import { CpuInfo } from './cpu-info';
import { CapabilityState, WebCapabilities } from './web-capabilities';

/**
 * Mock the CPU information of the machine.
 *
 * @param cpuInfo - The {@link CpuInfo} to mock.
 */
const mockCpuInfo = (cpuInfo: CpuInfo) => {
  // eslint-disable-next-line dot-notation
  WebCapabilities['cpuInfo'] = cpuInfo;
};

describe('WebCapabilities', () => {
  it('should get correct capabilities for a machine with unknown CPU information', () => {
    expect.assertions(4);

    mockCpuInfo({});

    expect(WebCapabilities.isCapableOfBackgroundNoiseRemoval()).toBe(CapabilityState.UNKNOWN);
    expect(WebCapabilities.isCapableOfVirtualBackground()).toBe(CapabilityState.UNKNOWN);
    expect(WebCapabilities.isCapableOfReceiving1080pVideo()).toBe(CapabilityState.UNKNOWN);
    expect(WebCapabilities.isCapableOfSending1080pVideo()).toBe(CapabilityState.UNKNOWN);
  });
  it('should get correct capabilities for a 1-core machine', () => {
    expect.assertions(4);

    mockCpuInfo({ numLogicalCores: 1 });

    expect(WebCapabilities.isCapableOfBackgroundNoiseRemoval()).toBe(CapabilityState.NOT_CAPABLE);
    expect(WebCapabilities.isCapableOfVirtualBackground()).toBe(CapabilityState.NOT_CAPABLE);
    expect(WebCapabilities.isCapableOfReceiving1080pVideo()).toBe(CapabilityState.NOT_CAPABLE);
    expect(WebCapabilities.isCapableOfSending1080pVideo()).toBe(CapabilityState.NOT_CAPABLE);
  });
  it('should get correct capabilities for a 2-core machine', () => {
    expect.assertions(4);

    mockCpuInfo({ numLogicalCores: 2 });

    expect(WebCapabilities.isCapableOfBackgroundNoiseRemoval()).toBe(CapabilityState.CAPABLE);
    expect(WebCapabilities.isCapableOfVirtualBackground()).toBe(CapabilityState.CAPABLE);
    expect(WebCapabilities.isCapableOfReceiving1080pVideo()).toBe(CapabilityState.CAPABLE);
    expect(WebCapabilities.isCapableOfSending1080pVideo()).toBe(CapabilityState.NOT_CAPABLE);
  });
  it('should get correct capabilities for a 8-core machine', () => {
    expect.assertions(4);

    mockCpuInfo({ numLogicalCores: 8 });

    expect(WebCapabilities.isCapableOfBackgroundNoiseRemoval()).toBe(CapabilityState.CAPABLE);
    expect(WebCapabilities.isCapableOfVirtualBackground()).toBe(CapabilityState.CAPABLE);
    expect(WebCapabilities.isCapableOfReceiving1080pVideo()).toBe(CapabilityState.CAPABLE);
    expect(WebCapabilities.isCapableOfSending1080pVideo()).toBe(CapabilityState.CAPABLE);
  });
});
