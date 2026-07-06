import { Request, Response } from 'express';
import { InspectionService } from '../services/inspection.service';

export class InspectionController {
  /**
   * Logs a new delivery/return inspection. Scoped to gallery_id.
   */
  static async logInspection(req: Request, res: Response) {
    try {
      const { contractId, type, gasPercentage, odometerReading, mediaUrls, notes } = req.body;
      const galleryId = req.galleryId;

      if (!galleryId) {
        return res.status(400).json({ error: 'gallery_id is required to log inspections.' });
      }

      if (!contractId || !type || gasPercentage === undefined || odometerReading === undefined || !mediaUrls) {
        return res.status(400).json({ error: 'Missing required parameters for car inspection.' });
      }

      const inspection = await InspectionService.createInspection({
        galleryId,
        contractId,
        type,
        gasPercentage: Number(gasPercentage),
        odometerReading: Number(odometerReading),
        mediaUrls,
        notes
      });

      return res.status(201).json({
        message: 'Car inspection condition logged successfully.',
        inspection
      });
    } catch (error: any) {
      return res.status(400).json({
        error: 'Failed to log inspection',
        message: error.message
      });
    }
  }

  /**
   * Compare Delivery and Return inspections for a given contract ID.
   */
  static async compareInspections(req: Request, res: Response) {
    try {
      const { contractId } = req.params;
      const galleryId = req.galleryId;

      if (!galleryId) {
        return res.status(400).json({ error: 'gallery_id is required to fetch comparison reports.' });
      }

      const comparisonReport = await InspectionService.compareInspections(contractId, galleryId);
      return res.json(comparisonReport);
    } catch (error: any) {
      return res.status(500).json({
        error: 'Failed to generate inspection comparison report',
        message: error.message
      });
    }
  }
}
