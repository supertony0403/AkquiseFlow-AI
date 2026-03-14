import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { initDB } from './db';
import scanRoutes from './routes/scan';
import leadRoutes from './routes/leads';
import dashboardRoutes from './routes/dashboard';
import emailTemplateRoutes from './routes/emailTemplates';
import settingsRoutes from './routes/settings';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: { error: 'Zu viele Anfragen, bitte warten.' },
});
app.use('/api/', limiter);

app.use('/api/scans', scanRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/email-templates', emailTemplateRoutes);
app.use('/api/settings', settingsRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use(errorHandler);

async function start() {
  try {
    await initDB();
    app.listen(PORT, () => console.log(`✅ AkquiseFlow AI Backend läuft auf Port ${PORT}`));
  } catch (err) {
    console.error('❌ Startup-Fehler:', err);
    process.exit(1);
  }
}

start();
