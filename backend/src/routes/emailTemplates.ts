import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { generateColdEmail } from '../services/openrouterService';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM email_templates ORDER BY type, name');
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, subject, body, type = 'custom', variables = [] } = req.body;
    if (!name || !body) return res.status(400).json({ error: 'name und body sind erforderlich' });
    const id = uuidv4();
    await pool.execute(
      'INSERT INTO email_templates (id, name, subject, body, type, variables) VALUES (?, ?, ?, ?, ?, ?)',
      [id, String(name).substring(0, 255), String(subject || '').substring(0, 512),
       String(body), type, JSON.stringify(Array.isArray(variables) ? variables : [])]
    );
    res.json({ id, name, subject, body, type });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, subject, body, type, variables } = req.body;
    const [result] = await pool.execute(
      'UPDATE email_templates SET name=?, subject=?, body=?, type=?, variables=?, updated_at=NOW() WHERE id=?',
      [String(name || '').substring(0, 255), String(subject || '').substring(0, 512),
       String(body || ''), type || 'custom', JSON.stringify(variables || []), req.params.id]
    ) as any;
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Template nicht gefunden' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT type FROM email_templates WHERE id = ?', [req.params.id]) as any;
    if (!(rows as any[]).length) return res.status(404).json({ error: 'Template nicht gefunden' });
    if ((rows as any[])[0].type !== 'custom') {
      return res.status(403).json({ error: 'Standard-Templates können nicht gelöscht werden' });
    }
    await pool.execute('DELETE FROM email_templates WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/generate', async (req, res, next) => {
  try {
    const { url, company, scanSummary, templateType = 'cold' } = req.body;
    if (!url) return res.status(400).json({ error: 'url ist erforderlich' });
    const lead = { id: '', url: String(url), company: String(company || ''), status: 'new' as const,
                   description: '', score: 0, tags: [], notes: '', createdAt: '' };
    const email = await generateColdEmail(lead, String(scanSummary || ''));
    res.json({ email, url, company });
  } catch (err) { next(err); }
});

router.post('/render', async (req, res, next) => {
  try {
    const { templateId, variables = {} } = req.body;
    const [rows] = await pool.execute('SELECT * FROM email_templates WHERE id = ?', [templateId]) as any;
    if (!(rows as any[]).length) return res.status(404).json({ error: 'Template nicht gefunden' });
    const tpl = (rows as any[])[0];
    let rendered = tpl.body;
    let renderedSubject = tpl.subject || '';
    for (const [key, val] of Object.entries(variables)) {
      const re = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      rendered = rendered.replace(re, String(val));
      renderedSubject = renderedSubject.replace(re, String(val));
    }
    res.json({ subject: renderedSubject, body: rendered });
  } catch (err) { next(err); }
});

export default router;
