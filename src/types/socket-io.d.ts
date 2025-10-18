import { User } from '@prisma/client';

declare module 'socket.io' {
  interface Socket {
    user?: Omit<User, 'password'>; // ← не data.user, а просто user
  }
}
