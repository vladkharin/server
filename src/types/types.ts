export interface WebRtcSignalPayload {
  data: RTCSessionDescriptionInit | RTCIceCandidate;
  targetUserId: number;
}

export type PUBLIC_USER = {
  id: number;
  username: string;
};

export type PublicUser = {
  id: number;
  username: string;
  // 👇 Расширяем тип для возврата из поиска
  hasPendingRequest?: boolean;
  isFriend?: boolean;
  isRequestReceived?: boolean; // 👈 Если запрос отправлен МНЕ
};
