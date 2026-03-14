import { Router } from 'express';
import { pool } from '../db';

const router = Router();

const ALLOWED_KEYS = [
  'OPENROUTER_API_KEY', 'OPENROUTER_MODEL',
  'BRAVE_SEARCH_API_KEY', 'NVD_API_KEY',
  'SCANNER_TIMEOUT_MS', 'MAX_CONCURRENT_SCANS',
  'brave_requests_used',
];

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT `key`, `value` FROM settings') as any;
    const settings: Record<string, string> = {};
    for (const row of rows as any[]) settings[row.key] = row.value;
    if (!settings.OPENROUTER_MODEL) settings.OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
    if (!settings.SCANNER_TIMEOUT_MS) settings.SCANNER_TIMEOUT_MS = process.env.SCANNER_TIMEOUT_MS || '15000';
    if (!settings.MAX_CONCURRENT_SCANS) settings.MAX_CONCURRENT_SCANS = process.env.MAX_CONCURRENT_SCANS || '5';
    settings._db_host = process.env.DB_HOST || 'localhost';
    settings._db_name = process.env.DB_NAME || 'akquiseflow_ai';
    res.json(settings);
  } catch (err) { next(err); }
});

router.put('/', async (req, res, next) => {
  try {
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_KEYS.includes(key)) continue;
      await pool.execute(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = NOW()',
        [key, String(value), String(value)]
      );
      if (key !== 'brave_requests_used') process.env[key] = String(value);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
