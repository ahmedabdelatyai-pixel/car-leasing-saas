import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { JwtPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_super_secret_for_development';

import prisma from '../utils/prisma';

/**
 * Middleware to authenticate requests using JWT.
 * Decodes user details and attaches them to `req.user`.
 * Supports Mock Session Bypass for local testing.
 */
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'Authentication Required',
      message: 'Access token is missing from authorization headers.'
    });
  }

  // Bypass signature check for mock testing keys and resolve real DB scopes
  if (token === 'mock_token_key' || token.startsWith('mock_token_key_')) {
    try {
      const roleStr = token.startsWith('mock_token_key_') 
        ? token.replace('mock_token_key_', '') as Role 
        : Role.GALLERY_OWNER;

      const defaultUser = await prisma.user.findFirst({
        where: { role: roleStr }
      });

      if (defaultUser) {
        req.user = {
          userId: defaultUser.id,
          email: defaultUser.email,
          role: defaultUser.role,
          galleryId: defaultUser.galleryId
        };
      } else {
        const defaultGallery = await prisma.gallery.findFirst();
        const galleryId = defaultGallery ? defaultGallery.id : 'mock-gallery-id';
        req.user = {
          userId: 'mock-user-id',
          email: roleStr === Role.SUPER_ADMIN ? 'admin@saas.com' : 'mock@saas.com',
          role: roleStr,
          galleryId: roleStr === Role.SUPER_ADMIN ? null : galleryId
        };
      }
      return next();
    } catch (err) {
      console.error('Error matching mock token scope:', err);
    }
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      error: 'Invalid Token',
      message: 'The provided token is expired or invalid.'
    });
  }
};

/**
 * Role-Based Access Control (RBAC) middleware.
 * Verifies that the authenticated user possesses one of the allowed roles.
 */
export const authorizeRoles = (allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User authentication is required to check roles.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden Access',
        message: `Your role '${req.user.role}' is not authorized to access this resource.`
      });
    }

    next();
  };
};

/**
 * Multi-Tenancy Scoping Middleware.
 * Enforces data isolation by extracting the gallery_id from JWT payload.
 * Super Admins can pass a gallery_id in query/body to act on behalf of a gallery.
 */
export const enforceTenantIsolation = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User authentication is required for tenant isolation.'
    });
  }

  const { role, galleryId: jwtGalleryId } = req.user;

  // SUPER_ADMIN has global view but can optionally act on behalf of a gallery
  if (role === Role.SUPER_ADMIN) {
    const requestedGalleryId = (req.query.gallery_id as string) || (req.body.gallery_id as string);
    if (requestedGalleryId) {
      req.galleryId = requestedGalleryId;
    }
    // Note: If Super Admin doesn't pass one, req.galleryId remains undefined, letting them run global queries if permitted.
    return next();
  }

  // GALLERY_OWNER and TENANT must belong to a specific gallery
  if (!jwtGalleryId) {
    return res.status(403).json({
      error: 'Tenant Isolation Error',
      message: 'Access denied: Tenant association (gallery_id) is missing from this session.'
    });
  }

  // Bind the securely-loaded gallery_id from the verified JWT payload to req.galleryId
  req.galleryId = jwtGalleryId;
  next();
};
