import { CodecInfo } from './codec-info';

describe('CodecInfo', () => {
  describe('isH264Available', () => {
    it('should return true when the H.264 codec is available', async () => {
      expect.assertions(1);

      Object.defineProperty(window, 'RTCPeerConnection', {
        writable: true,
        value: jest.fn().mockReturnValue({
          createOffer: jest.fn().mockResolvedValue({
            sdp: 'a=rtpmap:124 H264/90000',
          }),
          close: jest.fn(),
        } as unknown as RTCPeerConnection),
      });

      await expect(CodecInfo.isH264Available()).resolves.toBe(true);
    });

    it('should return false when the H.264 codec is not available', async () => {
      expect.assertions(1);

      Object.defineProperty(window, 'RTCPeerConnection', {
        writable: true,
        value: jest.fn().mockReturnValue({
          createOffer: jest.fn().mockResolvedValue({
            sdp: 'a=rtpmap:36 rtx/90000',
          }),
          close: jest.fn(),
        } as unknown as RTCPeerConnection),
      });

      await expect(CodecInfo.isH264Available()).resolves.toBe(false);
    });
  });

  describe('isAV1Available', () => {
    it('should return true when the AV1 codec is available', async () => {
      expect.assertions(1);

      Object.defineProperty(window, 'RTCPeerConnection', {
        writable: true,
        value: jest.fn().mockReturnValue({
          createOffer: jest.fn().mockResolvedValue({
            sdp: 'a=rtpmap:124 AV1/90000',
          }),
          close: jest.fn(),
        } as unknown as RTCPeerConnection),
      });

      await expect(CodecInfo.isAV1Available()).resolves.toBe(true);
    });

    it('should return false when the AV1 codec is not available', async () => {
      expect.assertions(1);

      Object.defineProperty(window, 'RTCPeerConnection', {
        writable: true,
        value: jest.fn().mockReturnValue({
          createOffer: jest.fn().mockResolvedValue({
            sdp: 'a=rtpmap:36 rtx/90000',
          }),
          close: jest.fn(),
        } as unknown as RTCPeerConnection),
      });

      await expect(CodecInfo.isAV1Available()).resolves.toBe(false);
    });
  });
});
