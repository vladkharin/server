export interface WebRtcSignalPayload {
  data: RTCSessionDescriptionInit | RTCIceCandidate;
  targetUserId: number;
}
