import { CpuInfo } from './cpu-info';
import { CapabilityState, WebCapabilities } from './web-capabilities';

/**
 * Mock the CPU information of the machine.
 *
 * @param cpuInfo - The {@link CpuInfo} to mock.
 */

describe('WebCapabilities', () => {
  it('should get correct capabilities for a machine with unknown CPU information', () => {
    expect.assertions(4);
    jest.spyOn(CpuInfo, 'getNumLogicalCores').mockImplementation();
    expect(WebCapabilities.isCapableOfBackgroundNoiseRemoval()).toBe(CapabilityState.UNKNOWN);
    expect(WebCapabilities.isCapableOfVirtualBackground()).toBe(CapabilityState.UNKNOWN);
    expect(WebCapabilities.isCapableOfReceiving1080pVideo()).toBe(CapabilityState.UNKNOWN);
    expect(WebCapabilities.isCapableOfSending1080pVideo()).toBe(CapabilityState.UNKNOWN);
  });
  it('should get correct capabilities for a 1-core machine', () => {
    expect.assertions(4);
    jest.spyOn(CpuInfo, 'getNumLogicalCores').mockReturnValue(1);
    expect(WebCapabilities.isCapableOfBackgroundNoiseRemoval()).toBe(CapabilityState.NOT_CAPABLE);
    expect(WebCapabilities.isCapableOfVirtualBackground()).toBe(CapabilityState.NOT_CAPABLE);
    expect(WebCapabilities.isCapableOfReceiving1080pVideo()).toBe(CapabilityState.NOT_CAPABLE);
    expect(WebCapabilities.isCapableOfSending1080pVideo()).toBe(CapabilityState.NOT_CAPABLE);
  });
  it('should get correct capabilities for a 2-core machine', () => {
    expect.assertions(4);
    jest.spyOn(CpuInfo, 'getNumLogicalCores').mockReturnValue(2);
    expect(WebCapabilities.isCapableOfBackgroundNoiseRemoval()).toBe(CapabilityState.CAPABLE);
    expect(WebCapabilities.isCapableOfVirtualBackground()).toBe(CapabilityState.CAPABLE);
    expect(WebCapabilities.isCapableOfReceiving1080pVideo()).toBe(CapabilityState.CAPABLE);
    expect(WebCapabilities.isCapableOfSending1080pVideo()).toBe(CapabilityState.NOT_CAPABLE);
  });
  it('should get correct capabilities for a 8-core machine', () => {
    expect.assertions(4);
    jest.spyOn(CpuInfo, 'getNumLogicalCores').mockReturnValue(8);
    expect(WebCapabilities.isCapableOfBackgroundNoiseRemoval()).toBe(CapabilityState.CAPABLE);
    expect(WebCapabilities.isCapableOfVirtualBackground()).toBe(CapabilityState.CAPABLE);
    expect(WebCapabilities.isCapableOfReceiving1080pVideo()).toBe(CapabilityState.CAPABLE);
    expect(WebCapabilities.isCapableOfSending1080pVideo()).toBe(CapabilityState.CAPABLE);
  });
  describe('supportsEncodedStreamTransforms', () => {
    afterEach(() => {
      // Clean up window modifications
      delete (window as Window & { RTCRtpSender?: unknown }).RTCRtpSender;
    });

    it('should return CAPABLE when encoded transforms are supported', () => {
      expect.assertions(1);

      /**
       * Mock RTCRtpSender constructor for testing.
       */
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const MockRTCRtpSender = function MockRTCRtpSender() {};
      MockRTCRtpSender.prototype = {
        transform: {},
      };

      Object.defineProperty(window, 'RTCRtpSender', {
        writable: true,
        configurable: true,
        value: MockRTCRtpSender,
      });

      expect(WebCapabilities.supportsEncodedStreamTransforms()).toBe(CapabilityState.CAPABLE);
    });

    it('should return NOT_CAPABLE when RTCRtpSender is not available', () => {
      expect.assertions(1);

      // Ensure RTCRtpSender is not available
      delete (window as Window & { RTCRtpSender?: unknown }).RTCRtpSender;

      expect(WebCapabilities.supportsEncodedStreamTransforms()).toBe(CapabilityState.NOT_CAPABLE);
    });

    it('should return NOT_CAPABLE when transform is not in RTCRtpSender prototype', () => {
      expect.assertions(1);

      /**
       * Mock RTCRtpSender constructor without transform property.
       */
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const MockRTCRtpSender = function MockRTCRtpSender() {};
      MockRTCRtpSender.prototype = {};

      Object.defineProperty(window, 'RTCRtpSender', {
        writable: true,
        configurable: true,
        value: MockRTCRtpSender,
      });

      expect(WebCapabilities.supportsEncodedStreamTransforms()).toBe(CapabilityState.NOT_CAPABLE);
    });
  });
});
