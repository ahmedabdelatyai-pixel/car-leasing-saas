import prisma from '../utils/prisma';
import { InspectionType } from '@prisma/client';

export class InspectionService {
  /**
   * Log Car Condition at Delivery (Start of contract) or Return (End of contract).
   */
  static async createInspection(params: {
    galleryId: string;
    contractId: string;
    type: InspectionType;
    gasPercentage: number;
    odometerReading: number;
    mediaUrls: string[];
    notes?: string;
  }) {
    const { galleryId, contractId, type, gasPercentage, odometerReading, mediaUrls, notes } = params;

    // Verify contract exists and belongs to this gallery
    const contract = await prisma.contract.findFirst({
      where: { id: contractId, galleryId }
    });

    if (!contract) {
      throw new Error('Contract not found or unauthorized gallery access.');
    }

    // Ensure we do not log duplicate inspection types for the same contract
    const existingInspection = await prisma.carInspection.findFirst({
      where: { contractId, type }
    });

    if (existingInspection) {
      throw new Error(`An inspection of type '${type}' has already been logged for this contract.`);
    }

    // If logging RETURN inspection, odometer reading must not be lower than the DELIVERY inspection reading
    if (type === InspectionType.RETURN) {
      const delivery = await prisma.carInspection.findFirst({
        where: { contractId, type: InspectionType.DELIVERY }
      });
      if (delivery && odometerReading < delivery.odometerReading) {
        throw new Error(`Invalid return odometer: reading (${odometerReading} km) cannot be lower than delivery odometer (${delivery.odometerReading} km).`);
      }
    }

    // Create the inspection record
    return await prisma.carInspection.create({
      data: {
        galleryId,
        contractId,
        type,
        gasPercentage,
        odometerReading,
        mediaUrls,
        notes
      }
    });
  }

  /**
   * Compare Delivery and Return inspections for a contract.
   * Calculates delta of driven kilometers, fuel level differences, and compares remarks/media files.
   */
  static async compareInspections(contractId: string, galleryId: string) {
    // Fetch inspections
    const inspections = await prisma.carInspection.findMany({
      where: { contractId, galleryId },
      orderBy: { type: 'asc' } // 'DELIVERY' is sorted first alphabetically, then 'RETURN'
    });

    const delivery = inspections.find((ins) => ins.type === InspectionType.DELIVERY);
    const returnInspection = inspections.find((ins) => ins.type === InspectionType.RETURN);

    if (!delivery) {
      return {
        status: 'INCOMPLETE',
        message: 'No delivery (start) inspection has been recorded for this contract yet.'
      };
    }

    if (!returnInspection) {
      return {
        status: 'ACTIVE_RENTAL',
        message: 'Delivery inspection exists, but return inspection has not yet been recorded.',
        delivery: {
          odometer: delivery.odometerReading,
          gasPercentage: delivery.gasPercentage,
          mediaUrls: delivery.mediaUrls,
          notes: delivery.notes,
          loggedAt: delivery.createdAt
        }
      };
    }

    // Both inspections exist, calculate comparison metrics
    const drivenKm = returnInspection.odometerReading - delivery.odometerReading;
    const gasDiff = delivery.gasPercentage - returnInspection.gasPercentage; // Positive means return fuel is lower

    return {
      status: 'COMPLETED',
      contractId,
      summary: {
        drivenKm,
        gasDifferencePercent: gasDiff,
        fuelChargeRequired: gasDiff > 0, // True if returned with less fuel
        odometerMatched: drivenKm >= 0
      },
      delivery: {
        odometer: delivery.odometerReading,
        gasPercentage: delivery.gasPercentage,
        mediaUrls: delivery.mediaUrls,
        notes: delivery.notes,
        loggedAt: delivery.createdAt
      },
      return: {
        odometer: returnInspection.odometerReading,
        gasPercentage: returnInspection.gasPercentage,
        mediaUrls: returnInspection.mediaUrls,
        notes: returnInspection.notes,
        loggedAt: returnInspection.createdAt
      }
    };
  }
}
