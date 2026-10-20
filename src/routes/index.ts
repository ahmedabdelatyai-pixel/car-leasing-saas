import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { RestaurantController } from '../controllers/restaurant.controller';
import { OrderController } from '../controllers/order.controller';
import { CaptainController } from '../controllers/captain.controller';
import { ReportController } from '../controllers/report.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { upload } from '../middlewares/upload.middleware';
import { Role } from '@prisma/client';
import path from 'path';
import fs from 'fs';

const router = Router();

// ==========================================
// 1. FILE UPLOAD LOGIC (Disk & Base64 Fallback)
// ==========================================
async function handleFileUpload(file: Express.Multer.File): Promise<string> {
  const cleanFilename = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

  try {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    fs.writeFileSync(path.join(uploadDir, cleanFilename), file.buffer);
    return `/uploads/${cleanFilename}`;
  } catch (localWriteErr: any) {
    // Base64 Data URL fallback for serverless environments (Vercel)
    const base64Content = file.buffer.toString('base64');
    return `data:${file.mimetype};base64,${base64Content}`;
  }
}

router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded or file type is invalid.' });
  }
  try {
    const fileUrl = await handleFileUpload(req.file);
    return res.json({ message: 'File uploaded successfully', url: fileUrl });
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
    return res.json({ message: 'Files uploaded successfully', urls });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Multiple files upload failed' });
  }
});

// ==========================================
// 2. AUTHENTICATION & LOGIN
// ==========================================
router.post('/auth/login', AuthController.login);
router.post('/auth/register', AuthController.register);
router.get('/auth/me', authenticateToken, AuthController.getProfile);
router.put('/auth/profile', authenticateToken, AuthController.updateProfile);
router.post('/auth/change-password', authenticateToken, AuthController.changePassword);

// ==========================================
// 3. RESTAURANT & MENU MANAGEMENT
// ==========================================
router.get('/restaurant/menu', RestaurantController.getPublicMenu);

router.put(
  '/restaurant/settings',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN]),
  RestaurantController.updateSettings
);

router.post(
  '/restaurant/categories',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN]),
  RestaurantController.createCategory
);

router.post(
  '/restaurant/menu-items',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN]),
  RestaurantController.createMenuItem
);

router.put(
  '/restaurant/menu-items/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN]),
  RestaurantController.updateMenuItem
);

router.delete(
  '/restaurant/menu-items/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN]),
  RestaurantController.deleteMenuItem
);

// ==========================================
// 4. ORDERS & KITCHEN SYSTEM
// ==========================================
router.post('/orders', OrderController.createOrder); // Public for customers to order
router.get('/orders/track/:orderNumber', OrderController.trackOrder); // Public for customers to track

router.get(
  '/orders',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER, Role.KITCHEN]),
  OrderController.getOrders
);

router.put(
  '/orders/:id/status',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER, Role.KITCHEN]),
  OrderController.updateStatus
);

router.delete(
  '/orders/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN]),
  OrderController.deleteOrder
);

// ==========================================
// 5. DELIVERY CAPTAINS FLEET
// ==========================================
router.get(
  '/captains',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  CaptainController.getCaptains
);

router.post(
  '/captains',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN]),
  CaptainController.createCaptain
);

router.put(
  '/captains/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN]),
  CaptainController.updateCaptain
);

router.delete(
  '/captains/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN]),
  CaptainController.deleteCaptain
);

// ==========================================
// 6. REPORTS, DAY CLOSURE & ANALYTICS
// ==========================================
router.get(
  '/reports/sales',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  ReportController.getSalesReport
);

router.get(
  '/reports/current-shift',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  ReportController.getCurrentShiftSummary
);

router.post(
  '/reports/close-day',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  ReportController.closeDay
);

router.get(
  '/reports/closures',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  ReportController.getDailyClosures
);

router.get(
  '/reports/closures/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  ReportController.getClosureDetails
);

router.get(
  '/reports/period',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  ReportController.getPeriodReport
);

export default router;
