import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { Role } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_super_secret_for_development';

export class SuperAdminController {
  /**
   * 1. Get platform-wide overview statistics.
   */
  static async getPlatformStats(req: Request, res: Response) {
    try {
      const [
        totalRestaurants,
        activeRestaurants,
        totalOrders,
        ordersSum,
        totalCustomers,
        recentOrders
      ] = await Promise.all([
        prisma.restaurant.count(),
        prisma.restaurant.count({
          where: { subscriptionStatus: 'ACTIVE' }
        }),
        prisma.order.count(),
        prisma.order.aggregate({
          _sum: { totalAmount: true }
        }),
        prisma.customer.count(),
        prisma.order.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            restaurant: {
              select: { id: true, name: true }
            }
          }
        })
      ]);

      const totalRevenue = Number(ordersSum._sum?.totalAmount || 0);

      return res.json({
        totalRestaurants,
        activeRestaurants,
        totalOrders,
        totalRevenue,
        totalCustomers,
        recentOrders
      });
    } catch (error: any) {
      console.error('Error fetching platform stats:', error);
      return res.status(500).json({ error: 'Failed to fetch platform stats' });
    }
  }

  /**
   * 2. List all restaurants with subscription details, orders metrics, and owner info.
   */
  static async listRestaurants(req: Request, res: Response) {
    try {
      const restaurants = await prisma.restaurant.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          users: {
            select: { id: true, email: true, fullName: true, role: true, createdAt: true },
            orderBy: { createdAt: 'asc' }
          },
          _count: {
            select: {
              orders: true,
              menuItems: true,
              customers: true
            }
          }
        }
      });

      // Calculate total sales for each restaurant
      const formatted = await Promise.all(
        restaurants.map(async (r) => {
          const salesAgg = await prisma.order.aggregate({
            where: { restaurantId: r.id },
            _sum: { totalAmount: true }
          });

          return {
            id: r.id,
            name: r.name,
            tagline: r.tagline,
            slug: r.slug || r.id.substring(0, 8),
            phone: r.phone,
            address: r.address,
            logoUrl: r.logoUrl,
            isOpen: r.isOpen,
            subscriptionStatus: r.subscriptionStatus || 'ACTIVE',
            subscriptionPlan: r.subscriptionPlan || 'PREMIUM',
            subscriptionExpiresAt: r.subscriptionExpiresAt,
            enabledFeatures: r.enabledFeatures || 'POS,MENU,REPORTS,CAPTAINS,CUSTOMERS,QR,INVENTORY,RECIPES,LOYALTY',
            notes: r.notes,
            createdAt: r.createdAt,
            owner: r.users[0] || null,
            users: r.users,
            totalOrders: r._count.orders,
            totalMenuItems: r._count.menuItems,
            totalCustomers: r._count.customers,
            totalRevenue: Number(salesAgg._sum?.totalAmount || 0)
          };
        })
      );

      return res.json({ restaurants: formatted });
    } catch (error: any) {
      console.error('Error listing restaurants:', error);
      return res.status(500).json({ error: 'Failed to list restaurants' });
    }
  }

  /**
   * 3. Create a brand new restaurant tenant + admin user.
   */
  static async createRestaurant(req: Request, res: Response) {
    try {
      const {
        name,
        slug,
        phone,
        address,
        tagline,
        deliveryFee,
        subscriptionPlan,
        ownerEmail,
        ownerPassword,
        ownerName,
        template
      } = req.body;

      if (!name || !ownerEmail || !ownerPassword) {
        return res.status(400).json({ error: 'اسم المطعم، والبريد الإلكتروني، وكلمة المرور مطلوبة' });
      }

      // Check if email already in use
      const existingUser = await prisma.user.findUnique({
        where: { email: ownerEmail.toLowerCase().trim() }
      });
      if (existingUser) {
        return res.status(400).json({ error: 'البريد الإلكتروني مسجل بالفعل لمستخدم آخر' });
      }

      // Generate or clean slug
      let cleanSlug = slug
        ? slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-')
        : name.toLowerCase().trim().replace(/[^a-z0-9]/g, '-').substring(0, 30);
      
      if (!cleanSlug) {
        cleanSlug = `rest-${Date.now().toString(36)}`;
      }

      // Ensure slug uniqueness
      const existingSlug = await prisma.restaurant.findUnique({
        where: { slug: cleanSlug }
      });
      if (existingSlug) {
        cleanSlug = `${cleanSlug}-${Math.floor(100 + Math.random() * 900)}`;
      }

      // Create Restaurant
      const defaultExpires = new Date();
      defaultExpires.setDate(defaultExpires.getDate() + 30); // 30-day default subscription

      const restaurant = await prisma.restaurant.create({
        data: {
          name: name.trim(),
          slug: cleanSlug,
          phone: phone ? phone.trim() : null,
          address: address ? address.trim() : null,
          tagline: tagline ? tagline.trim() : 'أفضل تجربة طعام على الإطلاق 🔥',
          deliveryFee: deliveryFee !== undefined ? Number(deliveryFee) : 15.00,
          subscriptionPlan: subscriptionPlan || 'PREMIUM',
          subscriptionStatus: 'ACTIVE',
          subscriptionExpiresAt: defaultExpires,
          receiptFooter: `شكراً لزيارتكم ${name}! 🔥`
        }
      });

      // Create Restaurant Owner User
      const passwordHash = await bcrypt.hash(ownerPassword, 10);
      const user = await prisma.user.create({
        data: {
          email: ownerEmail.toLowerCase().trim(),
          fullName: ownerName || `مدير ${name}`,
          passwordHash,
          role: Role.RESTAURANT_ADMIN,
          restaurantId: restaurant.id
        }
      });

      // Seed starter categories if requested
      if (template === 'FAST_FOOD' || template === 'GRILL') {
        const categories = template === 'FAST_FOOD'
          ? [
              { name: 'ساندوتشات وبرجر 🍔', icon: '🍔', sort: 1 },
              { name: 'وجبات وبوكسات 🍟', icon: '🍟', sort: 2 },
              { name: 'مقبلات وإضافات 🧀', icon: '🧀', sort: 3 },
              { name: 'مشروبات وعصائر 🥤', icon: '🥤', sort: 4 }
            ]
          : [
              { name: 'مشويات ولحوم بلدي 🥩', icon: '🥩', sort: 1 },
              { name: 'طواجن وطبيخ 🍲', icon: '🍲', sort: 2 },
              { name: 'سلطات ومقبلات 🥗', icon: '🥗', sort: 3 },
              { name: 'مشروبات وحلويات 🥤', icon: '🥤', sort: 4 }
            ];

        for (const cat of categories) {
          await prisma.category.create({
            data: {
              restaurantId: restaurant.id,
              name: cat.name,
              icon: cat.icon,
              sortOrder: cat.sort
            }
          });
        }
      }

      return res.status(201).json({
        message: 'تم إنشاء المطعم وحساب الإدارة بنجاح',
        restaurant,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName
        }
      });
    } catch (error: any) {
      console.error('Error creating restaurant:', error);
      return res.status(500).json({ error: error.message || 'فشل إنشاء المطعم' });
    }
  }

  /**
   * 4. Update subscription status, plan, expiration, enabled features, and staff users.
   */
  static async updateRestaurantStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        subscriptionStatus,
        subscriptionPlan,
        subscriptionExpiresAt,
        enabledFeatures,
        isOpen,
        notes,
        userUpdates
      } = req.body;

      let features = enabledFeatures;
      if (!features && subscriptionPlan) {
        if (subscriptionPlan === 'BASIC') {
          features = 'POS,MENU,CAPTAINS';
        } else if (subscriptionPlan === 'PRO') {
          features = 'POS,MENU,REPORTS,CAPTAINS,CUSTOMERS,INVENTORY,RECIPES';
        } else if (subscriptionPlan === 'PREMIUM') {
          features = 'POS,MENU,REPORTS,CAPTAINS,CUSTOMERS,QR,INVENTORY,RECIPES,LOYALTY';
        }
      }

      const updated = await prisma.restaurant.update({
        where: { id },
        data: {
          ...(subscriptionStatus && { subscriptionStatus }),
          ...(subscriptionPlan && { subscriptionPlan }),
          ...(features !== undefined && { enabledFeatures: features }),
          ...(subscriptionExpiresAt && { subscriptionExpiresAt: new Date(subscriptionExpiresAt) }),
          ...(isOpen !== undefined && { isOpen: Boolean(isOpen) }),
          ...(notes !== undefined && { notes })
        }
      });

      // Update specific user roles, names, or passwords if provided
      if (userUpdates && Array.isArray(userUpdates)) {
        for (const u of userUpdates) {
          if (u.id) {
            const dataToUpdate: any = {};
            if (u.role) dataToUpdate.role = u.role;
            if (u.fullName) dataToUpdate.fullName = u.fullName.trim();
            if (u.email) dataToUpdate.email = u.email.toLowerCase().trim();
            if (u.password && u.password.trim()) {
              dataToUpdate.passwordHash = await bcrypt.hash(u.password.trim(), 10);
            }
            if (Object.keys(dataToUpdate).length > 0) {
              await prisma.user.update({
                where: { id: u.id },
                data: dataToUpdate
              });
            }
          }
        }
      }

      return res.json({
        message: 'تم تحديث حالة المطعم وصلاحيات الباقة والمستخدمين بنجاح',
        restaurant: updated
      });
    } catch (error: any) {
      console.error('Error updating restaurant status:', error);
      return res.status(500).json({ error: error.message || 'فشل تحديث حالة المطعم' });
    }
  }

  /**
   * Update any user's role, name, or password directly.
   */
  static async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { role, fullName, password, email } = req.body;
      const dataToUpdate: any = {};
      if (role) dataToUpdate.role = role;
      if (fullName) dataToUpdate.fullName = fullName.trim();
      if (email) dataToUpdate.email = email.toLowerCase().trim();
      if (password && password.trim()) {
        dataToUpdate.passwordHash = await bcrypt.hash(password.trim(), 10);
      }
      const updated = await prisma.user.update({
        where: { id },
        data: dataToUpdate,
        select: { id: true, email: true, fullName: true, role: true, restaurantId: true }
      });
      return res.json({ message: 'تم تحديث بيانات وصلاحيات المستخدم بنجاح', user: updated });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'فشل تحديث المستخدم' });
    }
  }

  /**
   * Create new staff user for a specific restaurant.
   */
  static async createUserForRestaurant(req: Request, res: Response) {
    try {
      const { id: restaurantId } = req.params;
      const { email, password, fullName, role } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبة' });
      }
      const cleanEmail = email.toLowerCase().trim();
      const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
      if (existing) {
        return res.status(409).json({ error: 'البريد مسجل بالفعل' });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          email: cleanEmail,
          passwordHash,
          fullName: fullName || 'موظف',
          role: role || Role.CASHIER,
          restaurantId
        },
        select: { id: true, email: true, fullName: true, role: true, restaurantId: true }
      });
      return res.status(201).json({ message: 'تم إضافة المستخدم بنجاح', user });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'فشل إضافة المستخدم' });
    }
  }

  /**
   * 5. Super Admin Impersonation: Generate token to login directly into any restaurant.
   */
  static async impersonateRestaurant(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const restaurant = await prisma.restaurant.findUnique({
        where: { id },
        include: {
          users: {
            where: { role: Role.RESTAURANT_ADMIN },
            take: 1
          }
        }
      });

      if (!restaurant) {
        return res.status(404).json({ error: 'المطعم غير موجود' });
      }

      // If restaurant has no admin user, create a temporary admin or use current superadmin context
      let targetUser = restaurant.users[0];
      if (!targetUser) {
        const superAdminUser = (req as any).user;
        targetUser = {
          id: superAdminUser.userId,
          email: `admin@${restaurant.slug || 'restaurant'}.com`,
          fullName: `مدير ${restaurant.name}`
        } as any;
      }

      // Sign JWT with this restaurant's ID so all dashboard views render this restaurant
      const token = jwt.sign(
        {
          userId: targetUser.id,
          email: targetUser.email,
          fullName: targetUser.fullName || `مدير ${restaurant.name}`,
          role: Role.RESTAURANT_ADMIN,
          restaurantId: restaurant.id,
          isImpersonating: true
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        message: `تم الدخول المباشر كمدير لمطعم ${restaurant.name}`,
        token,
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug
        },
        redirectUrl: '/dashboard'
      });
    } catch (error: any) {
      console.error('Error impersonating restaurant:', error);
      return res.status(500).json({ error: 'Failed to impersonate restaurant' });
    }
  }
}
