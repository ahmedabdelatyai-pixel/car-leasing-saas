import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { Role } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_super_secret_for_development';

export class AuthController {
  /**
   * Creates a dedicated Gallery and registers its Owner user.
   */
  static async createGallery(req: Request, res: Response) {
    try {
      const { name, ownerEmail, ownerPassword } = req.body;

      if (!name || !ownerEmail || !ownerPassword) {
        return res.status(400).json({ error: 'Missing required parameters: name, ownerEmail, ownerPassword.' });
      }

      const cleanEmail = ownerEmail.toLowerCase().trim();

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
      if (existingUser) {
        return res.status(409).json({ error: 'User with this email is already registered.' });
      }

      const passwordHash = await bcrypt.hash(ownerPassword, 10);

      const result = await prisma.$transaction(async (tx) => {
        // 1. Create the new Gallery
        const gallery = await tx.gallery.create({
          data: { name }
        });

        // 2. Create the Gallery Owner user
        const owner = await tx.user.create({
          data: {
            email: cleanEmail,
            passwordHash,
            role: Role.GALLERY_OWNER,
            galleryId: gallery.id
          }
        });

        return { gallery, owner };
      });

      return res.status(201).json({
        message: 'Gallery and owner account created successfully',
        galleryId: result.gallery.id,
        galleryName: result.gallery.name,
        owner: {
          id: result.owner.id,
          email: result.owner.email
        }
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to create gallery', message: error.message });
    }
  }

  /**
   * List all galleries in the system. Restricted to SUPER_ADMIN.
   */
  static async getGalleries(req: Request, res: Response) {
    try {
      const galleries = await prisma.gallery.findMany({
        orderBy: { name: 'asc' },
        include: {
          users: {
            where: { role: Role.GALLERY_OWNER },
            select: { email: true }
          }
        }
      });
      return res.json(galleries);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to retrieve galleries', message: error.message });
    }
  }

  /**
   * List all galleries (public subset for registration dropdown).
   */
  static async getPublicGalleries(req: Request, res: Response) {
    try {
      const galleries = await prisma.gallery.findMany({
        select: { id: true, name: true }
      });
      return res.json(galleries);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to retrieve public galleries list', message: error.message });
    }
  }

  /**
   * Registers a new User. If role is GALLERY_OWNER or TENANT, it associates them with a gallery.
   */
  static async register(req: Request, res: Response) {
    try {
      const { email, password, role, galleryName, galleryId, fullName, nationalId, nationalIdUrl, drivingLicenseUrl } = req.body;

      if (!email || !password || !role) {
        return res.status(400).json({ error: 'Missing required credentials (email, password, role).' });
      }

      const cleanEmail = email.toLowerCase().trim();

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
      if (existingUser) {
        return res.status(409).json({ error: 'User with this email already exists.' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      let associatedGalleryId = galleryId || null;

      // Wrap in a transaction to handle conditional profile and gallery creation
      const result = await prisma.$transaction(async (tx) => {
        // If GALLERY_OWNER registers without a galleryId but provides a galleryName, create a new Gallery
        if (role === 'GALLERY_OWNER' && !associatedGalleryId && galleryName) {
          const newGallery = await tx.gallery.create({
            data: { name: galleryName }
          });
          associatedGalleryId = newGallery.id;
        }

        // Create the user
        const newUser = await tx.user.create({
          data: {
            email: cleanEmail,
            passwordHash,
            role,
            galleryId: associatedGalleryId
          }
        });

        // If registering a TENANT, create their TenantProfile details
        if (role === 'TENANT') {
          if (!associatedGalleryId) {
            throw new Error('A tenant must be associated with a valid gallery_id.');
          }
          if (!fullName || !nationalIdUrl || !drivingLicenseUrl) {
            throw new Error('Tenant profile details (fullName, nationalIdUrl, drivingLicenseUrl) are required.');
          }

          const profile = await tx.tenantProfile.create({
            data: {
              userId: newUser.id,
              galleryId: associatedGalleryId,
              fullName,
              nationalId: nationalId || "",
              nationalIdUrl,
              drivingLicenseUrl
            }
          });

          return { user: newUser, profile };
        }

        return { user: newUser };
      });

      return res.status(201).json({
        message: 'User registered successfully',
        userId: result.user.id,
        role: result.user.role,
        galleryId: result.user.galleryId
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Registration failed', message: error.message });
    }
  }

  /**
   * Logs in a User and generates a JWT scoped with galleryId if applicable.
   */
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      const cleanEmail = email.toLowerCase().trim();

      const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      // Construct scoped JWT Payload
      const payload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        galleryId: user.galleryId
      };

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

      return res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          galleryId: user.galleryId
        }
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Login failed', message: error.message });
    }
  }

  /**
   * Update Gallery details and Gallery Owner email/password. Restricted to SUPER_ADMIN.
   */
  static async updateGallery(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, ownerEmail, ownerPassword } = req.body;

      // Verify gallery exists and include users with role GALLERY_OWNER
      const gallery = await prisma.gallery.findUnique({
        where: { id },
        include: {
          users: {
            where: { role: Role.GALLERY_OWNER }
          }
        }
      });

      if (!gallery) {
        return res.status(404).json({ error: 'Gallery not found.' });
      }

      const owner = gallery.users[0];

      await prisma.$transaction(async (tx) => {
        // 1. Update Gallery Name
        if (name) {
          await tx.gallery.update({
            where: { id },
            data: { name }
          });
        }

        // 2. Update Owner credentials if exists
        if (owner) {
          const cleanOwnerEmail = ownerEmail ? ownerEmail.toLowerCase().trim() : null;
          if (cleanOwnerEmail && cleanOwnerEmail !== owner.email) {
            const existingEmail = await tx.user.findFirst({
              where: { email: cleanOwnerEmail, NOT: { id: owner.id } }
            });
            if (existingEmail) {
              throw new Error('User with this email is already registered.');
            }
          }

          const userUpdates: any = {};
          if (cleanOwnerEmail) userUpdates.email = cleanOwnerEmail;
          if (ownerPassword) userUpdates.passwordHash = await bcrypt.hash(ownerPassword, 10);

          if (Object.keys(userUpdates).length > 0) {
            await tx.user.update({
              where: { id: owner.id },
              data: userUpdates
            });
          }
        }
      });

      return res.json({ message: 'Gallery and owner account updated successfully.' });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to update gallery', message: error.message });
    }
  }

  /**
   * Delete a Gallery and all its associated data. Restricted to SUPER_ADMIN.
   */
  static async deleteGallery(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const gallery = await prisma.gallery.findUnique({ where: { id } });
      if (!gallery) {
        return res.status(404).json({ error: 'Gallery not found.' });
      }

      await prisma.gallery.delete({ where: { id } });

      return res.json({ message: 'Gallery and all associated data deleted successfully.' });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to delete gallery', message: error.message });
    }
  }
}
