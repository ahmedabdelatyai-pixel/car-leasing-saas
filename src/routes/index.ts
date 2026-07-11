import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { CarController } from '../controllers/car.controller';
import { TenantController } from '../controllers/tenant.controller';
import { ContractController } from '../controllers/contract.controller';
import { OdometerController } from '../controllers/odometer.controller';
import { InspectionController } from '../controllers/inspection.controller';
import { MaintenanceRequestController } from '../controllers/maintenance_request.controller';
import { authenticateToken, authorizeRoles, enforceTenantIsolation } from '../middlewares/auth.middleware';
import { upload } from '../middlewares/upload.middleware';
import { Role } from '@prisma/client';

const router = Router();

// ==========================================
// 1. PUBLIC AUTHENTICATION & GALLERY CREATION
// ==========================================
router.post('/auth/register', AuthController.register);
router.post('/auth/login', AuthController.login);
router.post('/auth/create-gallery', AuthController.createGallery); // Dedicated Gallery Creation Page API
router.get('/auth/public-galleries', AuthController.getPublicGalleries);

// Scoped SaaS route to retrieve all galleries (Super Admins only)
router.get(
  '/galleries',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN]),
  AuthController.getGalleries
);

router.put(
  '/galleries/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN]),
  AuthController.updateGallery
);

router.put(
  '/gallery/me',
  authenticateToken,
  authorizeRoles([Role.GALLERY_OWNER]),
  AuthController.updateMyGallery
);

router.delete(
  '/galleries/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN]),
  AuthController.deleteGallery
);

// ==========================================
// 1.5. FILE UPLOAD ENDPOINTS (Serverless Safe with Supabase Cloud + Local Fallback)
// ==========================================
import fs from 'fs';
import path from 'path';

async function handleFileUpload(file: Express.Multer.File): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  const supabaseBucket = process.env.SUPABASE_BUCKET || 'media';

  const cleanFilename = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '')}`;

  if (supabaseUrl && supabaseKey) {
    try {
      const cleanUrl = supabaseUrl.replace(/\/$/, '');
      const uploadPath = `uploads/${cleanFilename}`;
      
      const response = await fetch(`${cleanUrl}/storage/v1/object/${supabaseBucket}/${uploadPath}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': file.mimetype
        },
        body: file.buffer
      });

      const resData = (await response.json()) as any;
      if (!response.ok) {
        throw new Error((resData && resData.error) || 'Supabase storage error');
      }

      return `${cleanUrl}/storage/v1/object/public/${supabaseBucket}/${uploadPath}`;
    } catch (err: any) {
      console.error('[SUPABASE UPLOAD ERROR, FALLING BACK TO DISK]:', err);
    }
  }

  // Local Storage Fallback
  const uploadDir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  fs.writeFileSync(path.join(uploadDir, cleanFilename), file.buffer);
  return `/uploads/${cleanFilename}`;
}

router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded or file type is invalid.' });
  }
  try {
    const fileUrl = await handleFileUpload(req.file);
    return res.json({
      message: 'File uploaded successfully',
      url: fileUrl
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'File upload failed' });
  }
});

router.post('/upload-multiple', upload.array('files', 10), async (req, res) => {
  if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
    return res.status(400).json({ error: 'No files uploaded or file types are invalid.' });
  }
  try {
    const files = req.files as Express.Multer.File[];
    const uploadPromises = files.map(file => handleFileUpload(file));
    const urls = await Promise.all(uploadPromises);
    return res.json({
      message: 'Files uploaded successfully',
      urls
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Multiple files upload failed' });
  }
});


// ==========================================
// 2. CAR MANAGEMENT (CRUD - Scoped)
// ==========================================
router.post(
  '/cars',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER]),
  enforceTenantIsolation,
  CarController.createCar
);
router.get(
  '/cars',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER]),
  enforceTenantIsolation,
  CarController.getCars
);
router.get(
  '/cars/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER]),
  enforceTenantIsolation,
  CarController.getCarById
);
router.put(
  '/cars/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER]),
  enforceTenantIsolation,
  CarController.updateCar
);
router.delete(
  '/cars/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER]),
  enforceTenantIsolation,
  CarController.deleteCar
);

// ==========================================
// 3. TENANT / DRIVER MANAGEMENT (CRUD - Scoped)
// ==========================================
router.post(
  '/drivers',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER]),
  enforceTenantIsolation,
  TenantController.createTenant
);
router.get(
  '/drivers',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER]),
  enforceTenantIsolation,
  TenantController.getTenants
);
router.get(
  '/drivers/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER]),
  enforceTenantIsolation,
  TenantController.getTenantById
);
router.put(
  '/drivers/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER]),
  enforceTenantIsolation,
  TenantController.updateTenant
);
router.delete(
  '/drivers/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER]),
  enforceTenantIsolation,
  TenantController.deleteTenant
);

// ==========================================
// 4. CONTRACT MANAGEMENT (Scoped & Filtered)
// ==========================================
router.post(
  '/contracts',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER]),
  enforceTenantIsolation,
  ContractController.createContract
);
router.get(
  '/contracts',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER, Role.TENANT]),
  enforceTenantIsolation,
  ContractController.getContracts
);
router.get(
  '/contracts/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER, Role.TENANT]),
  enforceTenantIsolation,
  ContractController.getContractById
);
router.put(
  '/contracts/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER]),
  enforceTenantIsolation,
  ContractController.updateContract
);
router.delete(
  '/contracts/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER]),
  enforceTenantIsolation,
  ContractController.deleteContract
);

// ==========================================
// 5. ODOMETER LOGGING & WARNING SYSTEMS
// ==========================================
router.post(
  '/odometer/log',
  authenticateToken,
  authorizeRoles([Role.GALLERY_OWNER, Role.TENANT]),
  enforceTenantIsolation,
  OdometerController.logOdometer
);
router.get(
  '/odometer/alerts',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER]),
  enforceTenantIsolation,
  OdometerController.getMaintenanceAlerts
);
router.post(
  '/odometer/trigger-license-check',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER]),
  enforceTenantIsolation,
  OdometerController.runLicenseExpirationCheck
);

// ==========================================
// 6. CAR INSPECTION SYSTEM
// ==========================================
router.post(
  '/inspections',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER]),
  enforceTenantIsolation,
  InspectionController.logInspection
);
router.get(
  '/inspections/compare/:contractId',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER, Role.TENANT]),
  enforceTenantIsolation,
  InspectionController.compareInspections
);

// ==========================================
// 7. MAINTENANCE REQUEST SYSTEM
// ==========================================
router.post(
  '/maintenance-requests',
  authenticateToken,
  authorizeRoles([Role.TENANT]),
  MaintenanceRequestController.createRequest
);
router.get(
  '/maintenance-requests',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER, Role.TENANT]),
  enforceTenantIsolation,
  MaintenanceRequestController.getRequests
);
router.put(
  '/maintenance-requests/:id/respond',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.GALLERY_OWNER]),
  enforceTenantIsolation,
  MaintenanceRequestController.respondToRequest
);

export default router;
