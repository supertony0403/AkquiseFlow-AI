# AkquiseFlow AI — Full Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vollständiges AkquiseFlow AI Dashboard — Website-Scanner, CVE-Check, DSGVO-Analyse, Lead-Verwaltung, KI-E-Mail-Generator mit React-Frontend + Express-Backend + MySQL.

**Architecture:** Express-Backend (Port 3001) mit REST-API; React+Vite-Frontend (Port 5173) das per Axios kommuniziert. Scanner läuft async im Backend, Frontend pollt alle 2s. Alle Daten in MySQL.

**Tech Stack:** Node.js 20, Express, TypeScript, MySQL2, Cheerio, Axios, React 18, Vite, TailwindCSS, React Query, Recharts, React Router, OpenRouter API, Brave Search API, NVD/CIRCL/OSV APIs.

---

## Chunk 1: Backend Foundation

### Task 1: Backend Entry Point (index.ts)

**Files:**
- Create: `backend/src/index.ts`

- [ ] **Step 1: Erstelle `backend/src/index.ts`**

```typescript
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
```

- [ ] **Step 2: Prüfe ob Backend startet**

```bash
cd backend && npm run dev
```
Erwartete Ausgabe: `✅ AkquiseFlow AI Backend läuft auf Port 3001` (nach DB-Verbindung)

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: add express server entry point"
```

---

### Task 2: Datenbank-Migrationen erweitern

**Files:**
- Modify: `backend/src/db/index.ts`

- [ ] **Step 1: `initDB()` um neue Tabellen + idempotente Migrationen ergänzen**

Ersetze die gesamte `initDB()`-Funktion in `backend/src/db/index.ts`:

```typescript
export async function initDB(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    // Bestehende Tabellen
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS scans (
        id VARCHAR(36) PRIMARY KEY,
        url VARCHAR(2048) NOT NULL,
        status ENUM('pending','scanning','completed','failed') DEFAULT 'pending',
        result JSON,
        contacts JSON,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS leads (
        id VARCHAR(36) PRIMARY KEY,
        url VARCHAR(2048) NOT NULL,
        company VARCHAR(512),
        description TEXT,
        score INT DEFAULT 0,
        status ENUM('new','contacted','qualified','rejected') DEFAULT 'new',
        tags JSON,
        notes TEXT,
        scan_id VARCHAR(36),
        contact_name VARCHAR(512),
        contact_email VARCHAR(512),
        contact_phone VARCHAR(128),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_score (score)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS contacts (
        id VARCHAR(36) PRIMARY KEY,
        lead_id VARCHAR(36),
        name VARCHAR(512),
        role VARCHAR(512),
        email VARCHAR(512),
        phone VARCHAR(128),
        linkedin VARCHAR(1024),
        confidence FLOAT DEFAULT 0,
        source VARCHAR(128),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_lead (lead_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subject VARCHAR(512),
        body TEXT,
        type ENUM('cold','security','dsgvo','upgrade','custom') DEFAULT 'cold',
        variables JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(128) PRIMARY KEY,
        \`value\` TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Idempotente Migrationen für bestehende Instanzen
    const migrations = [
      `ALTER TABLE scans ADD COLUMN IF NOT EXISTS contacts JSON`,
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_name VARCHAR(512)`,
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_email VARCHAR(512)`,
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(128)`,
    ];
    for (const m of migrations) {
      await conn.execute(m).catch((err: any) => {
        // Nur ER_DUP_FIELDNAME (1060) und ER_DUP_KEYNAME ignorieren — alle anderen Fehler weiterwerfen
        if (err.errno !== 1060 && err.errno !== 1061) throw err;
      });
    }

    // Standard-E-Mail-Templates einfügen
    await conn.execute(`
      INSERT IGNORE INTO email_templates (id, name, subject, body, type) VALUES
      ('tpl-security-01', 'Sicherheitslücken entdeckt', 'Kritische Sicherheitslücken auf {{url}} entdeckt',
       'Betreff: Kritische Sicherheitslücken auf {{url}} entdeckt\n\nGuten Tag,\n\nbei einer Analyse Ihrer Website {{url}} haben wir {{cve_count}} Sicherheitslücken festgestellt, darunter kritische Schwachstellen in {{technologie}}.\n\nGerne zeigen wir Ihnen in einem kostenlosen 15-Minuten-Gespräch, wie wir diese Risiken schnell und zuverlässig beheben können.\n\nFreundliche Grüße',
       'security'),
      ('tpl-dsgvo-01', 'DSGVO-Probleme gefunden', 'DSGVO-Konformität Ihrer Website {{url}} — Handlungsbedarf',
       'Betreff: DSGVO-Konformität Ihrer Website — Handlungsbedarf\n\nGuten Tag,\n\nbei der Prüfung von {{url}} haben wir DSGVO-relevante Mängel festgestellt: {{dsgvo_problem}}.\n\nBußgelder können schnell fünfstellig werden. Wir helfen Ihnen, schnell und unkompliziert compliant zu werden.\n\nFreundliche Grüße',
       'dsgvo'),
      ('tpl-upgrade-01', 'Veraltete Technologie', 'Ihr {{technologie}} ist veraltet — Sicherheitsrisiko',
       'Betreff: Ihr {{technologie}} ist veraltet — Sicherheitsrisiko\n\nGuten Tag,\n\nIhre Website {{url}} läuft noch auf {{technologie}}, das seit einiger Zeit keine Sicherheitsupdates mehr erhält.\n\nWir unterstützen Sie bei einem reibungslosen Upgrade — ohne Ausfallzeiten.\n\nFreundliche Grüße',
       'upgrade'),
      ('tpl-cold-01', 'Allgemeine Kaltakquise', 'Ihr Webauftritt hat Potential — kurzes Gespräch?',
       'Betreff: Ihr Webauftritt hat Potential — kurzes Gespräch?\n\nGuten Tag,\n\nbei der Analyse von {{url}} sind uns interessante Optimierungsmöglichkeiten aufgefallen.\n\nGerne würde ich Ihnen in einem kostenlosen 15-Minuten-Gespräch zeigen, wie Sie Ihre Online-Präsenz und Sicherheit verbessern können.\n\nFreundliche Grüße',
       'cold')
    `);

    console.log('✅ Datenbank initialisiert');
  } finally {
    conn.release();
  }
}
```

- [ ] **Step 2: Backend neu starten und DB prüfen**

```bash
# Backend neu starten, dann:
curl http://localhost:3001/api/health
```
Erwartete Ausgabe: `{"status":"ok","timestamp":"..."}`

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/index.ts
git commit -m "feat: extend db schema with email_templates, settings, migrations"
```

---

### Task 3: TypeScript-Typen erweitern

**Files:**
- Modify: `backend/src/types/index.ts`

- [ ] **Step 1: Neue Typen ans Ende von `backend/src/types/index.ts` anfügen**

```typescript
export interface DSGVOResult {
  impressum: boolean;
  datenschutz: boolean;
  cookieConsent: boolean;
  googleAnalytics: boolean;
  facebookPixel: boolean;
  ssl: boolean;
  contactForm: boolean;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: string[];
  recommendations: string[];
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  type: 'cold' | 'security' | 'dsgvo' | 'upgrade' | 'custom';
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalScans: number;
  totalLeads: number;
  criticalCves: number;
  avgSecurityScore: number;
  scansToday: number;
  leadsNew: number;
  leadsQualified: number;
  recentScans: { id: string; url: string; status: string; createdAt: string }[];
  cveDistribution: { severity: string; count: number }[];
  topLeads: { id: string; url: string; company: string; score: number; status: string }[];
}

export interface Contact {
  id?: string;
  leadId?: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  linkedin: string;
  confidence: number;
  source: string;
}
```

- [ ] **Step 2: Auch `ScanResult` in `backend/src/types/index.ts` um `contacts` und `dsgvo` ergänzen**

Füge in das `ScanResult`-Interface hinzu:
```typescript
  contacts?: Contact[];
  dsgvo?: DSGVOResult;
  aiAnalysis?: AIAnalysis | null;
  securityScore?: SecurityScore;
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/types/index.ts
git commit -m "feat: add DSGVOResult, EmailTemplate, DashboardStats, Contact types"
```

---

## Chunk 2: Backend Services

### Task 4: DSGVO-Service

**Files:**
- Create: `backend/src/services/dsgvoService.ts`

- [ ] **Step 1: Erstelle `backend/src/services/dsgvoService.ts`**

```typescript
import type { DSGVOResult } from '../types';

export function checkDSGVO(html: string, url: string, sslValid: boolean): DSGVOResult {
  const lower = html.toLowerCase();
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Impressum (§5 TMG)
  const impressum =
    lower.includes('/impressum') ||
    lower.includes('impressum') ||
    lower.includes('/legal') ||
    lower.includes('anbieterkennzeichnung');
  if (!impressum) {
    issues.push('Kein Impressum gefunden (Pflicht nach §5 TMG)');
    recommendations.push('Impressum-Seite mit vollständigen Angaben erstellen');
  }

  // Datenschutzerklärung
  const datenschutz =
    lower.includes('/datenschutz') ||
    lower.includes('datenschutzerklärung') ||
    lower.includes('datenschutzerkl') ||
    lower.includes('/privacy') ||
    lower.includes('privacy-policy') ||
    lower.includes('datenschutz');
  if (!datenschutz) {
    issues.push('Keine Datenschutzerklärung gefunden (Art. 13 DSGVO)');
    recommendations.push('Datenschutzerklärung nach DSGVO Art. 13/14 erstellen');
  }

  // Cookie-Consent
  const cookieConsent =
    lower.includes('cookiebot') ||
    lower.includes('cookieconsent') ||
    lower.includes('usercentrics') ||
    lower.includes('borlabs') ||
    lower.includes('cookie-banner') ||
    lower.includes('cookie_notice') ||
    lower.includes('cookie-law') ||
    lower.includes('consentmanager') ||
    lower.includes('onetrust') ||
    lower.includes('didomi') ||
    lower.includes('complianz') ||
    /cookie[_-]?(accept|agree|consent|notice)/i.test(html);
  if (!cookieConsent) {
    issues.push('Kein Cookie-Consent-Banner erkannt');
    recommendations.push('Cookie-Consent-Management einrichten (z.B. Usercentrics, Borlabs)');
  }

  // Google Analytics ohne Consent
  const googleAnalytics =
    /gtag\.js|google-analytics\.com\/analytics\.js|UA-\d+-\d+|G-[A-Z0-9]+/i.test(html) && !cookieConsent;
  if (googleAnalytics) {
    issues.push('Google Analytics ohne erkennbaren Consent (DSGVO-kritisch)');
    recommendations.push('Analytics erst nach Nutzereinwilligung laden (Consent Management)');
  }

  // Facebook Pixel
  const facebookPixel =
    lower.includes('connect.facebook.net/en_us/fbevents.js') ||
    lower.includes('connect.facebook.net/de_de/fbevents.js') ||
    lower.includes('fbq(');
  if (facebookPixel && !cookieConsent) {
    issues.push('Facebook Pixel ohne erkennbaren Consent');
    recommendations.push('Facebook Pixel erst nach Einwilligung laden');
  }

  // SSL
  const ssl = url.startsWith('https://') && sslValid;
  if (!ssl) {
    issues.push('Kein gültiges SSL-Zertifikat (Pflicht für Datensicherheit)');
    recommendations.push('SSL-Zertifikat einrichten und HTTPS erzwingen');
  }

  // Kontaktformular
  const contactForm =
    /<form[^>]*>/i.test(html) &&
    /type=["']?email["']?/i.test(html);

  // Score berechnen
  let score = 100;
  if (!impressum) score -= 25;
  if (!datenschutz) score -= 25;
  if (!cookieConsent) score -= 20;
  if (googleAnalytics) score -= 15;
  if (facebookPixel && !cookieConsent) score -= 10;
  if (!ssl) score -= 15;
  score = Math.max(0, score);

  const grade =
    score >= 90 ? 'A' :
    score >= 70 ? 'B' :
    score >= 50 ? 'C' :
    score >= 30 ? 'D' : 'F';

  return {
    impressum,
    datenschutz,
    cookieConsent,
    googleAnalytics,
    facebookPixel,
    ssl,
    contactForm,
    score,
    grade,
    issues,
    recommendations,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/dsgvoService.ts
git commit -m "feat: add DSGVO compliance checker service"
```

---

### Task 5: CVE-Service um CIRCL + OSV erweitern

**Files:**
- Modify: `backend/src/services/cveService.ts`

- [ ] **Step 1: CIRCL-Funktion an `backend/src/services/cveService.ts` anfügen**

Füge nach den bestehenden Importen und vor `checkCVEs` ein:

```typescript
// Mapping von Technologienamen zu CIRCL vendor/product
const CIRCL_MAP: Record<string, { vendor: string; product: string }> = {
  wordpress: { vendor: 'wordpress', product: 'wordpress' },
  joomla: { vendor: 'joomla', product: 'joomla' },
  drupal: { vendor: 'drupal', product: 'drupal' },
  apache: { vendor: 'apache', product: 'http_server' },
  nginx: { vendor: 'nginx', product: 'nginx' },
  php: { vendor: 'php', product: 'php' },
  jquery: { vendor: 'jquery', product: 'jquery' },
  bootstrap: { vendor: 'twitter', product: 'bootstrap' },
  laravel: { vendor: 'laravel', product: 'laravel' },
  symfony: { vendor: 'sensiolabs', product: 'symfony' },
};

async function fetchCVEsFromCIRCL(techName: string, version?: string): Promise<CVEResult[]> {
  try {
    const key = techName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const mapping = CIRCL_MAP[key];
    if (!mapping) return []; // Kein bekanntes Mapping — überspringen
    const { vendor, product } = mapping;
    const url = `https://cve.circl.lu/api/search/${encodeURIComponent(vendor)}/${encodeURIComponent(product)}`;
    const response = await axios.get(url, { timeout: 8000 });
    const items = Array.isArray(response.data) ? response.data : [];
    return items.slice(0, 5).map((item: Record<string, unknown>) => ({
      id: String(item.id || item.cve || ''),
      description: String(item.summary || '').substring(0, 500),
      severity: severityFromScore(Number(item.cvss || 0)),
      cvssScore: Number(item.cvss || 0),
      publishedDate: String(item.Published || ''),
      technology: techName,
      version,
      url: `https://cve.circl.lu/cve/${item.id}`,
    }));
  } catch {
    return [];
  }
}

// OSV-Ecosystem-Mapping
const OSV_ECOSYSTEM: Record<string, string> = {
  wordpress: 'Packagist', joomla: 'Packagist', drupal: 'Packagist',
  laravel: 'Packagist', symfony: 'Packagist',
  jquery: 'npm', react: 'npm', vue: 'npm', angular: 'npm',
  'next.js': 'npm', nuxt: 'npm', bootstrap: 'npm',
};

async function fetchCVEsFromOSV(techName: string, version?: string): Promise<CVEResult[]> {
  try {
    const ecosystem = OSV_ECOSYSTEM[techName.toLowerCase()] || null;
    // Ohne bekanntes Ecosystem nur Keyword-Query, kein package-basierter Query
    const body = version && ecosystem
      ? { version, package: { name: techName.toLowerCase(), ecosystem } }
      : { query: techName };
    const response = await axios.post('https://api.osv.dev/v1/query', body, { timeout: 8000 });
    const vulns = response.data?.vulns || [];
    return vulns.slice(0, 5).map((v: Record<string, unknown>) => {
      const severity = (v.severity as { score?: string }[])?.[0];
      const score = severity?.score ? parseFloat(severity.score) : 0;
      return {
        id: String(v.id || ''),
        description: String((v.summary as string) || '').substring(0, 500),
        severity: severityFromScore(score),
        cvssScore: score,
        publishedDate: String(v.published || ''),
        technology: techName,
        version,
        url: `https://osv.dev/vulnerability/${v.id}`,
      };
    });
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: `fetchCVEsForTech` in `cveService.ts` anpassen um alle 3 Quellen zu nutzen**

Ersetze den return-Teil von `fetchCVEsForTech` (nach dem NVD-Fetch):

```typescript
    // NVD-Ergebnisse sind bereits in `results`
    // Zusätzlich CIRCL + OSV parallel abfragen
    const [circlResults, osvResults] = await Promise.all([
      fetchCVEsFromCIRCL(techName, version),
      fetchCVEsFromOSV(techName, version),
    ]);

    // Deduplizieren nach CVE-ID
    const seen = new Set<string>();
    const combined: CVEResult[] = [];
    for (const cve of [...results, ...circlResults, ...osvResults]) {
      if (cve.id && !seen.has(cve.id)) {
        seen.add(cve.id);
        combined.push(cve);
      }
    }

    const sorted = combined.sort((a, b) => (b.cvssScore || 0) - (a.cvssScore || 0));
    cache.set(cacheKey, { data: sorted, expires: Date.now() + CACHE_TTL });
    return sorted;
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/cveService.ts
git commit -m "feat: add CIRCL and OSV.dev as additional CVE sources"
```

---

### Task 6: DSGVO in Scanner integrieren

**Files:**
- Modify: `backend/src/routes/scan.ts`

- [ ] **Step 1: DSGVO-Import und Integration in `backend/src/routes/scan.ts`**

Füge oben bei den Importen hinzu (prüfe ob `https` bereits importiert ist — falls nicht, ergänzen):
```typescript
import https from 'https'; // falls noch nicht vorhanden
import { checkDSGVO } from '../services/dsgvoService';
```

Füge im Scan-Hintergrundprozess nach dem Kontakte-Block ein:
```typescript
        // DSGVO-Check
        try {
          const htmlForDsgvo = await axios.get(
            url.startsWith('http') ? url : `https://${url}`,
            { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' },
              httpsAgent: new https.Agent({ rejectUnauthorized: false }),
              validateStatus: () => true }
          );
          const htmlContent = typeof htmlForDsgvo.data === 'string' ? htmlForDsgvo.data : '';
          result.dsgvo = checkDSGVO(htmlContent, url.startsWith('http') ? url : `https://${url}`, result.ssl?.valid ?? false);
        } catch { /* DSGVO optional */ }
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/scan.ts backend/src/services/dsgvoService.ts
git commit -m "feat: integrate DSGVO check into scan pipeline"
```

---

## Chunk 3: Backend Routes

### Task 7: Dashboard Stats Route

**Files:**
- Create: `backend/src/routes/dashboard.ts`

- [ ] **Step 1: Erstelle `backend/src/routes/dashboard.ts`**

```typescript
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

    // Kritische CVEs aus allen completed Scans
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
```

- [ ] **Step 2: Testen**

```bash
curl http://localhost:3001/api/dashboard/stats
```
Erwartete Ausgabe: JSON mit `totalScans`, `totalLeads`, etc.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/dashboard.ts
git commit -m "feat: add dashboard stats endpoint"
```

---

### Task 8: E-Mail-Templates Route

**Files:**
- Create: `backend/src/routes/emailTemplates.ts`

- [ ] **Step 1: Erstelle `backend/src/routes/emailTemplates.ts`**

```typescript
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { generateColdEmail } from '../services/openrouterService';

const router = Router();

// GET alle Templates
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM email_templates ORDER BY type, name');
    res.json(rows);
  } catch (err) { next(err); }
});

// POST neues Template
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

// PUT Template aktualisieren
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

// DELETE Template — Standard-Templates sind schreibgeschützt
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

// POST /generate — KI-Email generieren
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

// POST /render — Template mit Variablen rendern
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
```

- [ ] **Step 2: Testen**

```bash
curl http://localhost:3001/api/email-templates
```
Erwartete Ausgabe: Array mit 4 Standard-Templates

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/emailTemplates.ts
git commit -m "feat: add email templates CRUD and AI generation endpoint"
```

---

### Task 9: Settings + Leads-Export Route

**Files:**
- Create: `backend/src/routes/settings.ts`
- Modify: `backend/src/routes/leads.ts`

- [ ] **Step 1: Erstelle `backend/src/routes/settings.ts`**

```typescript
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
    // Env-Defaults für nicht in DB gespeicherte Werte
    if (!settings.OPENROUTER_MODEL) settings.OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
    if (!settings.SCANNER_TIMEOUT_MS) settings.SCANNER_TIMEOUT_MS = process.env.SCANNER_TIMEOUT_MS || '15000';
    if (!settings.MAX_CONCURRENT_SCANS) settings.MAX_CONCURRENT_SCANS = process.env.MAX_CONCURRENT_SCANS || '5';
    // DB-Info (read-only)
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
      // Auch process.env aktualisieren damit der laufende Server die Keys nutzt
      if (key !== 'brave_requests_used') process.env[key] = String(value);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
```

- [ ] **Step 2: CSV-Export zu `backend/src/routes/leads.ts` hinzufügen**

**WICHTIG:** Route `/export` muss VOR `/:id` registriert werden, sonst wird "export" als ID interpretiert. Füge den Block unmittelbar vor dem ersten `router.get('/:id', ...)` ein:

```typescript
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
    res.send('\uFEFF' + csv); // BOM für Excel
  } catch (err) { next(err); }
});
```

- [ ] **Step 3: Testen**

```bash
curl http://localhost:3001/api/settings
curl "http://localhost:3001/api/leads/export" -o leads.csv
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/settings.ts backend/src/routes/leads.ts
git commit -m "feat: add settings endpoint and leads CSV export"
```

---

## Chunk 4: Frontend Foundation

### Task 10: Frontend Setup (main.tsx, App.tsx, Tailwind)

**Files:**
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/index.css`

- [ ] **Step 1: Erstelle `frontend/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-[#020817] text-slate-100 font-sans antialiased;
  }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { @apply bg-[#0a1628]; }
  ::-webkit-scrollbar-thumb { @apply bg-slate-600 rounded-full; }
}
```

- [ ] **Step 2: Erstelle `frontend/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
```

- [ ] **Step 3: Erstelle `frontend/src/App.tsx`**

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import TopNav from './components/Layout/TopNav';
import Dashboard from './pages/Dashboard';
import Scanner from './pages/Scanner';
import Leads from './pages/Leads';
import EmailTemplates from './pages/EmailTemplates';
import Settings from './pages/Settings';

export default function App() {
  return (
    <div className="min-h-screen bg-[#020817]">
      <TopNav />
      <main className="max-w-[1400px] mx-auto px-6 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/scanner" element={<Scanner />} />
          <Route path="/scanner/:id" element={<Scanner />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/email" element={<EmailTemplates />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: `frontend/index.html` prüfen** — muss `<div id="root">` und `<script type="module" src="/src/main.tsx">` enthalten. Falls nicht vorhanden:

```html
<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AkquiseFlow AI</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: `frontend/tailwind.config.js` prüfen** — content-Array muss `./src/**/*.{tsx,ts}` enthalten.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/main.tsx frontend/src/App.tsx frontend/src/index.css
git commit -m "feat: bootstrap React app with routing and QueryClient"
```

---

### Task 11: API Client + Type Definitions

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/index.ts`
- Create: `frontend/src/types/index.ts`

- [ ] **Step 1: Erstelle `frontend/src/types/index.ts`**

```typescript
export interface ScanResult {
  id: string;
  url: string;
  status: 'pending' | 'scanning' | 'completed' | 'failed';
  result?: {
    technologies: Technology[];
    ssl: SSLInfo | null;
    headers: HeaderAnalysis;
    cves: CVEResult[];
    dsgvo?: DSGVOResult;
    aiAnalysis?: AIAnalysis | null;
    contacts?: Contact[];
    metadata: SiteMetadata;
    securityScore: SecurityScore;
  };
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface Technology {
  name: string; version?: string; category: string; confidence: number; cveCount?: number;
}
export interface SSLInfo {
  valid: boolean; issuer: string; grade: 'A'|'B'|'C'|'D'|'F'; daysUntilExpiry: number;
  validTo: string; protocol: string; selfSigned: boolean; expired: boolean;
}
export interface HeaderAnalysis {
  score: number; missing: string[]; present: string[]; recommendations: string[];
}
export interface CVEResult {
  id: string; description: string; severity: 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'NONE';
  cvssScore: number; publishedDate: string; technology: string; version?: string;
}
export interface DSGVOResult {
  impressum: boolean; datenschutz: boolean; cookieConsent: boolean;
  googleAnalytics: boolean; facebookPixel: boolean; ssl: boolean; contactForm: boolean;
  score: number; grade: 'A'|'B'|'C'|'D'|'F'; issues: string[]; recommendations: string[];
}
export interface AIAnalysis {
  summary: string; opportunities: string[]; risks: string[];
  recommendations: string[]; pitch: string; score: number; model: string;
}
export interface Contact {
  name: string; role: string; email: string; phone: string; linkedin: string;
  confidence: number; source: string;
}
export interface SiteMetadata {
  title: string; description: string; favicon: string; cms: string;
  language: string; responseTime: number; statusCode: number;
}
export interface SecurityScore {
  overall: number; ssl: number; headers: number; cve: number; grade: 'A'|'B'|'C'|'D'|'F';
}
export interface Lead {
  id: string; url: string; company: string; description: string; score: number;
  status: 'new'|'contacted'|'qualified'|'rejected'; tags: string[];
  notes: string; scan_id?: string; contact_name?: string; contact_email?: string;
  contact_phone?: string; created_at: string;
}
export interface EmailTemplate {
  id: string; name: string; subject: string; body: string;
  type: 'cold'|'security'|'dsgvo'|'upgrade'|'custom'; variables: string[];
  created_at: string; updated_at: string;
}
export interface DashboardStats {
  totalScans: number; totalLeads: number; criticalCves: number;
  avgSecurityScore: number; scansToday: number; leadsNew: number; leadsQualified: number;
  recentScans: { id: string; url: string; status: string; createdAt: string }[];
  cveDistribution: { severity: string; count: number }[];
  topLeads: { id: string; url: string; company: string; score: number; status: string }[];
}
```

- [ ] **Step 2: Erstelle `frontend/src/api/client.ts`**

```typescript
import axios from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:3001/api',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg = err.response?.data?.error || err.message || 'Unbekannter Fehler';
    return Promise.reject(new Error(msg));
  }
);

export default client;
```

- [ ] **Step 3: Erstelle `frontend/src/api/index.ts`**

```typescript
import client from './client';
import type { ScanResult, Lead, EmailTemplate, DashboardStats } from '../types';

// --- Dashboard ---
export const getDashboardStats = () =>
  client.get<DashboardStats>('/dashboard/stats').then(r => r.data);

// --- Scans ---
export const startScan = (url: string, options = {}) =>
  client.post<{ id: string; url: string; status: string }>('/scans', { url, options }).then(r => r.data);
export const getScan = (id: string) =>
  client.get<ScanResult>(`/scans/${id}`).then(r => r.data);
export const getScans = (page = 1, limit = 20) =>
  client.get<{ scans: ScanResult[]; total: number }>('/scans', { params: { page, limit } }).then(r => r.data);
export const deleteScan = (id: string) =>
  client.delete(`/scans/${id}`).then(r => r.data);
export const analyzeScan = (id: string) =>
  client.post(`/scans/${id}/analyze`).then(r => r.data);

// --- Leads ---
export const getLeads = (params?: { status?: string; page?: number; limit?: number }) =>
  client.get<{ leads: Lead[]; total: number }>('/leads', { params }).then(r => r.data);
export const createLead = (data: Partial<Lead>) =>
  client.post<Lead>('/leads', data).then(r => r.data);
export const updateLead = (id: string, data: Partial<Lead>) =>
  client.put(`/leads/${id}`, data).then(r => r.data);
export const deleteLead = (id: string) =>
  client.delete(`/leads/${id}`).then(r => r.data);
export const searchLeads = (query: string, industry?: string, location?: string) =>
  client.post<{ leads: Lead[]; total: number }>('/leads/search', { query, industry, location, maxResults: 20 }).then(r => r.data);
export const generateLeadEmail = (id: string, scanSummary?: string) =>
  client.post<{ email: string }>(`/leads/${id}/email`, { scanSummary }).then(r => r.data);
export const exportLeadsCSV = (status?: string) => {
  const params = status ? `?status=${status}` : '';
  window.open(`http://localhost:3001/api/leads/export${params}`, '_blank');
};

// --- Email Templates ---
export const getEmailTemplates = () =>
  client.get<EmailTemplate[]>('/email-templates').then(r => r.data);
export const createEmailTemplate = (data: Partial<EmailTemplate>) =>
  client.post<EmailTemplate>('/email-templates', data).then(r => r.data);
export const updateEmailTemplate = (id: string, data: Partial<EmailTemplate>) =>
  client.put(`/email-templates/${id}`, data).then(r => r.data);
export const deleteEmailTemplate = (id: string) =>
  client.delete(`/email-templates/${id}`).then(r => r.data);
export const generateEmail = (url: string, company?: string, scanSummary?: string) =>
  client.post<{ email: string }>('/email-templates/generate', { url, company, scanSummary }).then(r => r.data);
export const renderTemplate = (templateId: string, variables: Record<string, string>) =>
  client.post<{ subject: string; body: string }>('/email-templates/render', { templateId, variables }).then(r => r.data);

// --- Settings ---
export const getSettings = () =>
  client.get<Record<string, string>>('/settings').then(r => r.data);
export const saveSettings = (settings: Record<string, string>) =>
  client.put('/settings', settings).then(r => r.data);
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/ frontend/src/api/
git commit -m "feat: add frontend TypeScript types and API client"
```

---

### Task 12: UI-Komponenten

**Files:**
- Create: `frontend/src/components/Layout/TopNav.tsx`
- Create: `frontend/src/components/ui/Badge.tsx`
- Create: `frontend/src/components/ui/Card.tsx`
- Create: `frontend/src/components/ui/Spinner.tsx`
- Create: `frontend/src/components/charts/CVEChart.tsx`
- Create: `frontend/src/components/charts/ScoreGauge.tsx`

- [ ] **Step 1: Erstelle `frontend/src/components/Layout/TopNav.tsx`**

```tsx
import { NavLink } from 'react-router-dom';
import { Shield, Search, Users, Mail, Settings, Zap } from 'lucide-react';

const TABS = [
  { to: '/dashboard', label: 'Dashboard', icon: Zap },
  { to: '/scanner', label: 'Scanner', icon: Search },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/email', label: 'E-Mail', icon: Mail },
  { to: '/settings', label: 'Einstellungen', icon: Settings },
];

export default function TopNav() {
  return (
    <nav className="bg-[#0a1628] border-b border-[#1a2540] sticky top-0 z-50">
      <div className="max-w-[1400px] mx-auto px-6 flex items-center h-[52px] gap-1">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-700 to-cyan-500 flex items-center justify-center">
            <Shield size={16} className="text-white" />
          </div>
          <span className="font-bold text-[15px] bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            AkquiseFlow AI
          </span>
        </div>
        {/* Tabs */}
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 h-[52px] text-[13px] border-b-2 transition-colors ${
                isActive
                  ? 'text-cyan-400 border-cyan-400'
                  : 'text-slate-500 border-transparent hover:text-slate-300'
              }`
            }
          >
            <Icon size={14} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Erstelle `frontend/src/components/ui/Badge.tsx`**

```tsx
import { clsx } from 'clsx';

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
type Status = 'new' | 'contacted' | 'qualified' | 'rejected';

const SEVERITY_CLASSES: Record<Severity, string> = {
  CRITICAL: 'bg-red-950 text-red-400 border border-red-800',
  HIGH: 'bg-orange-950 text-orange-400 border border-orange-800',
  MEDIUM: 'bg-yellow-950 text-yellow-400 border border-yellow-800',
  LOW: 'bg-slate-800 text-slate-400 border border-slate-700',
  NONE: 'bg-slate-900 text-slate-500 border border-slate-800',
};

const STATUS_CLASSES: Record<Status, string> = {
  new: 'bg-blue-950 text-blue-400 border border-blue-800',
  contacted: 'bg-green-950 text-green-400 border border-green-800',
  qualified: 'bg-purple-950 text-purple-400 border border-purple-800',
  rejected: 'bg-slate-800 text-slate-500 border border-slate-700',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-semibold', SEVERITY_CLASSES[severity])}>
      {severity}
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  const labels: Record<Status, string> = { new: 'Neu', contacted: 'Kontaktiert', qualified: 'Qualifiziert', rejected: 'Abgelehnt' };
  return (
    <span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-medium', STATUS_CLASSES[status])}>
      {labels[status]}
    </span>
  );
}

export function GradeBadge({ grade }: { grade: 'A' | 'B' | 'C' | 'D' | 'F' }) {
  const classes = { A: 'text-green-400', B: 'text-cyan-400', C: 'text-yellow-400', D: 'text-orange-400', F: 'text-red-400' };
  return <span className={clsx('font-bold text-lg', classes[grade])}>{grade}</span>;
}
```

- [ ] **Step 3: Erstelle `frontend/src/components/ui/Card.tsx`**

```tsx
import { clsx } from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  accent?: 'blue' | 'green' | 'red' | 'purple' | 'cyan';
}

const ACCENT_CLASSES = {
  blue: 'before:bg-gradient-to-r before:from-blue-700 before:to-cyan-500',
  green: 'before:bg-gradient-to-r before:from-emerald-600 before:to-green-400',
  red: 'before:bg-gradient-to-r before:from-red-700 before:to-orange-500',
  purple: 'before:bg-gradient-to-r before:from-purple-700 before:to-violet-400',
  cyan: 'before:bg-gradient-to-r before:from-cyan-600 before:to-blue-400',
};

export function Card({ children, className, accent }: CardProps) {
  return (
    <div className={clsx(
      'bg-[#0a1628] border border-[#1a2540] rounded-xl overflow-hidden relative',
      accent && 'before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px]',
      accent && ACCENT_CLASSES[accent],
      className
    )}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a2540]">
      <h3 className="font-semibold text-[13px] text-slate-200">{title}</h3>
      {action}
    </div>
  );
}

export function StatCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent: CardProps['accent'];
}) {
  return (
    <Card accent={accent} className="p-5">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">{label}</div>
      <div className="text-3xl font-bold text-slate-100 mb-1">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </Card>
  );
}
```

- [ ] **Step 4: Erstelle `frontend/src/components/ui/Spinner.tsx`**

```tsx
import { clsx } from 'clsx';

export default function Spinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };
  return (
    <div className={clsx('border-2 border-slate-700 border-t-cyan-400 rounded-full animate-spin', sizes[size], className)} />
  );
}
```

- [ ] **Step 5: Erstelle `frontend/src/components/charts/CVEChart.tsx`**

```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS: Record<string, string> = {
  CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#94a3b8',
};

export default function CVEChart({ data }: { data: { severity: string; count: number }[] }) {
  if (!data.length) return <div className="text-slate-500 text-sm p-4 text-center">Keine CVE-Daten</div>;
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
        <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="severity" tick={{ fill: '#94a3b8', fontSize: 11 }} width={65} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: '#0a1628', border: '1px solid #1a2540', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: '#e2e8f0' }}
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell key={entry.severity} fill={COLORS[entry.severity] || '#64748b'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 6: Erstelle `frontend/src/components/charts/ScoreGauge.tsx`**

```tsx
import { clsx } from 'clsx';

export default function ScoreGauge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const grade = score >= 90 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : score >= 30 ? 'D' : 'F';
  const color = score >= 70 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : score >= 30 ? 'text-orange-400' : 'text-red-400';
  const sizes = { sm: 'text-2xl', md: 'text-4xl', lg: 'text-6xl' };
  return (
    <div className="flex flex-col items-center">
      <div className={clsx('font-bold', color, sizes[size])}>{score}</div>
      <div className={clsx('font-bold text-sm', color)}>Grade {grade}</div>
    </div>
  );
}
```

- [ ] **Step 7: Frontend starten und prüfen**

```bash
cd frontend && npm install && npm run dev
```
Erwartete Ausgabe: Vite dev server auf `http://localhost:5173` — Navigation sichtbar, keine Konsolenfehler

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ frontend/src/
git commit -m "feat: add UI components, TopNav, charts"
```

---

## Chunk 5: Frontend Pages

### Task 13: Dashboard Page

**Files:**
- Create: `frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Erstelle `frontend/src/pages/Dashboard.tsx`**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats, startScan } from '../api';
import { StatCard, Card, CardHeader } from '../components/ui/Card';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge';
import CVEChart from '../components/charts/CVEChart';
import Spinner from '../components/ui/Spinner';

export default function Dashboard() {
  const [url, setUrl] = useState('');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: stats, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: getDashboardStats, refetchInterval: 15_000 });

  const scanMutation = useMutation({
    mutationFn: (u: string) => startScan(u, { scanCVE: true, aiAnalysis: true }),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['dashboard'] }); navigate(`/scanner/${data.id}`); },
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Scans gesamt" value={stats?.totalScans ?? 0} sub={`+${stats?.scansToday ?? 0} heute`} accent="blue" />
        <StatCard label="Leads gefunden" value={stats?.totalLeads ?? 0} sub={`${stats?.leadsQualified ?? 0} qualifiziert`} accent="green" />
        <StatCard label="Kritische CVEs" value={stats?.criticalCves ?? 0} sub="Über alle Scans" accent="red" />
        <StatCard label="Ø Sicherheits-Score" value={stats?.avgSecurityScore ?? 0} sub="von 100 Punkten" accent="purple" />
      </div>

      {/* Quick Scan */}
      <Card className="p-4">
        <div className="flex gap-3 items-center">
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && url && scanMutation.mutate(url)}
            placeholder="https://example.com scannen..."
            className="flex-1 bg-[#0f1f38] border border-[#1a2540] rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600"
          />
          <button
            onClick={() => url && scanMutation.mutate(url)}
            disabled={!url || scanMutation.isPending}
            className="px-4 py-2.5 bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-600 hover:to-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {scanMutation.isPending ? <Spinner size="sm" /> : null}
            Scan starten →
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-[1fr_360px] gap-4">
        {/* Letzte Scans */}
        <Card>
          <CardHeader title="Letzte Scans" action={
            <button onClick={() => navigate('/scanner')} className="text-[11px] text-slate-500 hover:text-cyan-400 border border-[#1a2540] px-2 py-1 rounded">Alle anzeigen</button>
          } />
          <div>
            {stats?.recentScans?.length === 0 && (
              <div className="text-slate-600 text-sm text-center py-8">Noch keine Scans — URL oben eingeben</div>
            )}
            {stats?.recentScans?.map(scan => (
              <div key={scan.id} onClick={() => navigate(`/scanner/${scan.id}`)}
                className="flex items-center gap-3 px-5 py-3 border-b border-[#0f1f38] hover:bg-[#0d1f3a] cursor-pointer">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${scan.status === 'completed' ? 'bg-green-400' : scan.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'}`} />
                <span className="flex-1 text-sm text-slate-300 truncate">{scan.url}</span>
                <span className={`text-[11px] ${scan.status === 'completed' ? 'text-green-400' : scan.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>
                  {scan.status === 'completed' ? '✓' : scan.status === 'failed' ? '✗' : '⟳'}
                </span>
                <span className="text-[11px] text-slate-600">{new Date(scan.createdAt).toLocaleDateString('de-DE')}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Right column */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="CVE Verteilung" />
            <div className="p-3">
              <CVEChart data={stats?.cveDistribution ?? []} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Top Leads" action={
              <button onClick={() => navigate('/leads')} className="text-[11px] text-slate-500 hover:text-cyan-400 border border-[#1a2540] px-2 py-1 rounded">Alle</button>
            } />
            {stats?.topLeads?.map(lead => (
              <div key={lead.id} onClick={() => navigate('/leads')}
                className="flex items-center gap-3 px-4 py-3 border-b border-[#0f1f38] hover:bg-[#0d1f3a] cursor-pointer">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-200 truncate">{lead.company || lead.url}</div>
                  <div className="text-[11px] text-blue-400 truncate">{lead.url}</div>
                </div>
                <StatusBadge status={lead.status as any} />
                <span className="text-sm font-bold text-cyan-400 w-8 text-right">{lead.score}</span>
              </div>
            ))}
            {!stats?.topLeads?.length && (
              <div className="text-slate-600 text-sm text-center py-6">Noch keine Leads</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Im Browser prüfen** — `http://localhost:5173/dashboard` — KPIs sichtbar, Quick-Scan funktioniert

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Dashboard.tsx
git commit -m "feat: add Dashboard page with KPIs, recent scans, CVE chart"
```

---

### Task 14: Scanner Page

**Files:**
- Create: `frontend/src/pages/Scanner.tsx`

- [ ] **Step 1: Erstelle `frontend/src/pages/Scanner.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startScan, getScan, createLead } from '../api';
import { Card, CardHeader } from '../components/ui/Card';
import { SeverityBadge, GradeBadge } from '../components/ui/Badge';
import ScoreGauge from '../components/charts/ScoreGauge';
import Spinner from '../components/ui/Spinner';

const STEPS = ['Verbinde', 'Technologien', 'CVEs', 'DSGVO', 'KI-Analyse', 'Fertig'];

function getStep(scan: any): number {
  if (!scan) return 0;
  if (scan.status === 'failed') return -1;
  if (scan.status === 'scanning') {
    if (!scan.result) return 1;
    if (!scan.result.cves?.length && !scan.result.technologies?.length) return 1;
    if (!scan.result.dsgvo) return 3;
    if (!scan.result.aiAnalysis) return 4;
    return 4;
  }
  if (scan.status === 'completed') return 5;
  return 0;
}

export default function Scanner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  const scanQuery = useQuery({
    queryKey: ['scan', id],
    queryFn: () => getScan(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'scanning' || status === 'pending' ? 2000 : false;
    },
  });

  const scan = scanQuery.data;
  const result = scan?.result;
  const step = getStep(scan);

  const scanMutation = useMutation({
    mutationFn: (u: string) => startScan(u, { scanCVE: true, aiAnalysis: true }),
    onSuccess: (data) => navigate(`/scanner/${data.id}`),
  });

  const saveAsLead = useMutation({
    mutationFn: () => createLead({ url: scan!.url, company: result?.metadata.title, description: result?.aiAnalysis?.summary, score: result?.securityScore?.overall, scan_id: id }),
    onSuccess: () => navigate('/leads'),
  });

  return (
    <div className="space-y-4">
      {/* URL Input */}
      {!id && (
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Website scannen</h2>
          <div className="flex gap-3">
            <input value={url} onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && url && scanMutation.mutate(url)}
              placeholder="https://example.com"
              className="flex-1 bg-[#0f1f38] border border-[#1a2540] rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600"
            />
            <button onClick={() => url && scanMutation.mutate(url)} disabled={!url || scanMutation.isPending}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-700 to-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
              {scanMutation.isPending ? <Spinner size="sm" /> : null} Scan starten
            </button>
          </div>
        </Card>
      )}

      {/* Progress */}
      {id && scan?.status === 'scanning' && (
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <Spinner />
            <span className="text-sm text-slate-300">Scanne {scan.url}…</span>
          </div>
          <div className="flex gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className={`flex-1 text-center text-[11px] py-1 rounded ${i < step ? 'bg-green-900 text-green-400' : i === step ? 'bg-blue-900 text-blue-400 animate-pulse' : 'bg-[#0f1f38] text-slate-600'}`}>
                {i < step ? '✓' : ''} {s}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Error */}
      {scan?.status === 'failed' && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-400 text-sm">
          ✗ Scan fehlgeschlagen: {scan.error_message}
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Header */}
          <Card className="p-5">
            <div className="flex items-start gap-5">
              <ScoreGauge score={result.securityScore?.overall ?? 0} size="lg" />
              <div className="flex-1">
                <div className="font-semibold text-lg text-slate-100">{result.metadata?.title || scan?.url}</div>
                <div className="text-sm text-blue-400 mb-2">{scan?.url}</div>
                <div className="text-sm text-slate-400">{result.metadata?.description}</div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {result.technologies?.slice(0, 6).map(t => (
                    <span key={t.name} className="bg-[#1e3a5f] text-sky-300 text-[11px] px-2 py-0.5 rounded">
                      {t.name}{t.version ? ` ${t.version}` : ''}{t.cveCount ? ` (${t.cveCount} CVEs)` : ''}
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={() => saveAsLead.mutate()} disabled={saveAsLead.isPending}
                className="px-4 py-2 bg-gradient-to-r from-emerald-700 to-emerald-600 text-white text-sm font-medium rounded-lg">
                Als Lead speichern
              </button>
            </div>
          </Card>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-[#1a2540]">
            {['overview', 'technologies', 'cves', 'dsgvo', 'contacts', 'ai'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-[13px] border-b-2 -mb-px transition-colors capitalize ${activeTab === tab ? 'text-cyan-400 border-cyan-400' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
                {tab === 'cves' ? `CVEs (${result.cves?.length ?? 0})` :
                 tab === 'contacts' ? `Kontakte (${result.contacts?.length ?? 0})` :
                 tab === 'ai' ? 'KI-Analyse' :
                 tab === 'dsgvo' ? 'DSGVO' :
                 tab === 'overview' ? 'Übersicht' :
                 tab === 'technologies' ? 'Technologien' : tab}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="text-[11px] uppercase text-slate-500 mb-3">SSL-Zertifikat</div>
                {result.ssl ? (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-slate-400">Grade</span><GradeBadge grade={result.ssl.grade as any} /></div>
                    <div className="flex justify-between"><span className="text-slate-400">Läuft ab in</span><span className={result.ssl.daysUntilExpiry < 30 ? 'text-red-400' : 'text-green-400'}>{result.ssl.daysUntilExpiry}d</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Protokoll</span><span className="text-slate-300">{result.ssl.protocol}</span></div>
                  </div>
                ) : <div className="text-slate-600 text-sm">Kein SSL</div>}
              </Card>
              <Card className="p-4">
                <div className="text-[11px] uppercase text-slate-500 mb-3">Security Header</div>
                <div className="text-3xl font-bold text-slate-100 mb-1">{result.headers?.score ?? 0}<span className="text-sm text-slate-500">/100</span></div>
                {result.headers?.missing?.slice(0, 3).map(h => (
                  <div key={h} className="text-[11px] text-red-400">✗ {h}</div>
                ))}
              </Card>
              <Card className="p-4">
                <div className="text-[11px] uppercase text-slate-500 mb-3">Performance</div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-slate-400">Antwortzeit</span><span className="text-slate-300">{result.metadata?.responseTime}ms</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Status</span><span className="text-green-400">{result.metadata?.statusCode}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">CMS</span><span className="text-slate-300">{result.metadata?.cms || '–'}</span></div>
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'technologies' && (
            <Card>
              <CardHeader title="Erkannte Technologien" />
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[#1a2540]">
                  {['Name', 'Version', 'Kategorie', 'Konfidenz', 'CVEs'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] uppercase text-slate-500">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {result.technologies?.map(t => (
                    <tr key={t.name} className="border-b border-[#0f1f38] hover:bg-[#0d1f3a]">
                      <td className="px-5 py-3 font-medium text-slate-200">{t.name}</td>
                      <td className="px-5 py-3 text-slate-400">{t.version || '–'}</td>
                      <td className="px-5 py-3"><span className="bg-[#1e3a5f] text-sky-300 text-[10px] px-2 py-0.5 rounded">{t.category}</span></td>
                      <td className="px-5 py-3 text-slate-400">{t.confidence}%</td>
                      <td className="px-5 py-3"><span className={t.cveCount ? 'text-red-400 font-semibold' : 'text-slate-500'}>{t.cveCount ?? 0}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {activeTab === 'cves' && (
            <Card>
              <CardHeader title={`CVEs (${result.cves?.length ?? 0})`} />
              {result.cves?.length === 0 ? (
                <div className="text-center py-8 text-green-400">✓ Keine bekannten CVEs gefunden</div>
              ) : (
                <div>
                  {result.cves?.map(cve => (
                    <div key={cve.id} className="px-5 py-4 border-b border-[#0f1f38]">
                      <div className="flex items-center gap-3 mb-2">
                        <SeverityBadge severity={cve.severity} />
                        <span className="font-mono text-[12px] text-blue-400">{cve.id}</span>
                        <span className="text-[11px] text-slate-500">{cve.technology}{cve.version ? ` ${cve.version}` : ''}</span>
                        <span className="ml-auto font-semibold text-sm text-slate-300">CVSS {cve.cvssScore}</span>
                      </div>
                      <div className="text-[12px] text-slate-400">{cve.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {activeTab === 'dsgvo' && result.dsgvo && (
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-200">DSGVO-Score</h3>
                  <ScoreGauge score={result.dsgvo.score} />
                </div>
                <div className="space-y-2">
                  {([['impressum', 'Impressum'], ['datenschutz', 'Datenschutzerklärung'], ['cookieConsent', 'Cookie-Consent'],
                    ['ssl', 'SSL/HTTPS'], ['contactForm', 'Kontaktformular']] as const).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <span className={result.dsgvo![key] ? 'text-green-400' : 'text-red-400'}>{result.dsgvo![key] ? '✓' : '✗'}</span>
                      <span className="text-slate-300">{label}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-sm">
                    <span className={result.dsgvo.googleAnalytics ? 'text-yellow-400' : 'text-green-400'}>{result.dsgvo.googleAnalytics ? '⚠' : '✓'}</span>
                    <span className="text-slate-300">Google Analytics {result.dsgvo.googleAnalytics ? '(ohne Consent!)' : '(OK)'}</span>
                  </div>
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="font-semibold text-slate-200 mb-3">Probleme & Empfehlungen</h3>
                {result.dsgvo.issues.map(i => <div key={i} className="text-sm text-red-400 mb-1.5">✗ {i}</div>)}
                {result.dsgvo.recommendations.map(r => <div key={r} className="text-sm text-cyan-400 mb-1.5">→ {r}</div>)}
                {!result.dsgvo.issues.length && <div className="text-green-400 text-sm">✓ Keine DSGVO-Probleme gefunden</div>}
              </Card>
            </div>
          )}

          {activeTab === 'contacts' && (
            <Card>
              <CardHeader title="Ansprechpartner" />
              <div className="px-5 py-2 text-[11px] text-slate-600 border-b border-[#0f1f38]">
                ⚠ Kontaktdaten nur für einmalige Geschäftsanbahnung verwenden (Art. 6 Abs. 1 lit. f DSGVO)
              </div>
              {!result.contacts?.length ? (
                <div className="text-slate-600 text-sm text-center py-8">Keine Ansprechpartner gefunden</div>
              ) : (
                <div>
                  {result.contacts.map((c, i) => (
                    <div key={i} className="px-5 py-4 border-b border-[#0f1f38]">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-slate-200">{c.name || '–'}</div>
                          <div className="text-sm text-slate-400">{c.role || '–'}</div>
                        </div>
                        <div className="text-right text-sm space-y-1">
                          {c.email && <div className="text-blue-400">{c.email}</div>}
                          {c.phone && <div className="text-slate-400">{c.phone}</div>}
                          {c.linkedin && <a href={`https://${c.linkedin}`} target="_blank" rel="noreferrer" className="text-cyan-400 text-[11px]">LinkedIn →</a>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {activeTab === 'ai' && result.aiAnalysis && (
            <div className="space-y-4">
              <Card className="p-5 border-blue-800">
                <div className="text-[11px] text-blue-400 mb-2">✨ KI-ANALYSE — {result.aiAnalysis.model}</div>
                <p className="text-slate-300 text-sm leading-relaxed">{result.aiAnalysis.summary}</p>
                {result.aiAnalysis.pitch && (
                  <blockquote className="mt-4 border-l-2 border-cyan-500 pl-4 text-slate-300 text-sm italic">
                    {result.aiAnalysis.pitch}
                  </blockquote>
                )}
              </Card>
              <div className="grid grid-cols-3 gap-4">
                <Card className="p-4">
                  <div className="text-[11px] uppercase text-slate-500 mb-3">Chancen</div>
                  {result.aiAnalysis.opportunities?.map(o => <div key={o} className="text-sm text-green-400 mb-2">→ {o}</div>)}
                </Card>
                <Card className="p-4">
                  <div className="text-[11px] uppercase text-slate-500 mb-3">Risiken</div>
                  {result.aiAnalysis.risks?.map(r => <div key={r} className="text-sm text-red-400 mb-2">⚠ {r}</div>)}
                </Card>
                <Card className="p-4">
                  <div className="text-[11px] uppercase text-slate-500 mb-3">Empfehlungen</div>
                  {result.aiAnalysis.recommendations?.map(r => <div key={r} className="text-sm text-cyan-400 mb-2">• {r}</div>)}
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Scan testen** — URL eingeben auf `/scanner`, Fortschritt beobachten, Tabs durchklicken

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Scanner.tsx
git commit -m "feat: add full Scanner page with polling, tabs, DSGVO, CVEs, AI"
```

---

### Task 15: Leads Page

**Files:**
- Create: `frontend/src/pages/Leads.tsx`

- [ ] **Step 1: Erstelle `frontend/src/pages/Leads.tsx`**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLeads, updateLead, deleteLead, searchLeads, exportLeadsCSV } from '../api';
import { Card, CardHeader } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import type { Lead } from '../types';

const STATUSES = ['', 'new', 'contacted', 'qualified', 'rejected'] as const;

export default function Leads() {
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [industry, setIndustry] = useState('');
  const [location, setLocation] = useState('Deutschland');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['leads', statusFilter],
    queryFn: () => getLeads({ status: statusFilter || undefined }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Lead> }) => updateLead(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });

  const searchMutation = useMutation({
    mutationFn: () => searchLeads(searchQ, industry, location),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="p-4">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex gap-1">
            {STATUSES.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-[12px] rounded-lg ${statusFilter === s ? 'bg-blue-700 text-white' : 'bg-[#0f1f38] text-slate-400 hover:text-slate-200'}`}>
                {s === '' ? 'Alle' : s === 'new' ? 'Neu' : s === 'contacted' ? 'Kontaktiert' : s === 'qualified' ? 'Qualifiziert' : 'Abgelehnt'}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button onClick={() => exportLeadsCSV(statusFilter || undefined)}
            className="text-[12px] px-3 py-1.5 border border-[#1a2540] rounded-lg text-slate-400 hover:text-slate-200">
            ↓ CSV Export
          </button>
        </div>
      </Card>

      {/* Brave Search */}
      <Card className="p-4">
        <div className="text-[11px] uppercase text-slate-500 mb-3">Leads per KI-Suche finden (Brave Search)</div>
        <div className="flex gap-2 flex-wrap">
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="z.B. Zahnarzt, Handwerker, Anwalt..."
            className="flex-1 min-w-[200px] bg-[#0f1f38] border border-[#1a2540] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600" />
          <input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="Branche"
            className="w-36 bg-[#0f1f38] border border-[#1a2540] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600" />
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Ort"
            className="w-36 bg-[#0f1f38] border border-[#1a2540] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600" />
          <button onClick={() => searchMutation.mutate()} disabled={!searchQ || searchMutation.isPending}
            className="px-4 py-2 bg-gradient-to-r from-blue-700 to-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
            {searchMutation.isPending ? <Spinner size="sm" /> : null} Suchen & Importieren
          </button>
        </div>
        {searchMutation.isSuccess && <div className="text-green-400 text-sm mt-2">✓ {searchMutation.data?.total} Leads importiert</div>}
      </Card>

      {/* Table */}
      <Card>
        <CardHeader title={`Leads (${data?.total ?? 0})`} />
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#1a2540]">
              {['URL / Firma', 'Score', 'Status', 'Kontakt', 'Aktionen'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-[11px] uppercase text-slate-500">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {data?.leads?.map(lead => (
                <tr key={lead.id} className="border-b border-[#0f1f38] hover:bg-[#0d1f3a]">
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-200 truncate max-w-[200px]">{lead.company || '–'}</div>
                    <div className="text-[11px] text-blue-400 truncate max-w-[200px]">{lead.url}</div>
                  </td>
                  <td className="px-5 py-3 font-bold text-cyan-400">{lead.score}</td>
                  <td className="px-5 py-3">
                    <select value={lead.status} onChange={e => updateMutation.mutate({ id: lead.id, data: { status: e.target.value as any } })}
                      className="bg-[#0f1f38] border border-[#1a2540] rounded px-2 py-1 text-[12px] text-slate-300">
                      {['new','contacted','qualified','rejected'].map(s => <option key={s} value={s}>{s === 'new' ? 'Neu' : s === 'contacted' ? 'Kontaktiert' : s === 'qualified' ? 'Qualifiziert' : 'Abgelehnt'}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <div className="text-[12px] text-slate-400">{lead.contact_name || '–'}</div>
                    <div className="text-[11px] text-blue-400">{lead.contact_email || ''}</div>
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => deleteMutation.mutate(lead.id)}
                      className="text-[11px] text-red-500 hover:text-red-400 border border-red-900 px-2 py-0.5 rounded">
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
              {!data?.leads?.length && (
                <tr><td colSpan={5} className="text-center py-10 text-slate-600">Noch keine Leads — per Scanner oder Suche importieren</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Leads.tsx
git commit -m "feat: add Leads page with Brave Search import and CSV export"
```

---

### Task 16: E-Mail Templates Page

**Files:**
- Create: `frontend/src/pages/EmailTemplates.tsx`

- [ ] **Step 1: Erstelle `frontend/src/pages/EmailTemplates.tsx`**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEmailTemplates, generateEmail, deleteEmailTemplate } from '../api';
import { Card, CardHeader } from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import type { EmailTemplate } from '../types';

export default function EmailTemplates() {
  const [genUrl, setGenUrl] = useState('');
  const [genCompany, setGenCompany] = useState('');
  const [genSummary, setGenSummary] = useState('');
  const [generatedEmail, setGeneratedEmail] = useState('');
  const [selected, setSelected] = useState<EmailTemplate | null>(null);
  const [copied, setCopied] = useState(false);
  const qc = useQueryClient();

  const { data: templates, isLoading } = useQuery({ queryKey: ['email-templates'], queryFn: getEmailTemplates });

  const genMutation = useMutation({
    mutationFn: () => generateEmail(genUrl, genCompany, genSummary),
    onSuccess: (data) => setGeneratedEmail(data.email),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEmailTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  });

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const TYPE_LABELS: Record<string, string> = {
    cold: '🧊 Kaltakquise', security: '🔴 Sicherheit', dsgvo: '📋 DSGVO',
    upgrade: '⬆️ Upgrade', custom: '✏️ Eigene',
  };

  return (
    <div className="space-y-4">
      {/* KI-Generator */}
      <Card>
        <CardHeader title="✨ KI-E-Mail Generator (OpenRouter)" />
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input value={genUrl} onChange={e => setGenUrl(e.target.value)} placeholder="Website-URL"
              className="bg-[#0f1f38] border border-[#1a2540] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600" />
            <input value={genCompany} onChange={e => setGenCompany(e.target.value)} placeholder="Firmenname (optional)"
              className="bg-[#0f1f38] border border-[#1a2540] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600" />
            <button onClick={() => genMutation.mutate()} disabled={!genUrl || genMutation.isPending}
              className="px-4 py-2 bg-gradient-to-r from-blue-700 to-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
              {genMutation.isPending ? <Spinner size="sm" /> : '✨'} E-Mail generieren
            </button>
          </div>
          <textarea value={genSummary} onChange={e => setGenSummary(e.target.value)}
            placeholder="Scan-Zusammenfassung (optional) — z.B. 'WordPress 5.8, 3 kritische CVEs, kein Cookie-Banner'"
            rows={2}
            className="w-full bg-[#0f1f38] border border-[#1a2540] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600 resize-none" />
          {generatedEmail && (
            <div className="relative">
              <pre className="bg-[#0f1f38] border border-[#1a2540] rounded-lg p-4 text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                {generatedEmail}
              </pre>
              <div className="flex gap-2 mt-2">
                <button onClick={() => copy(generatedEmail)}
                  className="text-sm px-3 py-1.5 bg-[#1e3a5f] text-blue-300 rounded-lg hover:bg-[#1e4a7f]">
                  {copied ? '✓ Kopiert!' : '📋 Kopieren'}
                </button>
                <a href={`mailto:?body=${encodeURIComponent(generatedEmail)}`}
                  className="text-sm px-3 py-1.5 bg-[#1e3a3e] text-green-300 rounded-lg hover:bg-[#1e4a4e]">
                  📧 In E-Mail-Client öffnen
                </a>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Templates */}
      <div className="grid grid-cols-[280px_1fr] gap-4">
        <Card>
          <CardHeader title="Vorlagen" />
          {isLoading ? <div className="flex justify-center p-6"><Spinner /></div> : (
            <div>
              {templates?.map(tpl => (
                <div key={tpl.id} onClick={() => setSelected(tpl)}
                  className={`px-4 py-3 cursor-pointer border-b border-[#0f1f38] ${selected?.id === tpl.id ? 'bg-[#1e3a5f]' : 'hover:bg-[#0d1f3a]'}`}>
                  <div className="text-sm text-slate-200">{tpl.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{TYPE_LABELS[tpl.type] || tpl.type}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          {selected ? (
            <div>
              <CardHeader title={selected.name} action={
                <button onClick={() => { deleteMutation.mutate(selected.id); setSelected(null); }}
                  className="text-[11px] text-red-500 hover:text-red-400 border border-red-900 px-2 py-1 rounded">
                  Löschen
                </button>
              } />
              <div className="p-5 space-y-4">
                <div>
                  <div className="text-[11px] text-slate-500 uppercase mb-1">Betreff</div>
                  <div className="bg-[#0f1f38] rounded-lg px-4 py-2.5 text-sm text-slate-300 font-medium">{selected.subject}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 uppercase mb-1">Inhalt</div>
                  <pre className="bg-[#0f1f38] rounded-lg px-4 py-3 text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">{selected.body}</pre>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => copy(`${selected.subject}\n\n${selected.body}`)}
                    className="text-sm px-3 py-1.5 bg-[#1e3a5f] text-blue-300 rounded-lg">
                    {copied ? '✓ Kopiert!' : '📋 Kopieren'}
                  </button>
                  <a href={`mailto:?subject=${encodeURIComponent(selected.subject)}&body=${encodeURIComponent(selected.body)}`}
                    className="text-sm px-3 py-1.5 bg-[#1e3a3e] text-green-300 rounded-lg">
                    📧 In E-Mail-Client öffnen
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full py-20 text-slate-600">
              Vorlage auswählen
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/EmailTemplates.tsx
git commit -m "feat: add Email Templates page with AI generator"
```

---

### Task 17: Settings Page

**Files:**
- Create: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: Erstelle `frontend/src/pages/Settings.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getSettings, saveSettings } from '../api';
import { Card, CardHeader } from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';

const MODELS = [
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3.5-haiku',
  'anthropic/claude-3-haiku',
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'google/gemini-flash-1.5',
  'meta-llama/llama-3.1-8b-instruct:free',
];

export default function Settings() {
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  useEffect(() => { if (data) setForm(data); }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const { _db_host, _db_name, ...rest } = form;
      return saveSettings(rest);
    },
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 3000); },
  });

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div className="max-w-2xl space-y-5">
      <Card>
        <CardHeader title="OpenRouter AI" />
        <div className="p-5 space-y-4">
          <div>
            <label className="text-[11px] uppercase text-slate-500 block mb-1.5">API Key</label>
            <input type="password" value={form.OPENROUTER_API_KEY || ''} onChange={e => set('OPENROUTER_API_KEY', e.target.value)}
              placeholder="sk-or-..."
              className="w-full bg-[#0f1f38] border border-[#1a2540] rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600" />
            <p className="text-[11px] text-slate-600 mt-1">Kostenloser Account unter openrouter.ai verfügbar</p>
          </div>
          <div>
            <label className="text-[11px] uppercase text-slate-500 block mb-1.5">Standard-Modell</label>
            <select value={form.OPENROUTER_MODEL || ''} onChange={e => set('OPENROUTER_MODEL', e.target.value)}
              className="w-full bg-[#0f1f38] border border-[#1a2540] rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-600">
              {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Brave Search API" />
        <div className="p-5 space-y-4">
          <div>
            <label className="text-[11px] uppercase text-slate-500 block mb-1.5">API Key</label>
            <input type="password" value={form.BRAVE_SEARCH_API_KEY || ''} onChange={e => set('BRAVE_SEARCH_API_KEY', e.target.value)}
              placeholder="BSA..."
              className="w-full bg-[#0f1f38] border border-[#1a2540] rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600" />
            <p className="text-[11px] text-slate-600 mt-1">Free Tier: 2.000 Anfragen/Monat — search.brave.com/settings/api</p>
          </div>
          {parseInt(form.brave_requests_used || '0') > 1800 && (
            <div className="bg-yellow-950 border border-yellow-800 rounded-lg p-3 text-yellow-400 text-sm">
              ⚠ Brave Search Kontingent fast erschöpft: {form.brave_requests_used}/2000 Anfragen genutzt
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="NVD (CVE-Datenbank)" />
        <div className="p-5">
          <label className="text-[11px] uppercase text-slate-500 block mb-1.5">NVD API Key (optional)</label>
          <input type="password" value={form.NVD_API_KEY || ''} onChange={e => set('NVD_API_KEY', e.target.value)}
            placeholder="Optional — erhöht Rate-Limit"
            className="w-full bg-[#0f1f38] border border-[#1a2540] rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-600" />
          <p className="text-[11px] text-slate-600 mt-1">nvd.nist.gov/developers/request-an-api-key — kostenlos</p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Scanner" />
        <div className="p-5 grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] uppercase text-slate-500 block mb-1.5">Timeout (ms)</label>
            <input type="number" value={form.SCANNER_TIMEOUT_MS || '15000'} onChange={e => set('SCANNER_TIMEOUT_MS', e.target.value)}
              className="w-full bg-[#0f1f38] border border-[#1a2540] rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-600" />
          </div>
          <div>
            <label className="text-[11px] uppercase text-slate-500 block mb-1.5">Max. parallele Scans</label>
            <input type="number" value={form.MAX_CONCURRENT_SCANS || '5'} onChange={e => set('MAX_CONCURRENT_SCANS', e.target.value)}
              className="w-full bg-[#0f1f38] border border-[#1a2540] rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-600" />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Datenbank (read-only)" />
        <div className="p-5 grid grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] uppercase text-slate-500 mb-1">Host</div>
            <div className="bg-[#0f1f38] rounded-lg px-4 py-2.5 text-sm text-slate-500">{form._db_host}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-slate-500 mb-1">Datenbank</div>
            <div className="bg-[#0f1f38] rounded-lg px-4 py-2.5 text-sm text-slate-500">{form._db_name}</div>
          </div>
        </div>
        <div className="px-5 pb-4 text-[11px] text-slate-600">DB-Verbindung wird in .env konfiguriert und erfordert einen Neustart.</div>
      </Card>

      <div className="flex items-center gap-3">
        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
          className="px-6 py-2.5 bg-gradient-to-r from-blue-700 to-blue-600 text-white font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
          {saveMutation.isPending ? <Spinner size="sm" /> : null} Einstellungen speichern
        </button>
        {saved && <span className="text-green-400 text-sm">✓ Gespeichert</span>}
        {saveMutation.isError && <span className="text-red-400 text-sm">✗ Fehler beim Speichern</span>}
      </div>

      <div className="text-[11px] text-slate-700 pt-2">
        AkquiseFlow AI v1.0.0 · Dieses Tool darf nur für öffentlich erreichbare Websites genutzt werden.
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Settings.tsx
git commit -m "feat: add Settings page with API key management"
```

---

### Task 18: Finaler Build + Push

- [ ] **Step 1: Backend Dependencies sicherstellen**

```bash
cd backend && npm install
```

- [ ] **Step 2: Frontend Dependencies sicherstellen**

```bash
cd frontend && npm install
```

- [ ] **Step 3: Backend TypeScript kompilieren**

```bash
cd backend && npm run build
```
Erwartete Ausgabe: Keine Fehler, `dist/`-Ordner erstellt

- [ ] **Step 4: Frontend Build**

```bash
cd frontend && npm run build
```
Erwartete Ausgabe: Keine Fehler, `dist/`-Ordner erstellt

- [ ] **Step 5: `.gitignore` prüfen** — muss enthalten: `node_modules/`, `dist/`, `backend/.env`, `.superpowers/`

- [ ] **Step 6: GitHub Remote prüfen und ggf. erstellen**

```bash
source ~/.config/envman/PATH.env
git remote -v
# Falls kein Remote:
gh repo create AkquiseFlow-AI --public --source=. --remote=origin --push
```

- [ ] **Step 7: Alles committen und pushen**

```bash
git add -A
git commit -m "feat: complete AkquiseFlow AI - full dashboard implementation"
source ~/.config/envman/PATH.env && git push -u origin master
```

---

## Schnellstart (nach vollständiger Implementierung)

```bash
# 1. MySQL starten und DB erstellen
mysql -u root -e "CREATE DATABASE IF NOT EXISTS akquiseflow_ai; CREATE USER IF NOT EXISTS 'akquiseflow'@'localhost' IDENTIFIED BY 'dein_passwort'; GRANT ALL ON akquiseflow_ai.* TO 'akquiseflow'@'localhost';"

# 2. Backend .env ausfüllen (backend/.env)
# DB_PASSWORD, OPENROUTER_API_KEY, BRAVE_SEARCH_API_KEY

# 3. Backend starten
cd backend && npm run dev

# 4. Frontend starten (neues Terminal)
cd frontend && npm run dev

# 5. Browser öffnen
# http://localhost:5173
```
