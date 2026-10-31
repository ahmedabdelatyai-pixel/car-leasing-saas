import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export class RestaurantController {
  /**
   * Helper to get or auto-initialize Dajja restaurant record.
   */
  private static async getOrCreateRestaurant(targetIdentifier?: string): Promise<any> {
    let whereClause: any = undefined;
    if (targetIdentifier && targetIdentifier !== 'default') {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetIdentifier);
      if (isUuid) {
        whereClause = { id: targetIdentifier };
      } else {
        whereClause = { slug: targetIdentifier };
      }
    }

    let restaurant = await prisma.restaurant.findFirst({
      ...(whereClause && { where: whereClause }),
      include: {
        overheads: true,
        stories: {
          orderBy: { sortOrder: 'asc' }
        },
        categories: {
          orderBy: { sortOrder: 'asc' },
          include: {
            items: {
              orderBy: { sortOrder: 'asc' },
              include: {
                recipe: {
                  include: {
                    ingredients: {
                      include: {
                        inventoryItem: true
                      }
                    }
                  }
                }
              }
            }
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
          overheads: true,
          stories: {
            orderBy: { sortOrder: 'asc' }
          },
          categories: {
            orderBy: { sortOrder: 'asc' },
            include: {
              items: {
                orderBy: { sortOrder: 'asc' },
                include: {
                  recipe: {
                    include: {
                      ingredients: {
                        include: {
                          inventoryItem: true
                        }
                      }
                    }
                  }
                }
              }
            }
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
      const target = (req.query.restaurant || req.query.restaurantId || req.query.slug || req.headers['x-restaurant-id']) as string | undefined;
      const restaurant = await RestaurantController.getOrCreateRestaurant(target);

      const totalOverheads = (restaurant.overheads || []).reduce(
        (acc: number, curr: any) => acc + Number(curr.monthlyAmount || 0), 0
      );
      const avgOrders = Math.max(1, restaurant.averageDailyOrders || 80);
      const indirectCostPerOrder = Number((totalOverheads / 30 / avgOrders).toFixed(2));

      const categoriesFormatted = (restaurant.categories || []).map((cat: any) => ({
        ...cat,
        items: (cat.items || []).map((item: any) => {
          let directCost = 0;
          let availablePortions = 999;
          let limitingIngredient = '';
          const hasRecipe = !!(item.recipe && item.recipe.ingredients && item.recipe.ingredients.length > 0);

          if (hasRecipe) {
            for (const ing of item.recipe.ingredients) {
              const qtyUsed = Number(ing.quantityUsed) || 0;
              const unitPrice = ing.inventoryItem ? Number(ing.inventoryItem.pricePerUnit) : 0;
              directCost += (qtyUsed * unitPrice);

              if (ing.inventoryItem && qtyUsed > 0) {
                const stock = Number(ing.inventoryItem.currentStock) || 0;
                const portions = Math.max(0, Math.floor(stock / qtyUsed));
                if (portions < availablePortions) {
                  availablePortions = portions;
                  limitingIngredient = ing.inventoryItem.name;
                }
              }
            }
          }

          directCost = Number(directCost.toFixed(2));
          const trueCost = Number((directCost + indirectCostPerOrder).toFixed(2));
          const sellingPrice = Number(item.price);
          const netProfit = Number((sellingPrice - trueCost).toFixed(2));
          const profitMarginPercent = sellingPrice > 0 ? Number(((netProfit / sellingPrice) * 100).toFixed(1)) : 0;
          const isOutOfStock = hasRecipe && availablePortions <= 0;
          const isLowStock = hasRecipe && availablePortions > 0 && availablePortions <= 5;

          return {
            ...item,
            directCost,
            indirectCost: indirectCostPerOrder,
            trueCost,
            netProfit,
            profitMarginPercent,
            hasRecipe,
            availablePortions: hasRecipe ? availablePortions : null,
            isOutOfStock,
            isLowStock,
            limitingIngredient: (isOutOfStock || isLowStock) ? limitingIngredient : null
          };
        })
      }));

      return res.json({
        ...restaurant,
        totalMonthlyOverheads: totalOverheads,
        indirectCostPerOrder,
        categories: categoriesFormatted
      });
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
      const {
        name,
        tagline,
        phone,
        whatsappNumber,
        address,
        googleMapsUrl,
        deliveryZones,
        deliveryFee,
        minOrderAmount,
        estimatedTime,
        allowDelivery,
        allowTakeaway,
        receiptFooter,
        isOpen,
        logoUrl,
        loyaltyEnabled,
        loyaltySpendRatio,
        loyaltyMinRedeem
      } = req.body;

      const updated = await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: {
          name: name !== undefined ? name.trim() : undefined,
          tagline: tagline !== undefined ? tagline.trim() : undefined,
          phone: phone !== undefined ? phone.trim() : undefined,
          whatsappNumber: whatsappNumber !== undefined ? whatsappNumber.trim() : undefined,
          address: address !== undefined ? address.trim() : undefined,
          googleMapsUrl: googleMapsUrl !== undefined ? googleMapsUrl.trim() : undefined,
          deliveryZones: deliveryZones !== undefined ? deliveryZones.trim() : undefined,
          deliveryFee: deliveryFee !== undefined ? Number(deliveryFee) : undefined,
          minOrderAmount: minOrderAmount !== undefined ? Number(minOrderAmount) : undefined,
          estimatedTime: estimatedTime !== undefined ? estimatedTime.trim() : undefined,
          allowDelivery: allowDelivery !== undefined ? Boolean(allowDelivery) : undefined,
          allowTakeaway: allowTakeaway !== undefined ? Boolean(allowTakeaway) : undefined,
          receiptFooter: receiptFooter !== undefined ? receiptFooter.trim() : undefined,
          isOpen: isOpen !== undefined ? Boolean(isOpen) : undefined,
          logoUrl: logoUrl !== undefined ? logoUrl : undefined,
          loyaltyEnabled: loyaltyEnabled !== undefined ? Boolean(loyaltyEnabled) : undefined,
          loyaltySpendRatio: loyaltySpendRatio !== undefined ? Number(loyaltySpendRatio) : undefined,
          loyaltyMinRedeem: loyaltyMinRedeem !== undefined ? Number(loyaltyMinRedeem) : undefined
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
      const { categoryId, name, description, price, imageUrl, badge, isAvailable, isAddon, pointsCost, sortOrder } = req.body;

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
          sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
          isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : true,
          isAddon: isAddon !== undefined ? Boolean(isAddon) : false,
          pointsCost: pointsCost !== undefined && pointsCost !== null ? Number(pointsCost) : 0
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
      const { name, description, price, imageUrl, badge, isAvailable, isAddon, categoryId, pointsCost, sortOrder } = req.body;

      const updated = await prisma.menuItem.update({
        where: { id },
        data: {
          name: name || undefined,
          description: description !== undefined ? description : undefined,
          price: price !== undefined ? Number(price) : undefined,
          imageUrl: imageUrl !== undefined ? imageUrl : undefined,
          badge: badge !== undefined ? badge : undefined,
          sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
          isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : undefined,
          isAddon: isAddon !== undefined ? Boolean(isAddon) : undefined,
          categoryId: categoryId || undefined,
          pointsCost: pointsCost !== undefined && pointsCost !== null ? Number(pointsCost) : undefined
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

  /**
   * Get all stories for the restaurant (Admin or Public)
   */
  static async getStories(req: Request, res: Response) {
    try {
      const restaurant = await RestaurantController.getOrCreateRestaurant(
        (req.query.restaurant || req.query.restaurantId || (req as any).user?.restaurantId) as string | undefined
      );
      const stories = await prisma.story.findMany({
        where: { restaurantId: restaurant.id },
        orderBy: { sortOrder: 'asc' }
      });
      return res.json(stories);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to fetch stories', message: err.message });
    }
  }

  /**
   * Create a new story (Admin)
   */
  static async createStory(req: Request, res: Response) {
    try {
      const restaurant = await RestaurantController.getOrCreateRestaurant((req as any).user?.restaurantId);
      const { title, subtitle, imageUrl, badge, priceText, linkedItemId, actionText, sortOrder, isActive } = req.body;

      if (!title || !imageUrl) {
        return res.status(400).json({ error: 'Title and Image URL are required for story' });
      }

      const story = await prisma.story.create({
        data: {
          restaurantId: restaurant.id,
          title: title.trim(),
          subtitle: subtitle ? subtitle.trim() : null,
          imageUrl: imageUrl.trim(),
          badge: badge ? badge.trim() : 'عرض خاص 🔥',
          priceText: priceText ? priceText.trim() : null,
          linkedItemId: linkedItemId || null,
          actionText: actionText ? actionText.trim() : 'اطلب الآن 🚀',
          sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
          isActive: isActive !== undefined ? Boolean(isActive) : true
        }
      });

      return res.status(201).json(story);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to create story', message: err.message });
    }
  }

  /**
   * Update an existing story (Admin)
   */
  static async updateStory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { title, subtitle, imageUrl, badge, priceText, linkedItemId, actionText, sortOrder, isActive } = req.body;

      const story = await prisma.story.update({
        where: { id },
        data: {
          title: title !== undefined ? title.trim() : undefined,
          subtitle: subtitle !== undefined ? (subtitle ? subtitle.trim() : null) : undefined,
          imageUrl: imageUrl !== undefined ? imageUrl.trim() : undefined,
          badge: badge !== undefined ? (badge ? badge.trim() : null) : undefined,
          priceText: priceText !== undefined ? (priceText ? priceText.trim() : null) : undefined,
          linkedItemId: linkedItemId !== undefined ? (linkedItemId || null) : undefined,
          actionText: actionText !== undefined ? (actionText ? actionText.trim() : null) : undefined,
          sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
          isActive: isActive !== undefined ? Boolean(isActive) : undefined
        }
      });

      return res.json(story);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to update story', message: err.message });
    }
  }

  /**
   * Delete a story (Admin)
   */
  static async deleteStory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.story.delete({ where: { id } });
      return res.json({ message: 'Story deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to delete story', message: err.message });
    }
  }
}

