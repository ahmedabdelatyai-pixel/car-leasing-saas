import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export class CarController {
  /**
   * Creates a new car. Scoped strictly under the gallery_id. Includes imageUrl.
   */
  static async createCar(req: Request, res: Response) {
    try {
      const {
        plateNumber,
        model,
        year,
        color,
        licenseStartDate,
        licenseEndDate,
        currentOdometer,
        oilChangeInterval,
        filterChangeInterval,
        imageUrl
      } = req.body;

      const galleryId = req.galleryId; // Set by enforceTenantIsolation middleware

      if (!galleryId) {
        return res.status(400).json({ error: 'gallery_id is required to register a car.' });
      }

      if (!plateNumber || !model || !year || !color || !licenseStartDate || !licenseEndDate || currentOdometer === undefined || !oilChangeInterval || !filterChangeInterval) {
        return res.status(400).json({ error: 'Missing required fields for car creation.' });
      }

      // Check if plate number already exists globally
      const existingCar = await prisma.car.findUnique({ where: { plateNumber } });
      if (existingCar) {
        return res.status(409).json({ error: `Car with plate number '${plateNumber}' already exists.` });
      }

      const car = await prisma.car.create({
        data: {
          galleryId,
          plateNumber,
          model,
          year,
          color,
          licenseStartDate: new Date(licenseStartDate),
          licenseEndDate: new Date(licenseEndDate),
          currentOdometer: Number(currentOdometer),
          oilChangeInterval: Number(oilChangeInterval),
          filterChangeInterval: Number(filterChangeInterval),
          imageUrl: imageUrl || null
        }
      });

      return res.status(201).json({ message: 'Car registered successfully', car });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to create car', message: error.message });
    }
  }

  /**
   * Retrieve all cars. Scoped under the galleryId (isolated), unless Super Admin without a scope.
   */
  static async getCars(req: Request, res: Response) {
    try {
      const galleryId = req.galleryId;

      const cars = await prisma.car.findMany({
        where: galleryId ? { galleryId } : {}
      });

      return res.json(cars);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to retrieve cars', message: error.message });
    }
  }

  /**
   * Retrieve a single car by its ID. Scoped under the galleryId.
   */
  static async getCarById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const galleryId = req.galleryId;

      const car = await prisma.car.findFirst({
        where: {
          id,
          ...(galleryId ? { galleryId } : {})
        }
      });

      if (!car) {
        return res.status(404).json({ error: 'Car not found or unauthorized access.' });
      }

      return res.json(car);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to retrieve car details', message: error.message });
    }
  }

  /**
   * Update a car's details. Scoped under the galleryId. Includes imageUrl.
   */
  static async updateCar(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const galleryId = req.galleryId;
      const {
        plateNumber,
        model,
        year,
        color,
        licenseStartDate,
        licenseEndDate,
        currentOdometer,
        oilChangeInterval,
        filterChangeInterval,
        imageUrl
      } = req.body;

      // Verify the car belongs to this gallery
      const existingCar = await prisma.car.findFirst({
        where: {
          id,
          ...(galleryId ? { galleryId } : {})
        }
      });

      if (!existingCar) {
        return res.status(404).json({ error: 'Car not found or unauthorized access.' });
      }

      const updatedCar = await prisma.car.update({
        where: { id },
        data: {
          plateNumber: plateNumber || undefined,
          model: model || undefined,
          year: year ? Number(year) : undefined,
          color: color || undefined,
          licenseStartDate: licenseStartDate ? new Date(licenseStartDate) : undefined,
          licenseEndDate: licenseEndDate ? new Date(licenseEndDate) : undefined,
          currentOdometer: currentOdometer !== undefined ? Number(currentOdometer) : undefined,
          oilChangeInterval: oilChangeInterval ? Number(oilChangeInterval) : undefined,
          filterChangeInterval: filterChangeInterval ? Number(filterChangeInterval) : undefined,
          imageUrl: imageUrl !== undefined ? imageUrl : undefined
        }
      });

      return res.json({ message: 'Car details updated successfully', car: updatedCar });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to update car details', message: error.message });
    }
  }

  /**
   * Deletes a car. Scoped under the galleryId.
   */
  static async deleteCar(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const galleryId = req.galleryId;

      // Verify ownership
      const existingCar = await prisma.car.findFirst({
        where: {
          id,
          ...(galleryId ? { galleryId } : {})
        }
      });

      if (!existingCar) {
        return res.status(404).json({ error: 'Car not found or unauthorized access.' });
      }

      await prisma.car.delete({ where: { id } });

      return res.json({ message: 'Car deleted successfully.' });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to delete car', message: error.message });
    }
  }
}
