export const REQUESTS = {
  friendRequest: 'friend:request',
  friendRespond: 'friend:respond',
  friendList: 'friend:list',
  friendIncoming: 'friend:incoming',
  friendOutgoing: 'friend:outgoing',

  messageSend: 'message:send',
  messageHistory: 'message:history',
  messageEdit: 'message:edit',
  messageDelete: 'message:delete',
  messageRead: 'message:read',

  callRequest: 'call:request',
  callAccept: 'call:accept',
  callCancel: 'call:cancel',

  getRouterRtpCapabilities: 'mediasoup:getRouterRtpCapabilities',
  createTransport: 'mediasoup:createWebRtcTransport',
  connectTransport: 'mediasoup:connectTransport',
  produce: 'mediasoup:produce',
  consume: 'mediasoup:consume',
  leaveRoom: 'mediasoup:leaveRoom',
  resume: 'mediasoup:resume',
} as const;

export const NOTIFICATIONS = {
  directChatNew: 'notification.direct.chat.new',

  friendRequestReceived: 'notification.friend.request.received',
  friendRequestResponded: 'notification.friend.request.responded',

  messageNew: 'notification.message.new',
  messageReceived: 'notification.message.received',
  messageUpdated: 'notification.message.updated',
  messageDeleted: 'notification.message.deleted',
} as const;
