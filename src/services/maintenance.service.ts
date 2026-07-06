import prisma from '../utils/prisma';
import { OdometerLogType, AlertType, AlertStatus } from '@prisma/client';

export class MaintenanceService {
  /**
   * Logs a new odometer reading, updates the car's current odometer atomically,
   * and evaluates maintenance warning conditions.
   */
  static async logOdometer(params: {
    galleryId: string;
    contractId: string;
    carId: string;
    type: OdometerLogType;
    odometerValue: number;
    invoiceImageUrl?: string;
  }) {
    const { galleryId, contractId, carId, type, odometerValue, invoiceImageUrl } = params;

    // Run in a single transaction to ensure atomicity
    return await prisma.$transaction(async (tx) => {
      // 1. Fetch the car to get current details & verify it belongs to this gallery
      const car = await tx.car.findFirst({
        where: { id: carId, galleryId }
      });

      if (!car) {
        throw new Error('Car not found or unauthorized access to this gallery.');
      }

      // Verify the contract exists and belongs to this gallery
      const contract = await tx.contract.findFirst({
        where: { id: contractId, galleryId, carId }
      });

      if (!contract) {
        throw new Error('Contract not found, or does not link this car/gallery.');
      }

      // Odometer reading cannot be lower than the car's current odometer (preventing reverse rollback)
      if (odometerValue < car.currentOdometer) {
        throw new Error(`Invalid odometer reading: Value (${odometerValue} km) is less than the current odometer (${car.currentOdometer} km).`);
      }

      // 2. Create the OdometerLog entry
      const log = await tx.odometerLog.create({
        data: {
          galleryId,
          contractId,
          carId,
          type,
          odometerValue,
          invoiceImageUrl
        }
      });

      // 3. Update the Car's current odometer reading
      const updatedCar = await tx.car.update({
        where: { id: carId },
        data: {
          currentOdometer: odometerValue
        }
      });

      // 4. Run Smart Maintenance warning logic
      const warnings = await this.evaluateMaintenanceWarnings(tx, {
        galleryId,
        carId,
        currentOdometer: odometerValue,
        oilChangeInterval: car.oilChangeInterval,
        filterChangeInterval: car.filterChangeInterval,
        contractId
      });

      return { log, updatedCar, warnings };
    });
  }

  /**
   * Calculates delta between current odometer and the last oil/filter changes.
   * Raises alerts if the delta is within 500km of the warning thresholds.
   */
  private static async evaluateMaintenanceWarnings(
    tx: any, // Pass the active transaction client
    params: {
      galleryId: string;
      carId: string;
      currentOdometer: number;
      oilChangeInterval: number;
      filterChangeInterval: number;
      contractId: string;
    }
  ) {
    const { galleryId, carId, currentOdometer, oilChangeInterval, filterChangeInterval, contractId } = params;
    const warnings: string[] = [];

    // --- 1. Oil Change Math ---
    // Find last logged oil change odometer reading
    const lastOilChange = await tx.odometerLog.findFirst({
      where: { carId, type: OdometerLogType.OIL_CHANGE },
      orderBy: { odometerValue: 'desc' }
    });

    let lastOilOdometer = 0;
    if (lastOilChange) {
      lastOilOdometer = lastOilChange.odometerValue;
    } else {
      // Fallback: Check contract delivery inspection odometer reading
      const deliveryInspection = await tx.carInspection.findFirst({
        where: { contractId, type: 'DELIVERY' }
      });
      if (deliveryInspection) {
        lastOilOdometer = deliveryInspection.odometerReading;
      }
    }

    const oilDelta = currentOdometer - lastOilOdometer;
    const oilRemaining = oilChangeInterval - oilDelta;

    if (oilRemaining <= 500) {
      // Check if a pending alert already exists to prevent duplicate notifications
      const existingAlert = await tx.maintenanceAlert.findFirst({
        where: {
          carId,
          type: AlertType.OIL_CHANGE,
          status: AlertStatus.PENDING
        }
      });

      if (!existingAlert) {
        const message = `Maintenance Alert: Oil change due soon! Car has driven ${oilDelta} km since the last change. Interval is ${oilChangeInterval} km. Remaining: ${oilRemaining} km.`;
        await tx.maintenanceAlert.create({
          data: {
            galleryId,
            carId,
            type: AlertType.OIL_CHANGE,
            message
          }
        });
        warnings.push(message);
      }
    }

    // --- 2. Filter Change Math ---
    // Find last logged filter change odometer reading
    const lastFilterChange = await tx.odometerLog.findFirst({
      where: { carId, type: OdometerLogType.FILTER_CHANGE },
      orderBy: { odometerValue: 'desc' }
    });

    let lastFilterOdometer = 0;
    if (lastFilterChange) {
      lastFilterOdometer = lastFilterChange.odometerValue;
    } else {
      // Fallback to contract delivery inspection
      const deliveryInspection = await tx.carInspection.findFirst({
        where: { contractId, type: 'DELIVERY' }
      });
      if (deliveryInspection) {
        lastFilterOdometer = deliveryInspection.odometerReading;
      }
    }

    const filterDelta = currentOdometer - lastFilterOdometer;
    const filterRemaining = filterChangeInterval - filterDelta;

    if (filterRemaining <= 500) {
      // Check if a pending alert already exists
      const existingAlert = await tx.maintenanceAlert.findFirst({
        where: {
          carId,
          type: AlertType.FILTER_CHANGE,
          status: AlertStatus.PENDING
        }
      });

      if (!existingAlert) {
        const message = `Maintenance Alert: Filter change due soon! Car has driven ${filterDelta} km since the last change. Interval is ${filterChangeInterval} km. Remaining: ${filterRemaining} km.`;
        await tx.maintenanceAlert.create({
          data: {
            galleryId,
            carId,
            type: AlertType.FILTER_CHANGE,
            message
          }
        });
        warnings.push(message);
      }
    }

    return warnings;
  }

  /**
   * License Expiry Alert Logic.
   * Queries all cars where the license_end_date is less than 30 days away.
   * Queues system alerts/logs for the specific galleries.
   */
  static async checkLicenseExpirations() {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Find cars expiring in less than 30 days
    const expiringCars = await prisma.car.findMany({
      where: {
        licenseEndDate: {
          lte: thirtyDaysFromNow
        }
      },
      include: {
        gallery: true
      }
    });

    const alertsQueued: any[] = [];

    for (const car of expiringCars) {
      const daysRemaining = Math.ceil(
        (new Date(car.licenseEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );

      const message = `License Expiry Alert: Car with plate number '${car.plateNumber}' (${car.model}) has a license expiring on ${car.licenseEndDate.toISOString().split('T')[0]} (${daysRemaining} days remaining).`;

      // Check if alert already exists to prevent duplicate queue items
      const existingAlert = await prisma.maintenanceAlert.findFirst({
        where: {
          carId: car.id,
          galleryId: car.galleryId,
          message: {
            contains: 'License Expiry Alert'
          }
        }
      });

      if (!existingAlert) {
        // Log in DB under a mock system status or custom notification log
        const alert = await prisma.maintenanceAlert.create({
          data: {
            galleryId: car.galleryId,
            carId: car.id,
            // Reuse OIL_CHANGE as placeholder or custom string in message
            type: AlertType.OIL_CHANGE, 
            status: AlertStatus.PENDING,
            message
          }
        });
        alertsQueued.push({
          alertId: alert.id,
          galleryId: car.galleryId,
          carId: car.id,
          message
        });
      }
    }

    return alertsQueued;
  }
}
