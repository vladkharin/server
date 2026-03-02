export interface WebRtcSignalPayload {
  data: RTCSessionDescriptionInit | RTCIceCandidate;
  targetUserId: number;
}

export type PUBLIC_USER = {
  id: number;
  name: string;
  surname: string;
  username: string;
};
