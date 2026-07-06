import bcrypt from 'bcryptjs';
import prisma from './prisma';
import { Role } from '@prisma/client';

/**
 * Automatically seeds a default SUPER_ADMIN user for platform management.
 */
export async function seedDefaultAdmin() {
  try {
    const adminEmail = 'admin@saas.com';
    
    // Check if the user already exists
    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail }
    });

    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          role: Role.SUPER_ADMIN
        }
      });
      console.log('🏁 [SEED]: Default Super Admin created (admin@saas.com / admin123)');
    } else {
      console.log('🏁 [SEED]: Default Super Admin already present in database.');
    }
  } catch (error) {
    console.error('❌ [SEED]: Failed to seed default Super Admin:', error);
  }
}
export default seedDefaultAdmin;
