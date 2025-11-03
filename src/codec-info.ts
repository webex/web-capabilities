/**
 * CodecInfo class to provide static methods for codec information.
 */
export class CodecInfo {
  /**
   * Notifies the user whether or not the H.264
   * codec is present.
   * @returns -boolean.
   */
  static async isH264Available(): Promise<boolean> {
    let hasCodec = false;

    try {
      const peerConnection = new window.RTCPeerConnection();
      const offer = await peerConnection.createOffer({
        offerToReceiveVideo: true,
      });

      if (offer?.sdp?.match(/^a=rtpmap:\d+\s+H264\/\d+/m)) {
        hasCodec = true;
      }
      peerConnection.close();
    } catch (error) {
      return false;
    }

    return hasCodec;
  }

  /**
   * Notifies the user whether or not the H.264
   * codec is present.
   * @returns -boolean.
   */
  static async isAV1Available(): Promise<boolean> {
    let hasCodec = false;

    try {
      const peerConnection = new window.RTCPeerConnection();
      const offer = await peerConnection.createOffer({
        offerToReceiveVideo: true,
      });

      if (offer?.sdp?.match(/^a=rtpmap:\d+\s+AV1\/\d+/m)) {
        hasCodec = true;
      }
      peerConnection.close();
    } catch (error) {
      return false;
    }

    return hasCodec;
  }
}
