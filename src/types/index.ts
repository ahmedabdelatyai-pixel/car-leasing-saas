import { Role } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
  galleryId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      galleryId?: string; // Populated for tenant/gallery scoped requests
    }
  }
}
