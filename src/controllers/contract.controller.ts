import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { Role } from '@prisma/client';

export class ContractController {
  /**
   * Create a lease contract. Only available to Super Admins and Gallery Owners. Includes documentUrl.
   */
  static async createContract(req: Request, res: Response) {
    try {
      const { carId, tenantId, rentalValue, startDate, endDate, allowedMonthlyKm, status, documentUrl } = req.body;
      const galleryId = req.galleryId;

      if (!galleryId) {
        return res.status(400).json({ error: 'gallery_id is required to create a lease contract.' });
      }

      if (!carId || !tenantId || rentalValue === undefined || !startDate || !endDate || allowedMonthlyKm === undefined) {
        return res.status(400).json({ error: 'Missing required contract parameters.' });
      }

      // Verify car belongs to this gallery
      const car = await prisma.car.findFirst({ where: { id: carId, galleryId } });
      if (!car) {
        return res.status(400).json({ error: 'Car not found or does not belong to this gallery.' });
      }

      // Verify tenant profile belongs to this gallery
      const tenant = await prisma.tenantProfile.findFirst({ where: { id: tenantId, galleryId } });
      if (!tenant) {
        return res.status(400).json({ error: 'Tenant profile not found or does not belong to this gallery.' });
      }

      const contract = await prisma.contract.create({
        data: {
          galleryId,
          carId,
          tenantId,
          rentalValue: Number(rentalValue),
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          allowedMonthlyKm: Number(allowedMonthlyKm),
          status: status || undefined,
          documentUrl: documentUrl || null
        }
      });

      return res.status(201).json({ message: 'Contract created successfully', contract });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to create contract', message: error.message });
    }
  }

  /**
   * Retrieves list of contracts.
   * If user is a TENANT:
   * - Retrieves ONLY contracts linked to their own profile.
   * - Removes the `rentalValue` field (data isolation/privacy).
   */
  static async getContracts(req: Request, res: Response) {
    try {
      const user = req.user;
      const galleryId = req.galleryId;

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (user.role === Role.TENANT) {
        // Find driver's profile first
        const profile = await prisma.tenantProfile.findUnique({
          where: { userId: user.userId }
        });

        if (!profile) {
          return res.status(404).json({ error: 'Tenant profile not found.' });
        }

        const contracts = await prisma.contract.findMany({
          where: {
            tenantId: profile.id,
            galleryId: profile.galleryId
          },
          include: {
            car: {
              select: {
                plateNumber: true,
                model: true,
                year: true,
                color: true
              }
            }
          }
        });

        // Strip rental value
        const sanitizedContracts = contracts.map((c) => {
          const { rentalValue, ...rest } = c;
          return rest;
        });

        return res.json(sanitizedContracts);
      }

      // For gallery owners and super admins, retrieve all contracts in the gallery scope
      const contracts = await prisma.contract.findMany({
        where: galleryId ? { galleryId } : {},
        include: {
          car: true,
          tenant: true
        }
      });

      return res.json(contracts);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to retrieve contracts', message: error.message });
    }
  }

  /**
   * Retrieves a single contract by ID.
   * Strips out `rentalValue` if requested by a TENANT.
   */
  static async getContractById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user;
      const galleryId = req.galleryId;

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const contract = await prisma.contract.findFirst({
        where: {
          id,
          ...(galleryId ? { galleryId } : {})
        },
        include: {
          car: true,
          tenant: true
        }
      });

      if (!contract) {
        return res.status(404).json({ error: 'Contract not found or unauthorized.' });
      }

      // Enforce data access safety for TENANT role
      if (user.role === Role.TENANT) {
        const profile = await prisma.tenantProfile.findUnique({
          where: { userId: user.userId }
        });

        if (!profile || contract.tenantId !== profile.id) {
          return res.status(403).json({ error: 'Access denied: You are not authorized to view this contract.' });
        }

        // Strip rentalValue
        const { rentalValue, ...sanitizedContract } = contract;
        return res.json(sanitizedContract);
      }

      return res.json(contract);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to retrieve contract', message: error.message });
    }
  }

  /**
   * Update a contract. Only available to Super Admins and Gallery Owners. Includes documentUrl.
   */
  static async updateContract(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const galleryId = req.galleryId;
      const { carId, tenantId, rentalValue, startDate, endDate, allowedMonthlyKm, status, documentUrl } = req.body;

      const contract = await prisma.contract.findFirst({
        where: {
          id,
          ...(galleryId ? { galleryId } : {})
        }
      });

      if (!contract) {
        return res.status(404).json({ error: 'Contract not found or unauthorized.' });
      }

      const updatedContract = await prisma.contract.update({
        where: { id },
        data: {
          carId: carId || undefined,
          tenantId: tenantId || undefined,
          rentalValue: rentalValue !== undefined ? Number(rentalValue) : undefined,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          allowedMonthlyKm: allowedMonthlyKm !== undefined ? Number(allowedMonthlyKm) : undefined,
          status: status || undefined,
          documentUrl: documentUrl !== undefined ? documentUrl : undefined
        }
      });

      return res.json({ message: 'Contract updated successfully', contract: updatedContract });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to update contract', message: error.message });
    }
  }

  /**
   * Delete a contract. Only available to Super Admins and Gallery Owners.
   */
  static async deleteContract(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const galleryId = req.galleryId;

      const contract = await prisma.contract.findFirst({
        where: {
          id,
          ...(galleryId ? { galleryId } : {})
        }
      });

      if (!contract) {
        return res.status(404).json({ error: 'Contract not found or unauthorized.' });
      }

      await prisma.contract.delete({ where: { id } });

      return res.json({ message: 'Contract deleted successfully.' });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to delete contract', message: error.message });
    }
  }
}
