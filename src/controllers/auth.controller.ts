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
}
