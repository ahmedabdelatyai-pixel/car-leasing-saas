import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export class ReportController {
  /**
   * Generates comprehensive restaurant sales & item analytics report.
   */
  static async getSalesReport(req: Request, res: Response) {
    try {
      // 1. Fetch completed/active orders (excluding cancelled)
      const orders = await prisma.order.findMany({
        where: {
          status: { not: 'CANCELLED' }
        },
        include: {
          items: {
            include: {
              menuItem: {
                include: {
                  category: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // 2. Metrics calculation
      let totalRevenue = 0;
      let deliveryRevenue = 0;
      let takeawayRevenue = 0;
      let deliveryOrdersCount = 0;
      let takeawayOrdersCount = 0;

      const itemSalesMap = new Map<string, { 
        id: string; 
        name: string; 
        categoryName: string;
        unitPrice: number;
        quantity: number; 
        revenue: number;
        ordersCount: number;
      }>();
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

        // Best sellers & item sales calculation
        for (const item of order.items) {
          const key = item.menuItemId || item.name;
          const catName = item.menuItem?.category?.name || 'وجبات عامة';
          const current = itemSalesMap.get(key) || { 
            id: key, 
            name: item.name, 
            categoryName: catName,
            unitPrice: Number(item.unitPrice),
            quantity: 0, 
            revenue: 0,
            ordersCount: 0 
          };
          current.quantity += item.quantity;
          current.revenue += Number(item.totalPrice);
          current.ordersCount += 1;
          itemSalesMap.set(key, current);
        }
      }

      // 3. Format full item sales report with percentage of total sales
      const itemsReport = Array.from(itemSalesMap.values())
        .map(item => ({
          ...item,
          revenue: Math.round(item.revenue * 100) / 100,
          percentageOfSales: totalRevenue > 0 ? Math.round((item.revenue / totalRevenue) * 1000) / 10 : 0
        }))
        .sort((a, b) => b.quantity - a.quantity);

      // Quick Top Sellers
      const topSellingItems = itemsReport.slice(0, 5);

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
        itemsReport,
        dailyTrend
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to generate restaurant report', message: err.message });
    }
  }
}
