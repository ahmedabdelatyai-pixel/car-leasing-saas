import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { JwtPayload } from '../types';
import prisma from '../utils/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_super_secret_for_development';

/**
 * Middleware to authenticate requests using JWT.
 * Decodes user details and attaches them to `req.user`.
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

  // Bypass signature check for mock testing keys
  if (token === 'mock_token_key' || token.startsWith('mock_token_key_')) {
    try {
      const roleStr = token.startsWith('mock_token_key_') 
        ? token.replace('mock_token_key_', '') as Role 
        : Role.RESTAURANT_ADMIN;

      const defaultUser = await prisma.user.findFirst({
        where: { role: roleStr }
      });

      if (defaultUser) {
        req.user = {
          userId: defaultUser.id,
          email: defaultUser.email,
          role: defaultUser.role,
          restaurantId: defaultUser.restaurantId
        };
      } else {
        const defaultRestaurant = await prisma.restaurant.findFirst();
        req.user = {
          userId: 'mock-user-id',
          email: 'admin@dajja.com',
          role: roleStr,
          restaurantId: defaultRestaurant ? defaultRestaurant.id : null
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
    if (decoded.restaurantId) {
      req.restaurantId = decoded.restaurantId;
    }
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
 * Permission-Based Access Control middleware.
 * Checks if user has specific permission, or fallback to role rules.
 */
export const authorizePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    // SUPER_ADMIN has access to everything
    if (req.user.role === Role.SUPER_ADMIN) {
      return next();
    }

    // Fetch user permissions if not in payload
    let permissions = req.user.permissions;
    if (permissions === undefined) {
      const dbUser = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { permissions: true, role: true }
      });
      permissions = dbUser?.permissions;
    }

    // Default permissions based on role if no explicit permissions set
    if (!permissions) {
      if (req.user.role === Role.RESTAURANT_ADMIN) {
        permissions = 'POS,ORDERS,CAPTAINS,CUSTOMERS,MENU,REPORTS,INVENTORY,RECIPES,SETTINGS';
      } else if (req.user.role === Role.CASHIER) {
        permissions = 'POS,ORDERS,CAPTAINS,CUSTOMERS';
      } else if (req.user.role === Role.KITCHEN) {
        permissions = 'ORDERS';
      } else {
        permissions = '';
      }
    }

    const permittedList = permissions.split(',').map(p => p.trim().toUpperCase());
    if (permittedList.includes(permission.toUpperCase()) || permittedList.includes('*')) {
      return next();
    }

    return res.status(403).json({
      error: 'Forbidden Access',
      message: `عذراً، هذا الحساب ليس لديه صلاحية '${permission}'. هذا القسم مقتصر على مدير المطعم أو من يمتلك هذه الصلاحية.`
    });
  };
};

/**
 * Ensures restaurant isolation and resolves current restaurant id.
 */
export const enforceRestaurantContext = async (req: Request, res: Response, next: NextFunction) => {
  if (req.user && req.user.restaurantId) {
    req.restaurantId = req.user.restaurantId;
    return next();
  }

  // Fallback to primary restaurant (Dajja Restaurant)
  const defaultRestaurant = await prisma.restaurant.findFirst();
  if (defaultRestaurant) {
    req.restaurantId = defaultRestaurant.id;
  }
  next();
};
