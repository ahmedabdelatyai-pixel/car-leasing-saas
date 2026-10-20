import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export class RestaurantController {
  /**
   * Helper to get or auto-initialize Dajja restaurant record.
   */
  private static async getOrCreateRestaurant() {
    let restaurant = await prisma.restaurant.findFirst({
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
          include: {
            items: true
          }
        }
      }
    });

    if (!restaurant) {
      const created = await prisma.restaurant.create({
        data: {
          name: 'مطعم ضجة',
          tagline: 'طعم يعمل ضجة! 🔥 أقوى برجر وسندوتشات دليفري وتيك واي',
          phone: '01000000000',
          address: 'شارع المطاعم - وسط البلد',
          deliveryFee: 15.00,
          isOpen: true
        }
      });

      // 1. Create Burger Category & Items
      const catBurgers = await prisma.category.create({
        data: {
          restaurantId: created.id,
          name: 'برجر ضجة 🍔',
          icon: '🍔',
          sortOrder: 1
        }
      });

      await prisma.menuItem.createMany({
        data: [
          {
            restaurantId: created.id,
            categoryId: catBurgers.id,
            name: 'سوبر ضجة برجر دبل',
            description: 'قطعتين لحم بلدي صافي مشوي على اللهب، صوص شيدر سايح، بيكون بقري مقرمش، صوص ضجة الخاص وخيار مخلل',
            price: 135.00,
            imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80',
            badge: 'الأكثر مبيعاً 🔥',
            isAvailable: true
          },
          {
            restaurantId: created.id,
            categoryId: catBurgers.id,
            name: 'ضجة تشيز كلاسيك برجر',
            description: 'قطعة لحم مشوية 150 جرام مع دبل جبنة أمريكية، بصل مكرمل وخس فريش',
            price: 95.00,
            imageUrl: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=600&q=80',
            badge: 'كلاسيك',
            isAvailable: true
          }
        ]
      });

      // 2. Create Chicken Category & Items
      const catChicken = await prisma.category.create({
        data: {
          restaurantId: created.id,
          name: 'فراخ وسندوتشات كرسبي 🍗',
          icon: '🍗',
          sortOrder: 2
        }
      });

      await prisma.menuItem.createMany({
        data: [
          {
            restaurantId: created.id,
            categoryId: catChicken.id,
            name: 'ساندوتش زنجر ناري سبايسي',
            description: 'صدر فراخ كرسبي مقرمش مع هالابينو وصوص حار وجبنة سايحة في خبز بريوش طازج',
            price: 90.00,
            imageUrl: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=600&q=80',
            badge: 'سبايسي 🌶️',
            isAvailable: true
          },
          {
            restaurantId: created.id,
            categoryId: catChicken.id,
            name: 'وجبة توفير ضجة كرانشي (3 قطع)',
            description: '3 قطع دجاج كرسبي مع بطاطس مقلية، كول سلو وخبز طازج وصوص باربيكيو',
            price: 110.00,
            imageUrl: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=600&q=80',
            badge: 'توفير 💰',
            isAvailable: true
          }
        ]
      });

      // 3. Create Sides Category & Items
      const catSides = await prisma.category.create({
        data: {
          restaurantId: created.id,
          name: 'إضافات وبطاطس وصوصات 🍟',
          icon: '🍟',
          sortOrder: 3
        }
      });

      await prisma.menuItem.createMany({
        data: [
          {
            restaurantId: created.id,
            categoryId: catSides.id,
            name: 'بطاطس تشيزي ضجة بالبيكون',
            description: 'بطاطس فارم فريتس مقرمشة مغطاة بصوص جبنة شيدر غني وقطع بيكون وهالابينو',
            price: 55.00,
            imageUrl: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=600&q=80',
            isAvailable: true
          },
          {
            restaurantId: created.id,
            categoryId: catSides.id,
            name: 'أصابع موتزاريلا ستيكس (4 قطع)',
            description: 'أصابع جبنة موتزاريلا مقرمشة وسايحة مع صوص المارينارا اللذيذ',
            price: 45.00,
            imageUrl: 'https://images.unsplash.com/photo-1548340748-6d2b7d7da280?auto=format&fit=crop&w=600&q=80',
            isAvailable: true
          }
        ]
      });

      // Refetch restaurant with newly created categories and items
      restaurant = await prisma.restaurant.findUnique({
        where: { id: created.id },
        include: {
          categories: {
            orderBy: { sortOrder: 'asc' },
            include: { items: true }
          }
        }
      });
    }

    return restaurant!;
  }

  /**
   * Get public menu and restaurant details for customers.
   */
  static async getPublicMenu(req: Request, res: Response) {
    try {
      const restaurant = await RestaurantController.getOrCreateRestaurant();
      return res.json(restaurant);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to load restaurant menu', message: err.message });
    }
  }

  /**
   * Update restaurant settings (Admin only).
   */
  static async updateSettings(req: Request, res: Response) {
    try {
      const restaurant = await RestaurantController.getOrCreateRestaurant();
      const { name, tagline, phone, address, deliveryFee, isOpen, logoUrl } = req.body;

      const updated = await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: {
          name: name || undefined,
          tagline: tagline || undefined,
          phone: phone || undefined,
          address: address || undefined,
          deliveryFee: deliveryFee !== undefined ? Number(deliveryFee) : undefined,
          isOpen: isOpen !== undefined ? Boolean(isOpen) : undefined,
          logoUrl: logoUrl !== undefined ? logoUrl : undefined
        }
      });

      return res.json({ message: 'Settings updated successfully', restaurant: updated });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to update settings', message: err.message });
    }
  }

  /**
   * Create a new category in menu.
   */
  static async createCategory(req: Request, res: Response) {
    try {
      const restaurant = await RestaurantController.getOrCreateRestaurant();
      const { name, icon, sortOrder } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Category name is required' });
      }

      const category = await prisma.category.create({
        data: {
          restaurantId: restaurant.id,
          name,
          icon: icon || '🍔',
          sortOrder: sortOrder ? Number(sortOrder) : 0
        }
      });

      return res.status(201).json(category);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to create category', message: err.message });
    }
  }

  /**
   * Create a new menu item.
   */
  static async createMenuItem(req: Request, res: Response) {
    try {
      const restaurant = await RestaurantController.getOrCreateRestaurant();
      const { categoryId, name, description, price, imageUrl, badge, isAvailable } = req.body;

      if (!categoryId || !name || price === undefined) {
        return res.status(400).json({ error: 'Missing required item details: categoryId, name, price' });
      }

      const item = await prisma.menuItem.create({
        data: {
          restaurantId: restaurant.id,
          categoryId,
          name,
          description: description || null,
          price: Number(price),
          imageUrl: imageUrl || null,
          badge: badge || null,
          isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : true
        }
      });

      return res.status(201).json(item);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to create menu item', message: err.message });
    }
  }

  /**
   * Update an existing menu item.
   */
  static async updateMenuItem(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, price, imageUrl, badge, isAvailable, categoryId } = req.body;

      const updated = await prisma.menuItem.update({
        where: { id },
        data: {
          name: name || undefined,
          description: description !== undefined ? description : undefined,
          price: price !== undefined ? Number(price) : undefined,
          imageUrl: imageUrl !== undefined ? imageUrl : undefined,
          badge: badge !== undefined ? badge : undefined,
          isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : undefined,
          categoryId: categoryId || undefined
        }
      });

      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to update menu item', message: err.message });
    }
  }

  /**
   * Delete a menu item.
   */
  static async deleteMenuItem(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.menuItem.delete({ where: { id } });
      return res.json({ message: 'Menu item deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to delete menu item', message: err.message });
    }
  }
}
