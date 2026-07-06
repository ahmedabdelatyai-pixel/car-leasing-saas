import { Request, Response } from 'express';
import { MaintenanceService } from '../services/maintenance.service';
import prisma from '../utils/prisma';
import { Role } from '@prisma/client';

export class OdometerController {
  /**
   * Endpoint to log odometer value. Available to TENANT (Driver) and GALLERY_OWNER.
   */
  static async logOdometer(req: Request, res: Response) {
    try {
      const { contractId, carId, type, odometerValue, invoiceImageUrl } = req.body;
      const galleryId = req.galleryId;
      const user = req.user;

      if (!user || !galleryId) {
        return res.status(401).json({ error: 'Unauthorized: User or Gallery context is missing.' });
      }

      if (!contractId || !carId || !type || odometerValue === undefined) {
        return res.status(400).json({ error: 'Missing required parameters (contractId, carId, type, odometerValue).' });
      }

      // If user is a Tenant, strictly verify they are the active driver on the contract
      if (user.role === Role.TENANT) {
        const profile = await prisma.tenantProfile.findUnique({
          where: { userId: user.userId }
        });

        if (!profile) {
          return res.status(404).json({ error: 'Tenant profile not found.' });
        }

        const contract = await prisma.contract.findFirst({
          where: {
            id: contractId,
            tenantId: profile.id,
            carId,
            galleryId
          }
        });

        if (!contract) {
          return res.status(403).json({
            error: 'Access Denied',
            message: 'You are not authorized to log odometer readings for this car/contract.'
          });
        }
      }

      // Delegate to service for database transaction (save log, update car, compute alerts)
      const result = await MaintenanceService.logOdometer({
        galleryId,
        contractId,
        carId,
        type,
        odometerValue: Number(odometerValue),
        invoiceImageUrl
      });

      return res.status(201).json({
        message: 'Odometer logged and synchronized successfully.',
        data: {
          odometerLog: result.log,
          updatedOdometer: result.updatedCar.currentOdometer,
          maintenanceAlertsTriggered: result.warnings
        }
      });
    } catch (error: any) {
      return res.status(400).json({
        error: 'Odometer logging failed',
        message: error.message
      });
    }
  }

  /**
   * Run manual license expiration check.
   * Typically scheduled by cron, exposed as a Super Admin / Gallery Owner manual hook.
   */
  static async runLicenseExpirationCheck(req: Request, res: Response) {
    try {
      const alerts = await MaintenanceService.checkLicenseExpirations();
      return res.json({
        message: 'License expiry check completed successfully.',
        alertsQueuedCount: alerts.length,
        alerts
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'License check failed', message: error.message });
    }
  }

  /**
   * Fetch all maintenance alerts in the gallery.
   */
  static async getMaintenanceAlerts(req: Request, res: Response) {
    try {
      const galleryId = req.galleryId;
      const alerts = await prisma.maintenanceAlert.findMany({
        where: galleryId ? { galleryId } : {},
        include: {
          car: {
            select: {
              plateNumber: true,
              model: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(alerts);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to retrieve alerts', message: error.message });
    }
  }
}
