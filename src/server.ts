import dotenv from 'dotenv';
import app from './app';
import { seedDefaultAdmin } from './utils/seeder';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, async () => {
  console.log(`==================================================`);
  console.log(`🚀 CAR LEASING SAAS BACKEND INITIALIZED SUCCESSFULLY`);
  console.log(`🔊 Listening on http://localhost:${PORT}`);
  console.log(`🛡️  Tenant Data Isolation: ACTIVE`);
  console.log(`🛠️  Smart Maintenance Engine: ACTIVE`);
  console.log(`==================================================`);

  // Run database seeds
  await seedDefaultAdmin();
});

// Handle server termination events gracefully
const shutdown = (signal: string) => {
  console.log(`${signal} signal received: closing HTTP server...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});
