import { Role } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
  permissions?: string | null;
  restaurantId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      restaurantId?: string;
    }
  }
}
