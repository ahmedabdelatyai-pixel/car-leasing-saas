import express from 'express';
import cors from 'cors';
import path from 'path';
import router from './routes';
import { errorHandler } from './middlewares/error.middleware';

const app = express();

// Global Middlewares
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// Serve uploaded documents/media files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Application Routing
app.use('/api/v1', router);

// Serve role-specific portal HTML pages
app.get('/super-admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/super_admin.html'));
});
app.get('/gallery-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/gallery_dashboard.html'));
});
app.get('/my-vehicle', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/my_vehicle.html'));
});
app.get('/driver-login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/driver_login.html'));
});

// Default Health-Check Endpoint
app.get('/health', (req, res) => {
  const dbUrl = process.env.PRISMA_DATABASE_URL;
  res.json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    service: 'Car Leasing SaaS Platform API',
    diagnostics: {
      PRISMA_DATABASE_URL_PRESENT: !!dbUrl,
      PRISMA_DATABASE_URL_LENGTH: dbUrl ? dbUrl.length : 0,
      PRISMA_DATABASE_URL_PREVIEW: dbUrl ? `${dbUrl.substring(0, 15)}...` : 'NONE',
      DIRECT_URL_PRESENT: !!process.env.DIRECT_URL,
      DIRECT_URL_LENGTH: process.env.DIRECT_URL ? process.env.DIRECT_URL.length : 0
    }
  });
});

// 404 Route Not Found Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'NotFound',
    message: `Requested route '${req.method} ${req.originalUrl}' does not exist.`
  });
});

// Global Error Handler
app.use(errorHandler);

export default app;
