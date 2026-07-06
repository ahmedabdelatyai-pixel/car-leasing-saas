import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { Role, MaintenanceRequestStatus } from '@prisma/client';

export class MaintenanceRequestController {
  /**
   * Submit a new maintenance request from the Tenant (Driver).
   */
  static async createRequest(req: Request, res: Response) {
    try {
      const { issue } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized user context.' });
      }

      if (!issue) {
        return res.status(400).json({ error: 'The maintenance issue description is required.' });
      }

      // 1. Resolve Tenant Profile
      const tenantProfile = await prisma.tenantProfile.findUnique({
        where: { userId }
      });

      if (!tenantProfile) {
        return res.status(404).json({ error: 'Driver profile not found.' });
      }

      // 2. Resolve Active Rental Contract to bind Car and Gallery
      const activeContract = await prisma.contract.findFirst({
        where: {
          tenantId: tenantProfile.id,
          status: 'ACTIVE'
        }
      });

      if (!activeContract) {
        return res.status(400).json({ error: 'You do not have any active lease contract to submit requests for.' });
      }

      // 3. Create maintenance request record
      const maintenanceRequest = await prisma.maintenanceRequest.create({
        data: {
          galleryId: activeContract.galleryId,
          carId: activeContract.carId,
          tenantId: tenantProfile.id,
          issue
        }
      });

      return res.status(201).json({
        message: 'Maintenance request submitted successfully.',
        data: maintenanceRequest
      });

    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to create maintenance request', message: error.message });
    }
  }

  /**
   * Retrieve list of maintenance requests scoped by user role.
   */
  static async getRequests(req: Request, res: Response) {
    try {
      const { role, userId } = req.user!;
      const galleryId = req.galleryId;

      if (role === Role.TENANT) {
        // Resolve tenant profile
        const tenantProfile = await prisma.tenantProfile.findUnique({
          where: { userId }
        });

        if (!tenantProfile) {
          return res.status(404).json({ error: 'Driver profile not found.' });
        }

        // Get requests submitted by this tenant
        const requests = await prisma.maintenanceRequest.findMany({
          where: { tenantId: tenantProfile.id },
          include: {
            car: {
              select: { model: true, plateNumber: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        });

        return res.json(requests);
      }

      // For Gallery Owners & Super Admins (enforceTenantIsolation scoped)
      const requests = await prisma.maintenanceRequest.findMany({
        where: galleryId ? { galleryId } : {},
        include: {
          car: {
            select: { model: true, plateNumber: true }
          },
          tenant: {
            select: { fullName: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json(requests);

    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to retrieve maintenance requests', message: error.message });
    }
  }

  /**
   * Respond to a maintenance request. Restricted to GALLERY_OWNER / SUPER_ADMIN.
   */
  static async respondToRequest(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, response } = req.body;
      const galleryId = req.galleryId;

      if (!status || !Object.values(MaintenanceRequestStatus).includes(status)) {
        return res.status(400).json({ error: 'A valid status (PENDING, APPROVED, REJECTED, COMPLETED) is required.' });
      }

      // Verify request existence under gallery scope
      const maintenanceRequest = await prisma.maintenanceRequest.findFirst({
        where: {
          id,
          ...(galleryId ? { galleryId } : {})
        }
      });

      if (!maintenanceRequest) {
        return res.status(404).json({ error: 'Maintenance request not found or unauthorized.' });
      }

      const updatedRequest = await prisma.maintenanceRequest.update({
        where: { id },
        data: {
          status,
          response: response || null
        }
      });

      return res.json({
        message: 'Maintenance request updated successfully.',
        data: updatedRequest
      });

    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to update maintenance request response', message: error.message });
    }
  }
}
