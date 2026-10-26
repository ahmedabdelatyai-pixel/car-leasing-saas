import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export class ExpenseController {
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
   * Get all expenses in the current active shift (unclosed shift: closureId is null).
   */
  static async getCurrentShiftExpenses(req: Request, res: Response) {
    try {
      const restaurantId = await ExpenseController.getRestaurantId();

      const expenses = await prisma.expense.findMany({
        where: {
          restaurantId,
          closureId: null
        },
        orderBy: { createdAt: 'desc' }
      });

      const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

      // Also get current opening drawer float
      const rest = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { openingDrawerFloat: true }
      });

      return res.json({
        expenses,
        count: expenses.length,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        openingDrawerFloat: Number(rest?.openingDrawerFloat || 0)
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'فشل جلب مصاريف الوردية الحالية', message: err.message });
    }
  }

  /**
   * Record a new expense / petty cash payout in the current active shift.
   */
  static async createExpense(req: Request, res: Response) {
    try {
      const restaurantId = await ExpenseController.getRestaurantId();
      const userPayload = (req as any).user;
      const { amount, category, description, paidTo } = req.body;

      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ error: 'يرجى إدخال مبلغ صحيح أكبر من الصفر' });
      }

      const created = await prisma.expense.create({
        data: {
          restaurantId,
          closureId: null, // Active shift
          amount: numAmount,
          category: category?.trim() || 'نثريات ومستهلكات',
          description: description?.trim() || null,
          paidTo: paidTo?.trim() || null,
          createdBy: userPayload?.fullName || userPayload?.email || 'الكاشير'
        }
      });

      return res.status(201).json({
        message: 'تم تسجيل المصروف بنجاح 💸',
        expense: created
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'فشل تسجيل المصروف', message: err.message });
    }
  }

  /**
   * Update an existing expense in the active shift.
   */
  static async updateExpense(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { amount, category, description, paidTo } = req.body;

      const existing = await prisma.expense.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: 'سجل المصروف غير موجود' });
      }

      if (existing.closureId) {
        return res.status(400).json({ error: 'لا يمكن تعديل مصروف تم إغلاقه وأرشفته في وردية سابقة' });
      }

      const numAmount = amount !== undefined ? Number(amount) : Number(existing.amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ error: 'يرجى إدخال مبلغ صحيح أكبر من الصفر' });
      }

      const updated = await prisma.expense.update({
        where: { id },
        data: {
          amount: numAmount,
          category: category !== undefined ? category.trim() : existing.category,
          description: description !== undefined ? description.trim() : existing.description,
          paidTo: paidTo !== undefined ? paidTo.trim() : existing.paidTo
        }
      });

      return res.json({
        message: 'تم تعديل المصروف بنجاح ✅',
        expense: updated
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'فشل تعديل المصروف', message: err.message });
    }
  }

  /**
   * Delete an expense from the active shift.
   */
  static async deleteExpense(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const existing = await prisma.expense.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: 'سجل المصروف غير موجود' });
      }

      if (existing.closureId) {
        return res.status(400).json({ error: 'لا يمكن حذف مصروف تم إغلاقه وأرشفته في وردية سابقة' });
      }

      await prisma.expense.delete({ where: { id } });

      return res.json({ message: 'تم حذف المصروف بنجاح 🗑️' });
    } catch (err: any) {
      return res.status(500).json({ error: 'فشل حذف المصروف', message: err.message });
    }
  }

  /**
   * Update the default opening drawer float (الفكة / رصيد بداية الدرج).
   */
  static async updateOpeningDrawer(req: Request, res: Response) {
    try {
      const restaurantId = await ExpenseController.getRestaurantId();
      const { openingDrawerFloat } = req.body;

      const numVal = Number(openingDrawerFloat);
      if (isNaN(numVal) || numVal < 0) {
        return res.status(400).json({ error: 'يرجى إدخال قيمة صحيحة لرصيد الدرج' });
      }

      const updated = await prisma.restaurant.update({
        where: { id: restaurantId },
        data: { openingDrawerFloat: numVal },
        select: { openingDrawerFloat: true }
      });

      return res.json({
        message: 'تم تحديث رصيد بداية الدرج (الفكة) بنجاح 💰',
        openingDrawerFloat: Number(updated.openingDrawerFloat)
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'فشل تحديث رصيد الدرج', message: err.message });
    }
  }
}
