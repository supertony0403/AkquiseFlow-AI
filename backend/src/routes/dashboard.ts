import { Router } from 'express';
import { pool } from '../db';

const router = Router();

router.get('/stats', async (req, res, next) => {
  try {
    const [[totals]] = await pool.execute(`
      SELECT
        COUNT(*) as totalScans,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as scansToday,
        AVG(CASE WHEN status = 'completed' AND result IS NOT NULL
            THEN JSON_EXTRACT(result, '$.securityScore.overall') END) as avgScore
      FROM scans
    `) as any;

    const [[leadTotals]] = await pool.execute(`
      SELECT
        COUNT(*) as totalLeads,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as leadsNew,
        SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) as leadsQualified
      FROM leads
    `) as any;

    const [scanResults] = await pool.execute(`
      SELECT result FROM scans WHERE status = 'completed' AND result IS NOT NULL
      ORDER BY created_at DESC LIMIT 50
    `) as any;

    let criticalCves = 0;
    const cveDistribution: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const row of scanResults as any[]) {
      try {
        const result = typeof row.result === 'string' ? JSON.parse(row.result) : row.result;
        const cves = result?.cves || [];
        for (const cve of cves) {
          if (cve.severity === 'CRITICAL' || cve.severity === 'HIGH') criticalCves++;
          if (cveDistribution[cve.severity] !== undefined) cveDistribution[cve.severity]++;
        }
      } catch { /* ignore */ }
    }

    const [recentScans] = await pool.execute(
      'SELECT id, url, status, created_at as createdAt FROM scans ORDER BY created_at DESC LIMIT 10'
    );

    const [topLeads] = await pool.execute(
      'SELECT id, url, company, score, status FROM leads ORDER BY score DESC LIMIT 5'
    );

    res.json({
      totalScans: totals.totalScans || 0,
      scansToday: totals.scansToday || 0,
      avgSecurityScore: Math.round(totals.avgScore || 0),
      totalLeads: leadTotals.totalLeads || 0,
      leadsNew: leadTotals.leadsNew || 0,
      leadsQualified: leadTotals.leadsQualified || 0,
      criticalCves,
      cveDistribution: Object.entries(cveDistribution).map(([severity, count]) => ({ severity, count })),
      recentScans,
      topLeads,
    });
  } catch (err) { next(err); }
});

export default router;
