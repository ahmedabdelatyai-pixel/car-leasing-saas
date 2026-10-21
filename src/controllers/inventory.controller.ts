import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export class InventoryController {
  /**
   * Get all inventory items with stock health status
   */
  static async getInventory(req: Request, res: Response) {
    try {
      const restaurant = await prisma.restaurant.findFirst();
      if (!restaurant) {
        return res.status(404).json({ error: 'Restaurant not found' });
      }

      const items = await prisma.inventoryItem.findMany({
        where: { restaurantId: restaurant.id },
        orderBy: { name: 'asc' }
      });

      let totalInventoryValue = 0;
      let lowStockCount = 0;

      const formatted = items.map(item => {
        const qtyPurchased = Number(item.totalQuantityPurchased) || 0;
        const totalPaid = Number(item.totalPricePaid) || 0;
        const currentStock = Number(item.currentStock) || 0;
        const minAlert = Number(item.minStockAlert) || 10;
        const unitPrice = Number(item.pricePerUnit) || (qtyPurchased > 0 ? totalPaid / qtyPurchased : 0);
        const itemStockValue = currentStock * unitPrice;
        totalInventoryValue += itemStockValue;

        const isLowStock = currentStock <= minAlert;
        if (isLowStock) lowStockCount++;

        return {
          id: item.id,
          name: item.name,
          unit: item.unit,
          totalQuantityPurchased: qtyPurchased,
          totalPricePaid: totalPaid,
          pricePerUnit: Number(unitPrice.toFixed(4)),
          currentStock: currentStock,
          minStockAlert: minAlert,
          isLowStock,
          stockValue: Number(itemStockValue.toFixed(2)),
          updatedAt: item.updatedAt
        };
      });

      return res.json({
        items: formatted,
        summary: {
          totalItems: items.length,
          totalInventoryValue: Number(totalInventoryValue.toFixed(2)),
          lowStockCount
        }
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to fetch inventory', message: err.message });
    }
  }

  /**
   * Create a new inventory item
   */
  static async createInventoryItem(req: Request, res: Response) {
    try {
      const { name, unit, totalQuantityPurchased, totalPricePaid, currentStock, minStockAlert } = req.body;

      if (!name || !unit) {
        return res.status(400).json({ error: 'Name and unit are required.' });
      }

      const restaurant = await prisma.restaurant.findFirst();
      if (!restaurant) {
        return res.status(404).json({ error: 'Restaurant not found' });
      }

      const qty = Number(totalQuantityPurchased) || 0;
      const totalPaid = Number(totalPricePaid) || 0;
      const pricePerUnit = qty > 0 ? totalPaid / qty : 0;
      const stock = currentStock !== undefined ? Number(currentStock) : qty;
      const minAlert = minStockAlert !== undefined ? Number(minStockAlert) : 10;

      const newItem = await prisma.inventoryItem.create({
        data: {
          restaurantId: restaurant.id,
          name: name.trim(),
          unit: unit.trim(),
          totalQuantityPurchased: qty,
          totalPricePaid: totalPaid,
          pricePerUnit,
          currentStock: stock,
          minStockAlert: minAlert
        }
      });

      return res.status(201).json({
        message: 'تم إضافة الصنف للمخزون بنجاح ✅',
        item: newItem
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to create inventory item', message: err.message });
    }
  }

  /**
   * Restock an item (purchased new batch)
   */
  static async restockItem(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { addedQuantity, additionalPricePaid } = req.body;

      const addQty = Number(addedQuantity);
      const addPaid = Number(additionalPricePaid);

      if (isNaN(addQty) || addQty <= 0) {
        return res.status(400).json({ error: 'الكمية المضافة يجب أن تكون أكبر من صفر.' });
      }

      const item = await prisma.inventoryItem.findUnique({ where: { id } });
      if (!item) {
        return res.status(404).json({ error: 'الصنف غير موجود بالمخزون.' });
      }

      const newTotalQty = Number(item.totalQuantityPurchased) + addQty;
      const newTotalPaid = Number(item.totalPricePaid) + (isNaN(addPaid) ? 0 : addPaid);
      const newPricePerUnit = newTotalQty > 0 ? newTotalPaid / newTotalQty : Number(item.pricePerUnit);
      const newCurrentStock = Number(item.currentStock) + addQty;

      const updated = await prisma.inventoryItem.update({
        where: { id },
        data: {
          totalQuantityPurchased: newTotalQty,
          totalPricePaid: newTotalPaid,
          pricePerUnit: newPricePerUnit,
          currentStock: newCurrentStock
        }
      });

      return res.json({
        message: 'تم تسجيل التوريد وزيادة المخزون بنجاح 📦✅',
        item: updated
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to restock item', message: err.message });
    }
  }

  /**
   * Update item
   */
  static async updateInventoryItem(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, unit, totalQuantityPurchased, totalPricePaid, currentStock, minStockAlert } = req.body;

      const existing = await prisma.inventoryItem.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: 'الصنف غير موجود بالمخزون.' });
      }

      const qty = totalQuantityPurchased !== undefined ? Number(totalQuantityPurchased) : Number(existing.totalQuantityPurchased);
      const totalPaid = totalPricePaid !== undefined ? Number(totalPricePaid) : Number(existing.totalPricePaid);
      const pricePerUnit = qty > 0 ? totalPaid / qty : Number(existing.pricePerUnit);
      const stock = currentStock !== undefined ? Number(currentStock) : Number(existing.currentStock);
      const minAlert = minStockAlert !== undefined ? Number(minStockAlert) : Number(existing.minStockAlert);

      const updated = await prisma.inventoryItem.update({
        where: { id },
        data: {
          name: name ? name.trim() : existing.name,
          unit: unit ? unit.trim() : existing.unit,
          totalQuantityPurchased: qty,
          totalPricePaid: totalPaid,
          pricePerUnit,
          currentStock: stock,
          minStockAlert: minAlert
        }
      });

      return res.json({
        message: 'تم تحديث بيانات الصنف بنجاح ✅',
        item: updated
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to update item', message: err.message });
    }
  }

  /**
   * Delete item
   */
  static async deleteInventoryItem(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.inventoryItem.delete({ where: { id } });
      return res.json({ message: 'تم حذف الصنف من المخزون بنجاح 🗑️' });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to delete item', message: err.message });
    }
  }
}
