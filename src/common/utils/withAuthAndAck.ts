import { Socket } from 'socket.io';

export const withAuthAndAck = async (
  client: Socket,
  data: any,
  ackCallback: unknown, // ← безопасный тип
  handler: (userId: number, data: any) => Promise<any>,
): Promise<void> => {
  const userId = client.user?.id;
  if (!userId) {
    console.log('❌ Не авторизован');
    if (typeof ackCallback === 'function') {
      ackCallback({ error: 'Unauthorized', id: data.id });
    }
    return;
  }

  try {
    console.log(`✅ Обработка события от пользователя ${userId}`);
    const result = await handler(userId, data);
    console.log('📤 Отправляю ACK:', { response: result, id: data.id });
    if (typeof ackCallback === 'function') {
      ackCallback({ response: result, id: data.id });
    } else {
      console.warn('⚠️ ACK callback не передан клиентом!');
    }
  } catch (error) {
    console.error('🔥 Ошибка:', error);
    if (typeof ackCallback === 'function') {
      ackCallback({ error: 'Internal server error', id: data.id });
    }
  }
};
