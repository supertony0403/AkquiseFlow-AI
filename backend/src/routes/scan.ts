import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { scanWebsite } from '../services/scanner';
import { checkCVEs } from '../services/cveService';
import { analyzeWebsite, findContacts } from '../services/openrouterService';
import { checkDSGVO } from '../services/dsgvoService';
import axios from 'axios';
import https from 'https';

const router = Router();

// POST /api/scans - Neuen Scan starten
router.post('/', async (req, res, next) => {
  try {
    const { url, options = {} } = req.body;
    if (!url) return res.status(400).json({ error: 'URL ist erforderlich' });

    const id = uuidv4();
    await pool.execute(
      'INSERT INTO scans (id, url, status) VALUES (?, ?, ?)',
      [id, url, 'scanning']
    );

    res.json({ id, url, status: 'scanning', message: 'Scan gestartet' });

    // Scan im Hintergrund
    (async () => {
      try {
        const result = await scanWebsite(url);

        if (options.scanCVE !== false && result.technologies) {
          const cves = await checkCVEs(result.technologies);
          result.cves = cves;
          const criticalCount = cves.filter(c => c.severity === 'CRITICAL' || c.severity === 'HIGH').length;
          if (result.securityScore) {
            result.securityScore.cve = Math.max(0, 100 - criticalCount * 15);
            result.securityScore.overall = Math.round(
              (result.securityScore.ssl + result.securityScore.headers + result.securityScore.cve) / 3
            );
          }
        }

        if (options.aiAnalysis !== false) {
          try {
            result.aiAnalysis = await analyzeWebsite(result);
          } catch { /* AI optional */ }
        }

        // Kontakte finden
        try {
          const htmlRes = await axios.get(
            url.startsWith('http') ? url : `https://${url}`,
            {
              timeout: 10000,
              headers: { 'User-Agent': 'Mozilla/5.0' },
              httpsAgent: new https.Agent({ rejectUnauthorized: false }),
              validateStatus: () => true,
            }
          );
          const contacts = await findContacts(url, typeof htmlRes.data === 'string' ? htmlRes.data : '');
          result.contacts = contacts;
        } catch { /* Contacts optional */ }

        // DSGVO-Check
        try {
          const htmlRes2 = await axios.get(
            url.startsWith('http') ? url : `https://${url}`,
            {
              timeout: 10000,
              headers: { 'User-Agent': 'Mozilla/5.0' },
              httpsAgent: new https.Agent({ rejectUnauthorized: false }),
              validateStatus: () => true,
            }
          );
          const htmlContent = typeof htmlRes2.data === 'string' ? htmlRes2.data : '';
          result.dsgvo = checkDSGVO(htmlContent, url.startsWith('http') ? url : `https://${url}`, result.ssl?.valid ?? false);
        } catch { /* DSGVO optional */ }

        await pool.execute(
          'UPDATE scans SET status = ?, result = ?, updated_at = NOW() WHERE id = ?',
          ['completed', JSON.stringify(result), id]
        );
      } catch (err) {
        await pool.execute(
          'UPDATE scans SET status = ?, error_message = ?, updated_at = NOW() WHERE id = ?',
          ['failed', (err as Error).message, id]
        );
      }
    })();
  } catch (err) { next(err); }
});

// GET /api/scans - Alle Scans
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const [rows] = await pool.execute(
      'SELECT id, url, status, error_message, created_at, updated_at FROM scans ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    const [[{ total }]] = await pool.execute('SELECT COUNT(*) as total FROM scans') as any;

    res.json({ scans: rows, total, page, limit });
  } catch (err) { next(err); }
});

// GET /api/scans/:id - Scan-Ergebnis
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM scans WHERE id = ?', [req.params.id]) as any;
    if (!(rows as any[]).length) return res.status(404).json({ error: 'Scan nicht gefunden' });

    const scan = (rows as any[])[0];
    if (scan.result) scan.result = JSON.parse(scan.result);
    res.json(scan);
  } catch (err) { next(err); }
});

// DELETE /api/scans/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.execute('DELETE FROM scans WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/scans/:id/analyze - AI Analyse nachholen
router.post('/:id/analyze', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM scans WHERE id = ?', [req.params.id]) as any;
    if (!(rows as any[]).length) return res.status(404).json({ error: 'Scan nicht gefunden' });

    const scan = (rows as any[])[0];
    const result = scan.result ? JSON.parse(scan.result) : {};
    const aiAnalysis = await analyzeWebsite(result);
    result.aiAnalysis = aiAnalysis;

    await pool.execute('UPDATE scans SET result = ? WHERE id = ?', [JSON.stringify(result), req.params.id]);
    res.json(aiAnalysis);
  } catch (err) { next(err); }
});

export default router;
