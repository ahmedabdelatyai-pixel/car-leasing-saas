import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export class ReportController {
  /**
   * Generates comprehensive restaurant sales & analytics report.
   */
  static async getSalesReport(req: Request, res: Response) {
    try {
      // 1. Fetch completed/delivered and all orders
      const orders = await prisma.order.findMany({
        where: {
          status: { not: 'CANCELLED' }
        },
        include: {
          items: true
        },
        orderBy: { createdAt: 'desc' }
      });

      // 2. Metrics calculation
      let totalRevenue = 0;
      let deliveryRevenue = 0;
      let takeawayRevenue = 0;
      let deliveryOrdersCount = 0;
      let takeawayOrdersCount = 0;

      const itemSalesMap = new Map<string, { name: string; quantity: number; revenue: number }>();
      const dailySalesMap = new Map<string, number>();

      for (const order of orders) {
        const orderTotal = Number(order.totalAmount);
        totalRevenue += orderTotal;

        if (order.orderType === 'DELIVERY') {
          deliveryOrdersCount++;
          deliveryRevenue += orderTotal;
        } else {
          takeawayOrdersCount++;
          takeawayRevenue += orderTotal;
        }

        // Daily revenue grouping (YYYY-MM-DD)
        const dateKey = order.createdAt.toISOString().split('T')[0];
        dailySalesMap.set(dateKey, (dailySalesMap.get(dateKey) || 0) + orderTotal);

        // Best sellers calculation
        for (const item of order.items) {
          const key = item.menuItemId;
          const current = itemSalesMap.get(key) || { name: item.name, quantity: 0, revenue: 0 };
          current.quantity += item.quantity;
          current.revenue += Number(item.totalPrice);
          itemSalesMap.set(key, current);
        }
      }

      // 3. Format Best Sellers (Sorted descending by quantity)
      const topSellingItems = Array.from(itemSalesMap.values())
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 7);

      // 4. Format Daily Sales trend for charts
      const dailyTrend = Array.from(dailySalesMap.entries())
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return res.json({
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalOrders: orders.length,
        deliveryOrdersCount,
        takeawayOrdersCount,
        deliveryRevenue: Math.round(deliveryRevenue * 100) / 100,
        takeawayRevenue: Math.round(takeawayRevenue * 100) / 100,
        averageOrderValue: orders.length > 0 ? Math.round((totalRevenue / orders.length) * 100) / 100 : 0,
        topSellingItems,
        dailyTrend
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to generate restaurant report', message: err.message });
    }
  }
}
