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

      for (const o of orders) {
        const rawPhone = (o.customerPhone || '').trim();
        if (!rawPhone || IGNORED_PHONES.includes(rawPhone)) continue;

        // Clean phone (remove spaces/dashes)
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

      return res.json({
        customer: exactCustomer,
        matches: matches.slice(0, 8)
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

      const customers = Array.from(customerMap.values())
        .map(c => {
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
