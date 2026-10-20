import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export class CaptainController {
  /**
   * List all delivery captains.
   */
  static async getCaptains(req: Request, res: Response) {
    try {
      const captains = await prisma.captain.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          orders: {
            where: { status: 'ON_THE_WAY' }
          }
        }
      });
      return res.json(captains);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to fetch captains', message: err.message });
    }
  }

  /**
   * Register a new delivery captain.
   */
  static async createCaptain(req: Request, res: Response) {
    try {
      const restaurant = await prisma.restaurant.findFirst();
      if (!restaurant) {
        return res.status(500).json({ error: 'Restaurant record not found.' });
      }

      const { name, phone, vehicleType } = req.body;
      if (!name || !phone) {
        return res.status(400).json({ error: 'Name and phone are required for captain.' });
      }

      const captain = await prisma.captain.create({
        data: {
          restaurantId: restaurant.id,
          name,
          phone,
          vehicleType: vehicleType || 'موتوسيكل'
        }
      });

      return res.status(201).json(captain);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to create captain', message: err.message });
    }
  }

  /**
   * Update captain details or status.
   */
  static async updateCaptain(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, phone, vehicleType, isActive } = req.body;

      const updated = await prisma.captain.update({
        where: { id },
        data: {
          name: name || undefined,
          phone: phone || undefined,
          vehicleType: vehicleType !== undefined ? vehicleType : undefined,
          isActive: isActive !== undefined ? Boolean(isActive) : undefined
        }
      });

      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to update captain', message: err.message });
    }
  }

  /**
   * Delete captain.
   */
  static async deleteCaptain(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.captain.delete({ where: { id } });
      return res.json({ message: 'Captain deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to delete captain', message: err.message });
    }
  }
}
