import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export class OverheadController {
  /**
   * Get all monthly overheads and summary metrics
   */
  static async getOverheads(req: Request, res: Response) {
    try {
      const restaurant = await prisma.restaurant.findFirst();
      if (!restaurant) {
        return res.status(404).json({ error: 'Restaurant not found' });
      }

      const overheads = await prisma.restaurantOverhead.findMany({
        where: { restaurantId: restaurant.id },
        orderBy: { monthlyAmount: 'desc' }
      });

      const totalMonthly = overheads.reduce((sum, item) => sum + Number(item.monthlyAmount), 0);
      const dailyOverhead = totalMonthly / 30;
      const averageDailyOrders = restaurant.averageDailyOrders || 80;
      const indirectCostPerOrder = averageDailyOrders > 0 ? dailyOverhead / averageDailyOrders : 0;

      return res.json({
        overheads: overheads.map(o => ({
          id: o.id,
          type: o.type,
          monthlyAmount: Number(o.monthlyAmount),
          createdAt: o.createdAt
        })),
        totalMonthlyOverheads: Number(totalMonthly.toFixed(2)),
        dailyOverhead: Number(dailyOverhead.toFixed(2)),
        averageDailyOrders,
        indirectCostPerOrder: Number(indirectCostPerOrder.toFixed(2)),
        summary: {
          totalMonthlyOverheads: Number(totalMonthly.toFixed(2)),
          dailyOverhead: Number(dailyOverhead.toFixed(2)),
          averageDailyOrders,
          indirectCostPerOrder: Number(indirectCostPerOrder.toFixed(2))
        }
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to fetch overheads', message: err.message });
    }
  }

  /**
   * Add a monthly overhead expense
   */
  static async createOverhead(req: Request, res: Response) {
    try {
      const { type, monthlyAmount } = req.body;

      if (!type || monthlyAmount === undefined) {
        return res.status(400).json({ error: 'نوع المصروف وقيمته الشهرية مطلوبان.' });
      }

      const restaurant = await prisma.restaurant.findFirst();
      if (!restaurant) {
        return res.status(404).json({ error: 'Restaurant not found' });
      }

      const newOverhead = await prisma.restaurantOverhead.create({
        data: {
          restaurantId: restaurant.id,
          type: type.trim(),
          monthlyAmount: Number(monthlyAmount)
        }
      });

      return res.status(201).json({
        message: 'تم إضافة بند المصروف بنجاح 💡✅',
        overhead: newOverhead
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to create overhead', message: err.message });
    }
  }

  /**
   * Update overhead
   */
  static async updateOverhead(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { type, monthlyAmount } = req.body;

      const updated = await prisma.restaurantOverhead.update({
        where: { id },
        data: {
          type: type ? type.trim() : undefined,
          monthlyAmount: monthlyAmount !== undefined ? Number(monthlyAmount) : undefined
        }
      });

      return res.json({
        message: 'تم تعديل بند المصروف بنجاح ✅',
        overhead: updated
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to update overhead', message: err.message });
    }
  }

  /**
   * Delete overhead
   */
  static async deleteOverhead(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.restaurantOverhead.delete({ where: { id } });
      return res.json({ message: 'تم حذف بند المصروف بنجاح 🗑️' });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to delete overhead', message: err.message });
    }
  }

  /**
   * Update average daily orders
   */
  static async updateDailyOrdersEstimate(req: Request, res: Response) {
    try {
      const { averageDailyOrders } = req.body;
      const orders = Number(averageDailyOrders);

      if (isNaN(orders) || orders <= 0) {
        return res.status(400).json({ error: 'متوسط الأوردرات اليومية يجب أن يكون رقماً أكبر من صفر.' });
      }

      const restaurant = await prisma.restaurant.findFirst();
      if (!restaurant) {
        return res.status(404).json({ error: 'Restaurant not found' });
      }

      const updated = await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { averageDailyOrders: orders }
      });

      return res.json({
        message: 'تم تحديث متوسط الأوردرات اليومية بنجاح 🎯',
        averageDailyOrders: updated.averageDailyOrders
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to update daily orders estimate', message: err.message });
    }
  }
}
