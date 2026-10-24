import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export class CustomerController {
  /**
   * Fast lookup for POS Cashier by phone or name.
   * Auto-remembers customer name, delivery address, order history, and preferences.
   */
  static async lookupCustomer(req: Request, res: Response) {
    try {
      const q = ((req.query.phone || req.query.query || req.query.q || '') as string).trim();

      if (!q || q.length < 2) {
        return res.json({ customer: null, matches: [] });
      }

      // Exclude dummy walk-in default numbers
      const IGNORED_PHONES = ['01000000000', '00000000000', '', '0'];

      // Fetch or sync from Customer table
      const restaurant = await prisma.restaurant.findFirst();
      const restaurantId = restaurant?.id;

      // 1. Fetch from Customer table directly
      let dbCustomers: any[] = [];
      if (restaurantId) {
        dbCustomers = await prisma.customer.findMany({
          where: {
            restaurantId,
            phone: { notIn: IGNORED_PHONES },
            OR: [
              { phone: { contains: q } },
              { name: { contains: q, mode: 'insensitive' } }
            ]
          },
          take: 10
        });
      }

      const orders = await prisma.order.findMany({
        where: {
          customerPhone: { notIn: IGNORED_PHONES },
          OR: [
            { customerPhone: { contains: q } },
            { customerName: { contains: q, mode: 'insensitive' } }
          ]
        },
        orderBy: { createdAt: 'desc' },
        take: 80,
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          customerPhone: true,
          deliveryAddress: true,
          notes: true,
          orderType: true,
          totalAmount: true,
          createdAt: true,
          items: {
            select: {
              name: true,
              quantity: true
            }
          }
        }
      });

      const customerMap = new Map<string, any>();

      // Populate from DB Customer records first
      for (const dc of dbCustomers) {
        customerMap.set(dc.phone, {
          phone: dc.phone,
          name: dc.name || 'عميل',
          address: dc.address || '',
          notes: dc.notes || '',
          pointsBalance: dc.pointsBalance || 0,
          lifetimePoints: dc.lifetimePoints || 0,
          totalSpent: Number(dc.totalSpent || 0),
          totalOrders: dc.totalOrders || 0,
          lastOrderType: null,
          lastOrderNumber: null,
          lastOrderAt: dc.updatedAt,
          itemsCountMap: {} as Record<string, number>
        });
      }

      for (const o of orders) {
        const rawPhone = (o.customerPhone || '').trim();
        if (!rawPhone || IGNORED_PHONES.includes(rawPhone)) continue;

        const phone = rawPhone.replace(/[\s-]/g, '');

        if (!customerMap.has(phone)) {
          customerMap.set(phone, {
            phone,
            name: o.customerName || 'عميل',
            address: o.deliveryAddress || '',
            notes: o.notes || '',
            pointsBalance: 0,
            lifetimePoints: 0,
            lastOrderType: o.orderType,
            lastOrderNumber: o.orderNumber,
            totalOrders: 1,
            totalSpent: Number(o.totalAmount || 0),
            lastOrderAt: o.createdAt,
            itemsCountMap: {} as Record<string, number>
          });
        } else {
          const c = customerMap.get(phone);
          if (!c.lastOrderNumber) {
            c.lastOrderType = o.orderType;
            c.lastOrderNumber = o.orderNumber;
            c.lastOrderAt = o.createdAt;
          }
          if (!c.address && o.deliveryAddress) {
            c.address = o.deliveryAddress;
          }
          if (!c.notes && o.notes) {
            c.notes = o.notes;
          }
          if (c.totalOrders === 0) {
            c.totalOrders += 1;
            c.totalSpent += Number(o.totalAmount || 0);
          }
        }

        // Track favorite dishes
        const c = customerMap.get(phone);
        if (o.items && Array.isArray(o.items)) {
          for (const it of o.items) {
            c.itemsCountMap[it.name] = (c.itemsCountMap[it.name] || 0) + (it.quantity || 1);
          }
        }
      }

      // Format final matches with top 3 favorite items
      const matches = Array.from(customerMap.values()).map(c => {
        const favoriteItems = Object.entries(c.itemsCountMap as Record<string, number>)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name]) => name);

        delete c.itemsCountMap;
        return {
          ...c,
          totalSpent: Math.round(c.totalSpent),
          favoriteItems
        };
      });

      // Find exact phone match if any
      const cleanSearchDigits = q.replace(/[\s-]/g, '');
      const exactCustomer = matches.find(c => c.phone === cleanSearchDigits) 
        || (matches.length === 1 && matches[0].phone.includes(cleanSearchDigits) ? matches[0] : null);

      // Also fetch redeemable rewards from menu
      const redeemableRewards = await prisma.menuItem.findMany({
        where: {
          pointsCost: { gt: 0 },
          isAvailable: true
        },
        select: {
          id: true,
          name: true,
          price: true,
          imageUrl: true,
          pointsCost: true,
          badge: true
        },
        orderBy: { pointsCost: 'asc' }
      });

      return res.json({
        customer: exactCustomer,
        matches: matches.slice(0, 8),
        redeemableRewards,
        loyaltyConfig: {
          enabled: restaurant?.loyaltyEnabled ?? true,
          spendRatio: Number(restaurant?.loyaltySpendRatio ?? 10),
          minRedeem: restaurant?.loyaltyMinRedeem ?? 30
        }
      });
    } catch (err: any) {
      console.error('Customer lookup error:', err);
      return res.status(500).json({ error: 'Failed to lookup customer', message: err.message });
    }
  }

  /**
   * List all known registered customers with CRM stats.
   */
  static async getCustomers(req: Request, res: Response) {
    try {
      const q = ((req.query.search || req.query.q || '') as string).trim();
      const IGNORED_PHONES = ['01000000000', '00000000000', '', '0'];

      const where: any = {
        customerPhone: { notIn: IGNORED_PHONES }
      };

      if (q) {
        where.OR = [
          { customerPhone: { contains: q } },
          { customerName: { contains: q, mode: 'insensitive' } },
          { deliveryAddress: { contains: q, mode: 'insensitive' } }
        ];
      }

      const orders = await prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          customerPhone: true,
          deliveryAddress: true,
          notes: true,
          orderType: true,
          totalAmount: true,
          createdAt: true,
          items: {
            select: {
              name: true,
              quantity: true
            }
          }
        }
      });

      const customerMap = new Map<string, any>();

      for (const o of orders) {
        const rawPhone = (o.customerPhone || '').trim();
        if (!rawPhone || IGNORED_PHONES.includes(rawPhone)) continue;
        const phone = rawPhone.replace(/[\s-]/g, '');

        if (!customerMap.has(phone)) {
          customerMap.set(phone, {
            phone,
            name: o.customerName || 'عميل',
            address: o.deliveryAddress || '',
            notes: o.notes || '',
            lastOrderType: o.orderType,
            lastOrderNumber: o.orderNumber,
            totalOrders: 1,
            totalSpent: Number(o.totalAmount || 0),
            lastOrderAt: o.createdAt,
            itemsCountMap: {} as Record<string, number>
          });
        } else {
          const c = customerMap.get(phone);
          c.totalOrders += 1;
          c.totalSpent += Number(o.totalAmount || 0);
          if (!c.address && o.deliveryAddress) {
            c.address = o.deliveryAddress;
          }
          if (!c.notes && o.notes) {
            c.notes = o.notes;
          }
        }

        const c = customerMap.get(phone);
        if (o.items && Array.isArray(o.items)) {
          for (const it of o.items) {
            c.itemsCountMap[it.name] = (c.itemsCountMap[it.name] || 0) + (it.quantity || 1);
          }
        }
      }

      // Fetch DB Customer records to merge pointsBalance
      const restaurant = await prisma.restaurant.findFirst();
      if (restaurant) {
        const dbCustomers = await prisma.customer.findMany({
          where: { restaurantId: restaurant.id }
        });
        for (const dc of dbCustomers) {
          if (customerMap.has(dc.phone)) {
            const c = customerMap.get(dc.phone);
            c.pointsBalance = dc.pointsBalance;
            c.lifetimePoints = dc.lifetimePoints;
          } else {
            customerMap.set(dc.phone, {
              phone: dc.phone,
              name: dc.name || 'عميل',
              address: dc.address || '',
              notes: dc.notes || '',
              pointsBalance: dc.pointsBalance,
              lifetimePoints: dc.lifetimePoints,
              lastOrderType: null,
              lastOrderNumber: null,
              totalOrders: dc.totalOrders,
              totalSpent: Number(dc.totalSpent),
              lastOrderAt: dc.updatedAt,
              itemsCountMap: {} as Record<string, number>
            });
          }
        }
      }

      const customers = Array.from(customerMap.values())
        .map(c => {
          const favoriteItems = Object.entries(c.itemsCountMap as Record<string, number>)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name]) => name);

          delete c.itemsCountMap;
          return {
            ...c,
            pointsBalance: c.pointsBalance || 0,
            lifetimePoints: c.lifetimePoints || 0,
            totalSpent: Math.round(c.totalSpent),
            favoriteItems
          };
        })
        .sort((a, b) => b.totalOrders - a.totalOrders || new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime());

      return res.json({
        count: customers.length,
        customers
      });
    } catch (err: any) {
      console.error('Get customers error:', err);
      return res.status(500).json({ error: 'Failed to get customers', message: err.message });
    }
  }

  /**
   * Adjust loyalty points for a customer (Admin only).
   */
  static async adjustPoints(req: Request, res: Response) {
    try {
      const phone = (req.params.phone || '').trim().replace(/[\s-]/g, '');
      const { amount, reason } = req.body; // e.g. amount: +50 or -20

      if (!phone || amount === undefined || isNaN(Number(amount))) {
        return res.status(400).json({ error: 'Missing phone number or valid points amount.' });
      }

      const restaurant = await prisma.restaurant.findFirst();
      if (!restaurant) {
        return res.status(500).json({ error: 'Restaurant not found.' });
      }

      const delta = Math.round(Number(amount));

      // Find or create customer
      let customer = await prisma.customer.findUnique({
        where: {
          restaurantId_phone: {
            restaurantId: restaurant.id,
            phone
          }
        }
      });

      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            restaurantId: restaurant.id,
            phone,
            name: (req.body.name || 'عميل').trim(),
            pointsBalance: Math.max(0, delta),
            lifetimePoints: Math.max(0, delta)
          }
        });
      } else {
        const newBalance = Math.max(0, customer.pointsBalance + delta);
        const newLifetime = delta > 0 ? customer.lifetimePoints + delta : customer.lifetimePoints;

        customer = await prisma.customer.update({
          where: { id: customer.id },
          data: {
            pointsBalance: newBalance,
            lifetimePoints: newLifetime
          }
        });
      }

      // Record transaction
      await prisma.pointTransaction.create({
        data: {
          restaurantId: restaurant.id,
          customerId: customer.id,
          amount: delta,
          type: delta > 0 ? 'ADJUSTED' : 'REDEEMED',
          description: reason || (delta > 0 ? 'تعديل يدوي / مكافأة إدارة' : 'خصم نقاط يدوي')
        }
      });

      return res.json({
        message: 'Points adjusted successfully',
        customer: {
          phone: customer.phone,
          name: customer.name,
          pointsBalance: customer.pointsBalance,
          lifetimePoints: customer.lifetimePoints
        }
      });
    } catch (err: any) {
      console.error('Adjust points error:', err);
      return res.status(500).json({ error: 'Failed to adjust points', message: err.message });
    }
  }

  /**
   * Get past order history for a specific customer phone.
   */
  static async getCustomerHistory(req: Request, res: Response) {
    try {
      const phone = (req.params.phone || '').trim().replace(/[\s-]/g, '');

      if (!phone) {
        return res.status(400).json({ error: 'Missing phone number.' });
      }

      const orders = await prisma.order.findMany({
        where: { customerPhone: phone },
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          captain: {
            select: { name: true, phone: true }
          }
        }
      });

      return res.json({
        phone,
        totalOrders: orders.length,
        orders
      });
    } catch (err: any) {
      console.error('Customer history error:', err);
      return res.status(500).json({ error: 'Failed to get customer history', message: err.message });
    }
  }
}
