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
      delete (window as Window & { RTCRtpScriptTransform?: unknown }).RTCRtpScriptTransform;
      delete (window as Window & { RTCRtpSender?: unknown }).RTCRtpSender;
      delete (window as Window & { RTCRtpReceiver?: unknown }).RTCRtpReceiver;
    });

    /**
     * Helper function to setup window with WebRTC mocks.
     *
     * @param options - Configuration for mocking WebRTC objects.
     * @param options.hasRTCRtpScriptTransform - Whether RTCRtpScriptTransform exists.
     * @param options.hasRTCRtpSender - Whether RTCRtpSender exists.
     * @param options.hasSenderTransform - Whether RTCRtpSender.prototype has transform.
     * @param options.hasRTCRtpReceiver - Whether RTCRtpReceiver exists.
     * @param options.hasReceiverTransform - Whether RTCRtpReceiver.prototype has transform.
     */
    const setupWindow = ({
      hasRTCRtpScriptTransform,
      hasRTCRtpSender,
      hasSenderTransform,
      hasRTCRtpReceiver,
      hasReceiverTransform,
    }: {
      hasRTCRtpScriptTransform: boolean;
      hasRTCRtpSender: boolean;
      hasSenderTransform: boolean;
      hasRTCRtpReceiver: boolean;
      hasReceiverTransform: boolean;
    }) => {
      if (hasRTCRtpScriptTransform) {
        /**
         * Mock RTCRtpScriptTransform constructor for testing.
         */
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        const MockRTCRtpScriptTransform = function MockRTCRtpScriptTransform() {};
        Object.defineProperty(window, 'RTCRtpScriptTransform', {
          writable: true,
          configurable: true,
          value: MockRTCRtpScriptTransform,
        });
      } else {
        delete (window as Window & { RTCRtpScriptTransform?: unknown }).RTCRtpScriptTransform;
      }

      if (hasRTCRtpSender) {
        /**
         * Mock RTCRtpSender constructor for testing.
         */
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        const MockRTCRtpSender = function MockRTCRtpSender() {};
        MockRTCRtpSender.prototype = hasSenderTransform ? { transform: {} } : {};
        Object.defineProperty(window, 'RTCRtpSender', {
          writable: true,
          configurable: true,
          value: MockRTCRtpSender,
        });
      } else {
        delete (window as Window & { RTCRtpSender?: unknown }).RTCRtpSender;
      }

      if (hasRTCRtpReceiver) {
        /**
         * Mock RTCRtpReceiver constructor for testing.
         */
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        const MockRTCRtpReceiver = function MockRTCRtpReceiver() {};
        MockRTCRtpReceiver.prototype = hasReceiverTransform ? { transform: {} } : {};
        Object.defineProperty(window, 'RTCRtpReceiver', {
          writable: true,
          configurable: true,
          value: MockRTCRtpReceiver,
        });
      } else {
        delete (window as Window & { RTCRtpReceiver?: unknown }).RTCRtpReceiver;
      }
    };

    it.each`
      hasRTCRtpScriptTransform | hasRTCRtpSender | hasSenderTransform | hasRTCRtpReceiver | hasReceiverTransform | expected                       | description
      ${true}                  | ${true}         | ${true}            | ${true}           | ${true}              | ${CapabilityState.CAPABLE}     | ${'all required features are present'}
      ${false}                 | ${true}         | ${true}            | ${true}           | ${true}              | ${CapabilityState.NOT_CAPABLE} | ${'RTCRtpScriptTransform is missing'}
      ${true}                  | ${false}        | ${false}           | ${true}           | ${true}              | ${CapabilityState.NOT_CAPABLE} | ${'RTCRtpSender is missing'}
      ${true}                  | ${true}         | ${false}           | ${true}           | ${true}              | ${CapabilityState.NOT_CAPABLE} | ${'RTCRtpSender.prototype.transform is missing'}
      ${true}                  | ${true}         | ${true}            | ${false}          | ${false}             | ${CapabilityState.NOT_CAPABLE} | ${'RTCRtpReceiver is missing'}
      ${true}                  | ${true}         | ${true}            | ${true}           | ${false}             | ${CapabilityState.NOT_CAPABLE} | ${'RTCRtpReceiver.prototype.transform is missing'}
      ${true}                  | ${false}        | ${false}           | ${false}          | ${false}             | ${CapabilityState.NOT_CAPABLE} | ${'both RTCRtpSender and RTCRtpReceiver are missing'}
      ${false}                 | ${false}        | ${false}           | ${false}          | ${false}             | ${CapabilityState.NOT_CAPABLE} | ${'all features are missing'}
    `(
      'should return $expected when $description',
      ({
        hasRTCRtpScriptTransform,
        hasRTCRtpSender,
        hasSenderTransform,
        hasRTCRtpReceiver,
        hasReceiverTransform,
        expected,
      }) => {
        expect.assertions(1);
        setupWindow({
          hasRTCRtpScriptTransform,
          hasRTCRtpSender,
          hasSenderTransform,
          hasRTCRtpReceiver,
          hasReceiverTransform,
        });
        expect(WebCapabilities.supportsEncodedStreamTransforms()).toBe(expected);
      }
    );
  });
  describe('isCapableOfReceivingVideoCodec', () => {
    afterEach(() => {
      // Clean up window modifications
      delete (window as Window & { RTCRtpReceiver?: unknown }).RTCRtpReceiver;
    });

    it('should return CAPABLE when the codec is supported', () => {
      expect.assertions(1);

      Object.defineProperty(window, 'RTCRtpReceiver', {
        writable: true,
        value: {
          getCapabilities: jest.fn().mockReturnValue({
            codecs: [{ mimeType: 'video/AV1' }],
          } as unknown as RTCRtpCapabilities),
        },
      });

      expect(WebCapabilities.isCapableOfReceivingVideoCodec('video/AV1')).toBe(
        CapabilityState.CAPABLE
      );
    });

    it('should return NOT_CAPABLE when the codec is not supported', () => {
      expect.assertions(1);

      Object.defineProperty(window, 'RTCRtpReceiver', {
        writable: true,
        value: {
          getCapabilities: jest.fn().mockReturnValue({
            codecs: [{ mimeType: 'video/H264' }],
          } as unknown as RTCRtpCapabilities),
        },
      });

      expect(WebCapabilities.isCapableOfReceivingVideoCodec('video/AV1')).toBe(
        CapabilityState.NOT_CAPABLE
      );
    });

    it('should return NOT_CAPABLE when getCapabilities returns undefined', () => {
      expect.assertions(1);

      Object.defineProperty(window, 'RTCRtpReceiver', {
        writable: true,
        value: {
          getCapabilities: jest.fn().mockReturnValue(undefined),
        },
      });

      expect(WebCapabilities.isCapableOfReceivingVideoCodec('video/AV1')).toBe(
        CapabilityState.NOT_CAPABLE
      );
    });
  });

  describe('supportsRTCPeerConnection', () => {
    afterEach(() => {
      // Clean up window modifications
      delete (window as Window & { RTCPeerConnection?: unknown }).RTCPeerConnection;
    });

    /**
     * Sets up the window object with or without RTCPeerConnection.
     * @param hasRTCPeerConnection - True when it should exist, false otherwise.
     */
    const setupWindow = (hasRTCPeerConnection: boolean) => {
      if (hasRTCPeerConnection) {
        /**
         * Mock RTCPeerConnection constructor for testing.
         */
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        const MockRTCPeerConnection = function MockRTCPeerConnection() {};
        Object.defineProperty(window, 'RTCPeerConnection', {
          writable: true,
          configurable: true,
          value: MockRTCPeerConnection,
        });
      } else {
        delete (window as Window & { RTCPeerConnection?: unknown }).RTCPeerConnection;
      }
    };

    it('returns true when RTCPeerConnection is available', () => {
      expect.assertions(1);
      setupWindow(true);
      expect(WebCapabilities.supportsRTCPeerConnection()).toBe(CapabilityState.CAPABLE);
    });

    it('returns false when RTCPeerConnection is not available', () => {
      expect.assertions(1);
      setupWindow(false);

      expect(WebCapabilities.supportsRTCPeerConnection()).toBe(CapabilityState.NOT_CAPABLE);
    });
  });
});
