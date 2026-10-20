import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { OrderStatus, OrderType } from '@prisma/client';

export class OrderController {
  /**
   * Helper to generate a catchy short order code e.g. DJ-7821
   */
  private static generateOrderNumber(): string {
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    return `DJ-${randomDigits}`;
  }

  /**
   * Customer or Cashier submits an order (Takeaway or Delivery).
   */
  static async createOrder(req: Request, res: Response) {
    try {
      const {
        customerName,
        customerPhone,
        orderType,
        deliveryAddress,
        notes,
        items,
        status,
        captainId,
        paymentStatus,
        customDeliveryFee,
        discount
      } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Missing required items list.' });
      }

      // 1. Get restaurant for delivery fee and validation
      const restaurant = await prisma.restaurant.findFirst();
      if (!restaurant) {
        return res.status(500).json({ error: 'Restaurant configuration not found.' });
      }

      // Default name/phone for fast walk-in cashier orders
      const resolvedCustomerName = customerName?.trim() || (orderType === 'DELIVERY' ? 'عميل دليفري' : 'عميل تيك واي');
      const resolvedCustomerPhone = customerPhone?.trim() || '01000000000';

      // 2. Fetch all menu items referenced in the order
      const itemIds = items.map((it: any) => it.menuItemId);
      const dbItems = await prisma.menuItem.findMany({
        where: { id: { in: itemIds } }
      });

      const dbItemsMap = new Map(dbItems.map(i => [i.id, i]));

      let subtotal = 0;
      const orderItemsData: any[] = [];

      for (const item of items) {
        const dbItem = dbItemsMap.get(item.menuItemId);
        if (!dbItem) continue;

        const qty = Number(item.quantity) || 1;
        const unitPrice = Number(dbItem.price);
        const lineTotal = unitPrice * qty;
        subtotal += lineTotal;

        orderItemsData.push({
          menuItemId: dbItem.id,
          name: dbItem.name,
          quantity: qty,
          unitPrice: unitPrice,
          totalPrice: lineTotal,
          notes: item.notes || null
        });
      }

      if (orderItemsData.length === 0) {
        return res.status(400).json({ error: 'No valid menu items selected.' });
      }

      const isDelivery = (orderType === 'DELIVERY' || orderType === OrderType.DELIVERY);
      const deliveryFee = isDelivery 
        ? (customDeliveryFee !== undefined ? Number(customDeliveryFee) : Number(restaurant.deliveryFee))
        : 0;
      
      const discountAmount = Number(discount) || 0;
      const totalAmount = Math.max(0, subtotal + deliveryFee - discountAmount);
      const orderNumber = OrderController.generateOrderNumber();

      // Determine initial status
      let initialStatus: OrderStatus = OrderStatus.PENDING;
      if (status && Object.values(OrderStatus).includes(status)) {
        initialStatus = status;
      } else if (captainId && isDelivery) {
        initialStatus = OrderStatus.ON_THE_WAY;
      }

      // 3. Create the order inside transaction
      const newOrder = await prisma.order.create({
        data: {
          orderNumber,
          restaurantId: restaurant.id,
          orderType: isDelivery ? OrderType.DELIVERY : OrderType.TAKEAWAY,
          customerName: resolvedCustomerName,
          customerPhone: resolvedCustomerPhone,
          deliveryAddress: isDelivery ? (deliveryAddress || null) : null,
          captainId: (isDelivery && captainId) ? captainId : null,
          notes: notes || null,
          subtotal,
          deliveryFee,
          totalAmount,
          status: initialStatus,
          paymentStatus: paymentStatus === 'PAID' ? 'PAID' : 'UNPAID',
          items: {
            create: orderItemsData
          }
        },
        include: {
          items: true,
          captain: true
        }
      });

      return res.status(201).json({
        message: 'Order created successfully! 🔥',
        order: newOrder
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to create order', message: err.message });
    }
  }

  /**
   * Customer tracks their order by orderNumber.
   */
  static async trackOrder(req: Request, res: Response) {
    try {
      const { orderNumber } = req.params;

      const order = await prisma.order.findUnique({
        where: { orderNumber },
        include: {
          items: true,
          captain: {
            select: { name: true, phone: true, vehicleType: true }
          },
          restaurant: {
            select: { name: true, phone: true }
          }
        }
      });

      if (!order) {
        return res.status(404).json({ error: 'Order not found with this code.' });
      }

      return res.json(order);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to track order', message: err.message });
    }
  }

  /**
   * List live orders for Restaurant Dashboard (Kitchen / Cashier).
   */
  static async getOrders(req: Request, res: Response) {
    try {
      const { status, type } = req.query;

      const where: any = {};
      if (status && status !== 'ALL') {
        where.status = status as OrderStatus;
      }
      if (type && type !== 'ALL') {
        where.orderType = type as OrderType;
      }

      const orders = await prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          captain: true
        }
      });

      return res.json(orders);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to fetch orders', message: err.message });
    }
  }

  /**
   * Update order status or assign delivery captain.
   */
  static async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, captainId, paymentStatus } = req.body;

      const updated = await prisma.order.update({
        where: { id },
        data: {
          status: status || undefined,
          captainId: captainId !== undefined ? captainId : undefined,
          paymentStatus: paymentStatus || undefined
        },
        include: {
          items: true,
          captain: true
        }
      });

      return res.json({ message: 'Order updated successfully', order: updated });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to update order status', message: err.message });
    }
  }

  /**
   * Delete / Cancel an order.
   */
  static async deleteOrder(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.order.delete({ where: { id } });
      return res.json({ message: 'Order deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to delete order', message: err.message });
    }
  }
}
