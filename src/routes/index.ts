import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { RestaurantController } from '../controllers/restaurant.controller';
import { OrderController } from '../controllers/order.controller';
import { CaptainController } from '../controllers/captain.controller';
import { ReportController } from '../controllers/report.controller';
import { InventoryController } from '../controllers/inventory.controller';
import { RecipeController } from '../controllers/recipe.controller';
import { OverheadController } from '../controllers/overhead.controller';
import { CustomerController } from '../controllers/customer.controller';
import { SuperAdminController } from '../controllers/superadmin.controller';
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
// 4.1 CUSTOMER CRM & PHONE MEMORY & LOYALTY
// ==========================================
// Public lookup for online ordering customer to check points
router.get(
  '/customers/public-lookup',
  CustomerController.lookupCustomer
);

router.get(
  '/customers/lookup',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  CustomerController.lookupCustomer
);

router.get(
  '/customers',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  CustomerController.getCustomers
);

router.get(
  '/customers/:phone/history',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  CustomerController.getCustomerHistory
);

router.post(
  '/customers/:phone/adjust-points',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN]),
  CustomerController.adjustPoints
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

// ==========================================
// 8. INVENTORY MANAGEMENT (المخزون والمشتريات)
// ==========================================
router.get(
  '/inventory',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  InventoryController.getInventory
);

router.post(
  '/inventory',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  InventoryController.createInventoryItem
);

router.post(
  '/inventory/:id/restock',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  InventoryController.restockItem
);

router.put(
  '/inventory/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  InventoryController.updateInventoryItem
);

router.delete(
  '/inventory/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  InventoryController.deleteInventoryItem
);

// ==========================================
// 9. RECIPES & FOOD COSTING (الوصفات وحساب التكلفة)
// ==========================================
router.get(
  '/recipes',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  RecipeController.getRecipes
);

router.get(
  '/recipes/product/:productId',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  RecipeController.getRecipeByProductId
);

router.post(
  '/recipes',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  RecipeController.saveRecipe
);

router.delete(
  '/recipes/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  RecipeController.deleteRecipe
);

// ==========================================
// 10. OVERHEAD EXPENSES (المصاريف الشهرية والتشغيلية)
// ==========================================
router.get(
  '/overheads',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  OverheadController.getOverheads
);

router.post(
  '/overheads',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  OverheadController.createOverhead
);

router.put(
  '/overheads/daily-orders',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  OverheadController.updateDailyOrdersEstimate
);

router.put(
  '/overheads/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  OverheadController.updateOverhead
);

router.delete(
  '/overheads/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN, Role.RESTAURANT_ADMIN, Role.CASHIER]),
  OverheadController.deleteOverhead
);

// ==========================================
// 10. SUPER ADMIN (SAAS PLATFORM MANAGEMENT)
// ==========================================
router.get(
  '/super-admin/stats',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN]),
  SuperAdminController.getPlatformStats
);

router.get(
  '/super-admin/restaurants',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN]),
  SuperAdminController.listRestaurants
);

router.post(
  '/super-admin/restaurants',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN]),
  SuperAdminController.createRestaurant
);

router.put(
  '/super-admin/restaurants/:id/status',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN]),
  SuperAdminController.updateRestaurantStatus
);

router.post(
  '/super-admin/restaurants/:id/impersonate',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN]),
  SuperAdminController.impersonateRestaurant
);

router.put(
  '/super-admin/users/:id',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN]),
  SuperAdminController.updateUser
);

router.post(
  '/super-admin/restaurants/:id/users',
  authenticateToken,
  authorizeRoles([Role.SUPER_ADMIN]),
  SuperAdminController.createUserForRestaurant
);

export default router;
