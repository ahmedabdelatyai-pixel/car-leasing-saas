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

      // 1. Fetch all menu items referenced in the order
      const itemIds = items.map((it: any) => it.menuItemId);
      const dbItems = await prisma.menuItem.findMany({
        where: { id: { in: itemIds } }
      });

      const dbItemsMap = new Map(dbItems.map(i => [i.id, i]));

      // 2. Resolve restaurant for delivery fee and validation
      const targetRestId = (req as any).user?.restaurantId || req.body.restaurantId || (dbItems[0] ? dbItems[0].restaurantId : null);
      let restaurant = targetRestId
        ? await prisma.restaurant.findUnique({ where: { id: targetRestId } })
        : await prisma.restaurant.findFirst();

      if (!restaurant) {
        return res.status(500).json({ error: 'Restaurant configuration not found.' });
      }

      // Default name/phone for fast walk-in cashier orders
      const resolvedCustomerName = customerName?.trim() || (orderType === 'DELIVERY' ? 'عميل دليفري' : 'عميل تيك واي');
      const resolvedCustomerPhone = customerPhone?.trim() || '01000000000';

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
      const isDineIn = (orderType === 'DINE_IN' || orderType === OrderType.DINE_IN);
      const finalOrderType = isDineIn ? OrderType.DINE_IN : (isDelivery ? OrderType.DELIVERY : OrderType.TAKEAWAY);

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

      // 3. Loyalty Points Calculation (Configurable spend ratio per restaurant)
      const requestedRedeem = Math.max(0, Number(req.body.pointsRedeemed) || 0);
      let pointsEarned = 0;
      let pointsRedeemed = 0;

      if (restaurant.loyaltyEnabled) {
        const spendRatio = Number(restaurant.loyaltySpendRatio) || 10;
        // e.g. 200 EGP / 10 = 20 points, 600 EGP / 10 = 60 points
        pointsEarned = Math.floor(totalAmount / spendRatio);
      }

      // Customer Record & Points Transaction handling
      const IGNORED_PHONES = ['01000000000', '00000000000', '', '0'];
      const cleanPhone = resolvedCustomerPhone.replace(/[\s-]/g, '');
      let customerRecord: any = null;

      if (cleanPhone && !IGNORED_PHONES.includes(cleanPhone)) {
        customerRecord = await prisma.customer.findUnique({
          where: {
            restaurantId_phone: {
              restaurantId: restaurant.id,
              phone: cleanPhone
            }
          }
        });

        if (!customerRecord) {
          customerRecord = await prisma.customer.create({
            data: {
              restaurantId: restaurant.id,
              phone: cleanPhone,
              name: resolvedCustomerName,
              address: isDelivery ? (deliveryAddress || null) : null,
              pointsBalance: 0,
              lifetimePoints: 0,
              totalSpent: 0,
              totalOrders: 0
            }
          });
        }

        // If customer redeemed points, verify and deduct
        if (requestedRedeem > 0 && customerRecord.pointsBalance >= requestedRedeem) {
          pointsRedeemed = requestedRedeem;
        }
      }

      // 4. Create the order
      const tableNum = req.body.tableNumber ? String(req.body.tableNumber).trim() : null;

      const newOrder = await prisma.order.create({
        data: {
          orderNumber,
          restaurantId: restaurant.id,
          orderType: finalOrderType,
          tableNumber: tableNum,
          customerName: resolvedCustomerName,
          customerPhone: resolvedCustomerPhone,
          deliveryAddress: isDelivery ? (deliveryAddress || null) : null,
          captainId: (isDelivery && captainId) ? captainId : null,
          notes: notes || null,
          subtotal,
          deliveryFee,
          totalAmount,
          pointsEarned,
          pointsRedeemed,
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

      // Update customer balance & record point transactions
      if (customerRecord) {
        const netPointsChange = pointsEarned - pointsRedeemed;
        const updatedBalance = Math.max(0, customerRecord.pointsBalance + netPointsChange);
        const updatedLifetime = customerRecord.lifetimePoints + pointsEarned;

        await prisma.customer.update({
          where: { id: customerRecord.id },
          data: {
            name: resolvedCustomerName || customerRecord.name,
            address: (isDelivery && deliveryAddress) ? deliveryAddress : customerRecord.address,
            pointsBalance: updatedBalance,
            lifetimePoints: updatedLifetime,
            totalSpent: { increment: totalAmount },
            totalOrders: { increment: 1 }
          }
        });

        if (pointsRedeemed > 0) {
          await prisma.pointTransaction.create({
            data: {
              restaurantId: restaurant.id,
              customerId: customerRecord.id,
              orderId: newOrder.id,
              amount: -pointsRedeemed,
              type: 'REDEEMED',
              description: `استبدال مكافأة بالطلب #${orderNumber}`
            }
          });
        }

        if (pointsEarned > 0) {
          await prisma.pointTransaction.create({
            data: {
              restaurantId: restaurant.id,
              customerId: customerRecord.id,
              orderId: newOrder.id,
              amount: pointsEarned,
              type: 'EARNED',
              description: `نقاط مكتسبة من الطلب #${orderNumber} (${totalAmount} ج.م)`
            }
          });
        }
      }

      // Auto-deduct inventory based on recipes
      const deductedSummary: any[] = [];
      try {
        for (const itm of newOrder.items) {
          if (!itm.menuItemId) continue;

          const recipe = await prisma.recipe.findUnique({
            where: { productId: itm.menuItemId },
            include: {
              ingredients: {
                include: { inventoryItem: true }
              }
            }
          });

          if (recipe && recipe.ingredients && recipe.ingredients.length > 0) {
            const orderQty = Number(itm.quantity) || 1;
            for (const ing of recipe.ingredients) {
              const deduction = Number(ing.quantityUsed) * orderQty;
              if (deduction > 0 && ing.inventoryItemId) {
                const updatedItem = await prisma.inventoryItem.update({
                  where: { id: ing.inventoryItemId },
                  data: {
                    currentStock: { decrement: deduction }
                  }
                });

                deductedSummary.push({
                  ingredientName: ing.inventoryItem?.name || 'مكون',
                  unit: ing.inventoryItem?.unit || 'جرام',
                  deductedAmount: deduction,
                  remainingStock: Number(updatedItem.currentStock)
                });
              }
            }
          }
        }
      } catch (stockErr: any) {
        console.error('Failed to deduct inventory for order:', stockErr);
      }

      return res.status(201).json({
        message: 'Order created successfully! 🔥',
        order: newOrder,
        deductedInventory: deductedSummary
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
