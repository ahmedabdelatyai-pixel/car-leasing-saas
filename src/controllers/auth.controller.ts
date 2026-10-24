import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { Role } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_super_secret_for_development';

export class AuthController {
  /**
   * Universal Login for Restaurant Admin & Cashier.
   * Auto-provisions the primary restaurant and initial admin if needed.
   */
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Missing email or password.' });
      }

      const cleanEmail = email.toLowerCase().trim();

      // Ensure at least one restaurant exists
      let restaurant = await prisma.restaurant.findFirst();
      if (!restaurant) {
        restaurant = await prisma.restaurant.create({
          data: {
            name: 'مطعم ضجة',
            phone: '01000000000',
            address: 'القاهرة - مصر'
          }
        });
      }

      let user = await prisma.user.findUnique({
        where: { email: cleanEmail },
        include: { restaurant: true }
      });

      // Default Admin Seed if logging in with common admin usernames for the first time
      if (!user && (cleanEmail === 'admin@dajja.com' || cleanEmail === 'dajja@admin' || cleanEmail === 'admin@admin.com' || cleanEmail === 'newcar@admin')) {
        const passwordHash = await bcrypt.hash(password, 10);
        user = await prisma.user.create({
          data: {
            email: cleanEmail,
            passwordHash,
            role: Role.RESTAURANT_ADMIN,
            restaurantId: restaurant.id
          },
          include: { restaurant: true }
        });
      }

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials. User not found.' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          fullName: user.fullName || 'مدير مطعم ضجة',
          role: user.role,
          restaurantId: user.restaurantId
        },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      return res.json({
        message: 'Login successful! Welcome to Dajja System 🔥',
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName || 'مدير مطعم ضجة',
          role: user.role,
          restaurant: user.restaurant
        }
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Login failed', message: err.message });
    }
  }

  /**
   * Register a new staff user.
   */
  static async register(req: Request, res: Response) {
    try {
      const { email, password, role } = req.body;
      const cleanEmail = email.toLowerCase().trim();

      const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
      if (existing) {
        return res.status(409).json({ error: 'User with this email already exists' });
      }

      let restaurant = await prisma.restaurant.findFirst();
      if (!restaurant) {
        restaurant = await prisma.restaurant.create({
          data: { name: 'مطعم ضجة' }
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          email: cleanEmail,
          passwordHash,
          role: role || Role.RESTAURANT_ADMIN,
          restaurantId: restaurant.id
        }
      });

      return res.status(201).json({ message: 'User registered successfully', user });
    } catch (err: any) {
      return res.status(500).json({ error: 'Registration failed', message: err.message });
    }
  }

  /**
   * Change password for logged in admin / staff.
   */
  static async changePassword(req: Request, res: Response) {
    try {
      const { newPassword, currentPassword } = req.body;
      const userPayload = (req as any).user;

      if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 4 خانات على الأقل' });
      }

      const user = await prisma.user.findUnique({
        where: { id: userPayload.userId }
      });

      if (!user) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
      }

      if (currentPassword) {
        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isMatch) {
          return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
        }
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash }
      });

      return res.json({ message: 'تم تغيير كلمة المرور بنجاح 🔐' });
    } catch (err: any) {
      return res.status(500).json({ error: 'فشل تغيير كلمة المرور', message: err.message });
    }
  }

  /**
   * Get current logged-in user profile.
   */
  static async getProfile(req: Request, res: Response) {
    try {
      const userPayload = (req as any).user;
      const user = await prisma.user.findUnique({
        where: { id: userPayload.userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          restaurantId: true,
          createdAt: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
      }

      return res.json({ ...user, user });
    } catch (err: any) {
      return res.status(500).json({ error: 'فشل جلب الملف الشخصي', message: err.message });
    }
  }

  /**
   * Update profile (name, username/email).
   */
  static async updateProfile(req: Request, res: Response) {
    try {
      const userPayload = (req as any).user;
      const { fullName, email } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: userPayload.userId }
      });

      if (!user) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
      }

      const updateData: any = {};

      if (fullName && fullName.trim()) {
        updateData.fullName = fullName.trim();
      }

      if (email && email.trim()) {
        const cleanEmail = email.toLowerCase().trim();
        if (cleanEmail !== user.email) {
          // Check uniqueness
          const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
          if (existing && existing.id !== user.id) {
            return res.status(409).json({ error: 'هذا البريد أو اسم المستخدم مسجل بالفعل بحساب آخر' });
          }
          updateData.email = cleanEmail;
        }
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          restaurantId: true
        }
      });

      // Generate refreshed token
      const token = jwt.sign(
        {
          userId: updatedUser.id,
          email: updatedUser.email,
          fullName: updatedUser.fullName,
          role: updatedUser.role,
          restaurantId: updatedUser.restaurantId
        },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      return res.json({
        message: 'تم تحديث بيانات الحساب بنجاح ✅',
        token,
        user: updatedUser
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'فشل تحديث بيانات الحساب', message: err.message });
    }
  }
}

