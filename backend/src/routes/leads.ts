import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { searchLeads } from '../services/braveSearch';
import { generateColdEmail } from '../services/openrouterService';

const router = Router();

// GET /api/leads
router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM leads';
    const params: any[] = [];
    if (status) { query += ' WHERE status = ?'; params.push(status); }
    query += ' ORDER BY score DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.execute(query, params);
    const [[{ total }]] = await pool.execute(
      status ? 'SELECT COUNT(*) as total FROM leads WHERE status = ?' : 'SELECT COUNT(*) as total FROM leads',
      status ? [status] : []
    ) as any;

    const leads = (rows as any[]).map(l => ({ ...l, tags: l.tags ? JSON.parse(l.tags) : [] }));
    res.json({ leads, total, page, limit });
  } catch (err) { next(err); }
});

// POST /api/leads - Lead erstellen
router.post('/', async (req, res, next) => {
  try {
    const { url, company, description, score, tags, scan_id } = req.body;
    if (!url) return res.status(400).json({ error: 'URL ist erforderlich' });

    const id = uuidv4();
    await pool.execute(
      'INSERT INTO leads (id, url, company, description, score, tags, scan_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, url, company || '', description || '', score || 0, JSON.stringify(tags || []), scan_id || null]
    );
    res.json({ id, url, company, status: 'new' });
  } catch (err) { next(err); }
});

// PUT /api/leads/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { company, description, score, status, tags, notes } = req.body;
    await pool.execute(
      'UPDATE leads SET company=?, description=?, score=?, status=?, tags=?, notes=?, updated_at=NOW() WHERE id=?',
      [company, description, score, status, JSON.stringify(tags || []), notes, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/leads/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.execute('DELETE FROM leads WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/leads/search - Mit Brave Search nach Leads suchen
router.post('/search', async (req, res, next) => {
  try {
    const { query, industry, location, maxResults } = req.body;
    const results = await searchLeads({ query: query || '', industry, location, maxResults });

    // Leads in DB speichern
    const saved = [];
    for (const r of results) {
      const id = uuidv4();
      await pool.execute(
        'INSERT IGNORE INTO leads (id, url, company, description) VALUES (?, ?, ?, ?)',
        [id, r.url, r.title, r.description]
      ).catch(() => {});
      saved.push({ id, url: r.url, company: r.title, description: r.description });
    }
    res.json({ leads: saved, total: saved.length });
  } catch (err) { next(err); }
});

// GET /api/leads/export — CSV-Export
router.get('/export', async (req, res, next) => {
  try {
    const status = req.query.status as string;
    const [rows] = await pool.execute(
      status ? 'SELECT * FROM leads WHERE status = ? ORDER BY score DESC' : 'SELECT * FROM leads ORDER BY score DESC',
      status ? [status] : []
    ) as any;

    const headers = ['id','url','company','description','score','status','contact_name','contact_email','contact_phone','notes','created_at'];
    const csv = [
      headers.join(','),
      ...(rows as any[]).map(r =>
        headers.map(h => {
          const val = r[h] ?? '';
          const str = String(val).replace(/"/g, '""');
          return str.includes(',') || str.includes('\n') ? `"${str}"` : str;
        }).join(',')
      )
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send('\uFEFF' + csv);
  } catch (err) { next(err); }
});

// GET /api/leads/:id/contacts
router.get('/:id/contacts', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM contacts WHERE lead_id = ?', [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/leads/:id/email - Kaltakquise-Email generieren
router.post('/:id/email', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM leads WHERE id = ?', [req.params.id]) as any;
    if (!(rows as any[]).length) return res.status(404).json({ error: 'Lead nicht gefunden' });

    const lead = (rows as any[])[0];
    const scanSummary = req.body.scanSummary || lead.description || '';
    const email = await generateColdEmail(lead, scanSummary);
    res.json({ email });
  } catch (err) { next(err); }
});

export default router;
