import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export class ReportController {
  /**
   * Helper to get restaurant ID
   */
  private static async getRestaurantId(): Promise<string> {
    const rest = await prisma.restaurant.findFirst({ select: { id: true } });
    if (!rest) {
      const created = await prisma.restaurant.create({
        data: { name: 'مطعم ضجة' }
      });
      return created.id;
    }
    return rest.id;
  }

  /**
   * Get Current Open Day / Active Shift Summary (orders where closureId is null).
   */
  static async getCurrentShiftSummary(req: Request, res: Response) {
    try {
      const restaurantId = await ReportController.getRestaurantId();

      const orders = await prisma.order.findMany({
        where: {
          restaurantId,
          closureId: null,
          status: { not: 'CANCELLED' }
        },
        include: {
          items: {
            include: {
              menuItem: {
                include: {
                  recipe: {
                    include: {
                      ingredients: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      let totalRevenue = 0;
      let totalFoodCost = 0;
      let deliveryRevenue = 0;
      let takeawayRevenue = 0;
      let deliveryCount = 0;
      let takeawayCount = 0;

      for (const ord of orders) {
        const val = Number(ord.totalAmount);
        totalRevenue += val;
        if (ord.orderType === 'DELIVERY') {
          deliveryCount++;
          deliveryRevenue += val;
        } else {
          takeawayCount++;
          takeawayRevenue += val;
        }

        for (const itm of ord.items) {
          const recipe = itm.menuItem?.recipe;
          if (recipe && recipe.ingredients) {
            const unitCost = recipe.ingredients.reduce((acc, ing) => acc + (Number(ing.cost) || 0), 0);
            totalFoodCost += (unitCost * itm.quantity);
          }
        }
      }

      const grossProfit = Math.max(0, totalRevenue - totalFoodCost);
      const grossMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
      const openedAt = orders.length > 0 ? orders[0].createdAt : new Date();

      return res.json({
        hasActiveShift: orders.length > 0,
        orderCount: orders.length,
        totalSales: Math.round(totalRevenue * 100) / 100,
        totalFoodCost: Math.round(totalFoodCost * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        profitMargin: Math.round(grossMarginPercent * 10) / 10,
        deliverySales: Math.round(deliveryRevenue * 100) / 100,
        takeawaySales: Math.round(takeawayRevenue * 100) / 100,
        deliveryCount,
        takeawayCount,
        openedAt,
        latestOrderAt: orders.length > 0 ? orders[orders.length - 1].createdAt : null,
        recentOrders: orders.slice(-10).reverse()
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'فشل جلب ملخص الوردية الحالية', message: err.message });
    }
  }

  /**
   * Close Current Day / Shift (End of Day Settlement / Z-Report).
   */
  static async closeDay(req: Request, res: Response) {
    try {
      const restaurantId = await ReportController.getRestaurantId();
      const userPayload = (req as any).user;
      const { notes } = req.body;

      // Find all unclosed active orders
      const orders = await prisma.order.findMany({
        where: {
          restaurantId,
          closureId: null,
          status: { not: 'CANCELLED' }
        },
        include: {
          items: true
        },
        orderBy: { createdAt: 'asc' }
      });

      if (orders.length === 0) {
        return res.status(400).json({ error: 'لا توجد طلبات مفتوحة لليوم الحالي لإغلاقها.' });
      }

      let totalRevenue = 0;
      let deliveryRevenue = 0;
      let takeawayRevenue = 0;
      let deliveryCount = 0;
      let takeawayCount = 0;

      const itemSalesMap = new Map<string, { name: string; quantity: number; revenue: number }>();

      for (const ord of orders) {
        const val = Number(ord.totalAmount);
        totalRevenue += val;
        if (ord.orderType === 'DELIVERY') {
          deliveryCount++;
          deliveryRevenue += val;
        } else {
          takeawayCount++;
          takeawayRevenue += val;
        }

        for (const it of ord.items) {
          const cur = itemSalesMap.get(it.name) || { name: it.name, quantity: 0, revenue: 0 };
          cur.quantity += it.quantity;
          cur.revenue += Number(it.totalPrice);
          itemSalesMap.set(it.name, cur);
        }
      }

      const itemsBreakdown = Array.from(itemSalesMap.values()).sort((a, b) => b.quantity - a.quantity);
      const openedAt = orders[0].createdAt;
      const closedAt = new Date();
      const closedBy = userPayload?.fullName || userPayload?.email || 'الإدارة';

      // Create Daily Closure record & link orders in a transaction
      const closure = await prisma.$transaction(async (tx) => {
        const createdClosure = await tx.dailyClosure.create({
          data: {
            restaurantId,
            closureDate: new Date(),
            openedAt,
            closedAt,
            totalSales: totalRevenue,
            orderCount: orders.length,
            deliverySales: deliveryRevenue,
            takeawaySales: takeawayRevenue,
            deliveryCount,
            takeawayCount,
            itemsBreakdown: itemsBreakdown as any,
            closedBy,
            notes: notes || null
          }
        });

        const orderIds = orders.map(o => o.id);
        await tx.order.updateMany({
          where: { id: { in: orderIds } },
          data: { closureId: createdClosure.id }
        });

        return createdClosure;
      });

      return res.status(201).json({
        message: 'تم إغلاق اليوم المالي بنجاح 🔒 وتصفير الوردية الحالية!',
        closure
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'فشل إغلاق اليوم المالي', message: err.message });
    }
  }

  /**
   * Get archive of all past daily closures.
   */
  static async getDailyClosures(req: Request, res: Response) {
    try {
      const restaurantId = await ReportController.getRestaurantId();

      const closures = await prisma.dailyClosure.findMany({
        where: { restaurantId },
        orderBy: { closedAt: 'desc' }
      });

      return res.json(closures);
    } catch (err: any) {
      return res.status(500).json({ error: 'فشل جلب أرشيف الأيام المغلقة', message: err.message });
    }
  }

  /**
   * Get details of a single past closure with its full orders.
   */
  static async getClosureDetails(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const closure = await prisma.dailyClosure.findUnique({
        where: { id },
        include: {
          orders: {
            include: {
              items: true,
              captain: true
            },
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!closure) {
        return res.status(404).json({ error: 'سجل إغلاق اليوم غير موجود' });
      }

      return res.json(closure);
    } catch (err: any) {
      return res.status(500).json({ error: 'فشل جلب تفاصيل إغلاق اليوم', message: err.message });
    }
  }

  /**
   * Comprehensive custom date range or monthly report.
   */
  static async getPeriodReport(req: Request, res: Response) {
    try {
      const restaurantId = await ReportController.getRestaurantId();
      const { from, to, type } = req.query;

      const where: any = {
        restaurantId,
        status: { not: 'CANCELLED' }
      };

      if (type && type !== 'ALL') {
        where.orderType = type;
      }

      // Date filtering
      if (from || to) {
        where.createdAt = {};
        if (from) {
          const fromDate = new Date(`${from}T00:00:00.000Z`);
          where.createdAt.gte = fromDate;
        }
        if (to) {
          const toDate = new Date(`${to}T23:59:59.999Z`);
          where.createdAt.lte = toDate;
        }
      }

      const orders = await prisma.order.findMany({
        where,
        include: {
          items: {
            include: {
              menuItem: {
                include: {
                  category: true,
                  recipe: {
                    include: {
                      ingredients: true
                    }
                  }
                }
              }
            }
          },
          captain: true
        },
        orderBy: { createdAt: 'desc' }
      });

      let totalRevenue = 0;
      let totalFoodCost = 0;
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
        cost: number;
        ordersCount: number;
      }>();
      const dailySalesMap = new Map<string, { date: string; amount: number; count: number }>();

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
        const dayStat = dailySalesMap.get(dateKey) || { date: dateKey, amount: 0, count: 0 };
        dayStat.amount += orderTotal;
        dayStat.count += 1;
        dailySalesMap.set(dateKey, dayStat);

        // Best sellers & item sales calculation
        for (const item of order.items) {
          const key = item.menuItemId || item.name;
          const catName = item.menuItem?.category?.name || 'وجبات عامة';
          const recipe = item.menuItem?.recipe;
          const unitCost = recipe && recipe.ingredients 
            ? recipe.ingredients.reduce((acc, ing) => acc + (Number(ing.cost) || 0), 0)
            : 0;
          const lineCost = unitCost * item.quantity;
          totalFoodCost += lineCost;

          const current = itemSalesMap.get(key) || { 
            id: key, 
            name: item.name, 
            categoryName: catName,
            unitPrice: Number(item.unitPrice),
            quantity: 0, 
            revenue: 0,
            cost: 0,
            ordersCount: 0 
          };
          current.quantity += item.quantity;
          current.revenue += Number(item.totalPrice);
          current.cost += lineCost;
          current.ordersCount += 1;
          itemSalesMap.set(key, current);
        }
      }

      const itemsReport = Array.from(itemSalesMap.values())
        .map(item => {
          const rev = Math.round(item.revenue * 100) / 100;
          const cst = Math.round(item.cost * 100) / 100;
          const profit = Math.round((rev - cst) * 100) / 100;
          const margin = rev > 0 ? Math.round((profit / rev) * 1000) / 10 : 0;
          return {
            ...item,
            revenue: rev,
            cost: cst,
            netProfit: profit,
            profitMargin: margin,
            percentageOfSales: totalRevenue > 0 ? Math.round((rev / totalRevenue) * 1000) / 10 : 0
          };
        })
        .sort((a, b) => b.quantity - a.quantity);

      const topSellingItems = itemsReport.slice(0, 5);
      const grossProfit = Math.max(0, totalRevenue - totalFoodCost);
      const grossMarginPercent = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0;

      const dailyTrend = Array.from(dailySalesMap.values())
        .map(d => ({ ...d, amount: Math.round(d.amount * 100) / 100 }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return res.json({
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalFoodCost: Math.round(totalFoodCost * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        grossMarginPercent,
        totalOrders: orders.length,
        deliveryOrdersCount,
        takeawayOrdersCount,
        deliveryRevenue: Math.round(deliveryRevenue * 100) / 100,
        takeawayRevenue: Math.round(takeawayRevenue * 100) / 100,
        averageOrderValue: orders.length > 0 ? Math.round((totalRevenue / orders.length) * 100) / 100 : 0,
        topSellingItems,
        itemsReport,
        dailyTrend,
        orders: orders.map(o => ({
          id: o.id,
          orderNumber: o.orderNumber,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          orderType: o.orderType,
          totalAmount: Number(o.totalAmount),
          status: o.status,
          createdAt: o.createdAt
        }))
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'فشل استخراج تقرير الفترة', message: err.message });
    }
  }

  /**
   * Generates comprehensive restaurant sales & item analytics report (legacy route).
   */
  static async getSalesReport(req: Request, res: Response) {
    return ReportController.getPeriodReport(req, res);
  }
}

