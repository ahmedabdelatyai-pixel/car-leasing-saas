import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';
import { Role } from '@prisma/client';

export class TenantController {
  /**
   * Register a new Tenant (Driver) and create their TenantProfile under the gallery.
   */
  static async createTenant(req: Request, res: Response) {
    try {
      const { email, password, fullName, nationalId, nationalIdUrl, drivingLicenseUrl } = req.body;
      const galleryId = req.galleryId; // Set by enforceTenantIsolation middleware

      if (!galleryId) {
        return res.status(400).json({ error: 'gallery_id is required to create a driver.' });
      }

      if (!email || !password || !fullName || !nationalId || !nationalIdUrl || !drivingLicenseUrl) {
        return res.status(400).json({ error: 'Missing required credentials or profile parameters.' });
      }

      // Verify email isn't already registered
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(409).json({ error: 'User with this email is already registered.' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      // Save user & profile atomically in transaction
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            role: Role.TENANT,
            galleryId
          }
        });

        const profile = await tx.tenantProfile.create({
          data: {
            userId: user.id,
            galleryId,
            fullName,
            nationalId,
            nationalIdUrl,
            drivingLicenseUrl
          }
        });

        return { user, profile };
      });

      return res.status(201).json({
        message: 'Driver profile created successfully',
        tenant: {
          id: result.profile.id,
          userId: result.user.id,
          email: result.user.email,
          fullName: result.profile.fullName,
          nationalId: result.profile.nationalId,
          nationalIdUrl: result.profile.nationalIdUrl,
          drivingLicenseUrl: result.profile.drivingLicenseUrl,
          galleryId: result.profile.galleryId
        }
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to create driver', message: error.message });
    }
  }


  /**
   * Retrieves all drivers in this gallery.
   */
  static async getTenants(req: Request, res: Response) {
    try {
      const galleryId = req.galleryId;

      const profiles = await prisma.tenantProfile.findMany({
        where: galleryId ? { galleryId } : {},
        include: {
          user: {
            select: {
              email: true,
              role: true
            }
          }
        }
      });

      return res.json(profiles);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to retrieve driver profiles', message: error.message });
    }
  }

  /**
   * Retrieves a single driver profile by its ID (scoped to gallery).
   */
  static async getTenantById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const galleryId = req.galleryId;

      const profile = await prisma.tenantProfile.findFirst({
        where: {
          id,
          ...(galleryId ? { galleryId } : {})
        },
        include: {
          user: {
            select: {
              email: true
            }
          }
        }
      });

      if (!profile) {
        return res.status(404).json({ error: 'Driver profile not found or unauthorized.' });
      }

      return res.json(profile);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to retrieve driver profile', message: error.message });
    }
  }

  /**
   * Update driver profile details.
   */
  static async updateTenant(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const galleryId = req.galleryId;
      const { fullName, nationalId, nationalIdUrl, drivingLicenseUrl, email, password } = req.body;

      // Verify profile ownership/access and include user relation
      const profile = await prisma.tenantProfile.findFirst({
        where: {
          id,
          ...(galleryId ? { galleryId } : {})
        },
        include: {
          user: true
        }
      });

      if (!profile) {
        return res.status(404).json({ error: 'Driver profile not found or unauthorized.' });
      }

      const result = await prisma.$transaction(async (tx) => {
        // If email is changing, verify uniqueness
        if (email && email !== profile.user.email) {
          const existingUser = await tx.user.findFirst({
            where: { email, NOT: { id: profile.userId } }
          });
          if (existingUser) {
            throw new Error('User with this email is already registered.');
          }
        }

        // Prepare user updates
        const userUpdates: any = {};
        if (email) userUpdates.email = email;
        if (password) userUpdates.passwordHash = await bcrypt.hash(password, 10);

        if (Object.keys(userUpdates).length > 0) {
          await tx.user.update({
            where: { id: profile.userId },
            data: userUpdates
          });
        }

        // Update profile updates
        const updatedProfile = await tx.tenantProfile.update({
          where: { id },
          data: {
            fullName: fullName || undefined,
            nationalId: nationalId || undefined,
            nationalIdUrl: nationalIdUrl || undefined,
            drivingLicenseUrl: drivingLicenseUrl || undefined
          }
        });

        return updatedProfile;
      });

      return res.json({ message: 'Driver profile and login updated successfully', profile: result });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to update driver profile', message: error.message });
    }
  }


  /**
   * Delete a driver profile and their User credentials.
   */
  static async deleteTenant(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const galleryId = req.galleryId;

      // Verify access
      const profile = await prisma.tenantProfile.findFirst({
        where: {
          id,
          ...(galleryId ? { galleryId } : {})
        }
      });

      if (!profile) {
        return res.status(404).json({ error: 'Driver profile not found or unauthorized.' });
      }

      // Delete user (cascade will handle profile deletion)
      await prisma.user.delete({ where: { id: profile.userId } });

      return res.json({ message: 'Driver and associated profile deleted successfully.' });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to delete driver', message: error.message });
    }
  }
}
