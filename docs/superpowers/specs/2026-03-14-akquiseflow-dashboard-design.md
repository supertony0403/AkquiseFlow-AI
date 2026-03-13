# AkquiseFlow AI — Dashboard Design Spec

**Datum:** 2026-03-14
**Status:** Approved
**Stack:** React + Vite + TailwindCSS (Frontend) | Node.js + Express + TypeScript (Backend) | MySQL

---

## 1. Überblick

AkquiseFlow AI ist ein KI-gestütztes Akquise-Tool, das Websites automatisch scannt, Sicherheitslücken erkennt, Ansprechpartner extrahiert, DSGVO-Compliance prüft und personalisierte Kaltakquise-E-Mails generiert.

### Ziel
Vertriebsteams und Agenturen sollen in Minuten qualifizierte Leads identifizieren, deren technische Schwachstellen kennen und automatisiert ansprechen können.

---

## 2. Layout & Design

- **Navigation:** Top Navigation (Tab-Bar)
- **Theme:** Dark Pro — Hintergrund `#020817`/`#0a1628`, Akzent Cyan `#22d3ee`, Blau-Gradient für CTAs
- **Tabs:** Dashboard · Scanner · Leads · E-Mail · Einstellungen

---

## 3. Features & Seiten

### 3.1 Dashboard (Übersicht)
- **KPI-Karten:** Scans gesamt, Leads gefunden, Kritische CVEs, Ø Sicherheits-Score
- **Letzte Scans:** Tabelle mit Favicon, URL, erkannten Technologien, Score, CVE-Anzahl
- **CVE-Verteilung:** Balkendiagramm CRITICAL / HIGH / MEDIUM / LOW
- **DSGVO-Widget:** Schnellcheck der zuletzt gescannten Domain
- **AI-Insight:** Letzter KI-generierter Pitch als Vorschau-Panel
- **Top-Leads:** Die 3 best-gescorten Leads mit Status
- **Scanner-Schnellzugriff:** URL-Input mit Optionen direkt im Dashboard

### 3.2 Scanner
- URL-Eingabe mit Validierung
- Optionen per Toggle: CVE-Check, DSGVO-Scan, KI-Analyse, Kontakte extrahieren, Deep Scan
- **Echtzeit-Fortschritt via Polling:** Frontend fragt `GET /api/scans/:id` alle 2 Sekunden ab bis `status === 'completed'` oder `'failed'`. Schritte werden anhand von `status` + `result`-Inhalt angezeigt (Verbinde → Technologien → CVEs → KI → Fertig). Kein WebSocket nötig.
- **Ergebnis-Tabs:** Übersicht | Technologien | CVEs | DSGVO | Ansprechpartner | KI-Analyse
- **Erkannte Technologien:** CMS, Framework, Server, Sprache, CDN, Analytics — jeweils mit Version + CVE-Count
- **CVE-Liste:** ID, Beschreibung, CVSS-Score, Severity-Badge, betroffene Technologie
- **SSL-Info:** Grade (A–F), Ablaufdatum, Protokoll, Self-Signed-Warnung
- **Security-Header:** Vorhanden vs. fehlend mit Empfehlungen
- **Lead-Button:** Scan direkt als Lead speichern

### 3.3 DSGVO-Scanner
Integriert im Scanner-Ergebnis + Dashboard-Widget. Prüft:
- Impressum (§5 TMG) vorhanden
- Datenschutzerklärung vorhanden
- Cookie-Consent-Banner erkennbar
- Google Analytics / Facebook Pixel ohne Consent
- SSL auf allen Seiten
- Kontaktformular vorhanden
- Ergebnis: Ampel-System (Grün/Gelb/Rot) + konkrete Verbesserungshinweise

### 3.4 Leads
- Tabelle mit Filter (Status: Neu / Kontaktiert / Qualifiziert / Abgelehnt)
- Suchfeld + Sortierung nach Score, Datum, Status
- **Lead-Detailansicht:** Firmeninfo, Score-Breakdown, verknüpfter Scan, Ansprechpartner, Notizen
- **Brave Search Integration:** Leads nach Branche + Standort suchen und automatisch importieren
- **Ansprechpartner:** Name, Rolle, E-Mail, Telefon, LinkedIn — extrahiert via KI aus Impressum/Über-uns
- Bulk-Aktionen: Status setzen, E-Mail generieren, exportieren (CSV)

### 3.5 E-Mail Templates
- **Template-Bibliothek:** Vorgefertigte Vorlagen (Sicherheitslücken, DSGVO, Technologie-Upgrade, Allgemein)
- **KI-Generator:** Personalisierte Kaltakquise-Mail auf Basis des Scan-Ergebnisses per OpenRouter
- **Variablen:** `{{firma}}`, `{{url}}`, `{{technologie}}`, `{{cve_count}}`, `{{dsgvo_problem}}`
- **Vorschau:** Gerenderte E-Mail mit Betreff + Text
- **Bearbeitung:** Inline-Editor, Kopieren-Button, Versand-Vorbereitung (mailto-Link)
- **Modell-Wahl:** Frei wählbar aus OpenRouter-Modellen (Standard: `anthropic/claude-3.5-haiku`)

### 3.6 Einstellungen
- OpenRouter API Key + Modellauswahl
- Brave Search API Key (Free Tier: 2.000 Req/Monat — UI zeigt Verbrauchswarnung ab 1.800)
- NVD API Key (optional, erhöht Rate-Limit)
- Scanner-Optionen: Timeout, Max. parallele Scans
- **MySQL-Verbindungsdaten:** Werden in `.env` gespeichert, nicht in der DB selbst. Die Einstellungsseite zeigt nur den aktuellen Host/DB-Namen (read-only). Änderungen erfordern Neustart des Servers — das wird in der UI kommuniziert.
- Über: Version, Lizenzen

---

## 4. Backend API — Neue/Fehlende Endpunkte

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/api/dashboard/stats` | KPIs: Scans, Leads, CVEs, Ø Score |
| GET | `/api/scans/:id/contacts` | Ansprechpartner eines Scans |
| GET | `/api/email-templates` | Alle Templates |
| POST | `/api/email-templates` | Template erstellen |
| PUT | `/api/email-templates/:id` | Template aktualisieren |
| DELETE | `/api/email-templates/:id` | Template löschen |
| POST | `/api/email-templates/generate` | KI-generierte Mail per OpenRouter |
| GET | `/api/settings` | Einstellungen lesen |
| PUT | `/api/settings` | Einstellungen speichern |

| GET | `/api/leads/export` | CSV-Export aller/gefilterter Leads |

Bestehend (bereits implementiert): `/api/scans`, `/api/leads`, `/api/leads/search`, `/api/leads/:id/contacts`

**Hinweis Kontakte:** `GET /api/scans/:id/contacts` liest `contacts`-Feld aus dem `result`-JSON des Scans. `GET /api/leads/:id/contacts` liest aus der separaten `contacts`-Tabelle (für manuell verknüpfte Kontakte). Beide Endpoints bleiben erhalten — unterschiedliche Datenquellen.

---

## 5. Technologie-Erkennung (Scanner)

Patterns für: WordPress, Joomla, Drupal, Shopify, WooCommerce, React, Next.js, Vue.js, Angular, Nuxt.js, jQuery, Bootstrap, PHP, Node.js, Apache, Nginx, Cloudflare, Google Analytics, GTM, Matomo — bereits implementiert.

**Neu hinzufügen:** Laravel, Symfony, Magento, PrestaShop, Typo3, Gatsby, SvelteKit, IIS, Lighttpd, Varnish, AWS CloudFront, Fastly, Hotjar, Intercom, HubSpot.

---

## 6. CVE-Quellen

- **NVD (NIST):** Primärquelle, bereits implementiert
- **CIRCL CVE Search:** `https://cve.circl.lu/api/search/{vendor}/{product}` — kostenlos, kein Key
- **OSV.dev:** `https://api.osv.dev/v1/query` — kostenlos, kein Key, für Open-Source-Packages

---

## 7. Kostenlose Search API

**Brave Search API** (bereits integriert)
- Free Tier: 2.000 Anfragen/Monat
- Endpoint: `https://api.search.brave.com/res/v1/web/search`
- Zweck: Leads nach Branche + Standort finden

---

## 8. DSGVO-Erkennung — Implementierung

```
checkDSGVO(html, url) → DSGVOResult {
  impressum: boolean        // /impressum, /legal, footer-Links
  datenschutz: boolean      // /datenschutz, /privacy-policy
  cookieConsent: boolean    // Klassen/Skripte: cookiebot, cookieconsent, usercentrics, borlabs
  googleAnalytics: boolean  // gtag.js, UA-*, G-* ohne consent wrapper
  facebookPixel: boolean    // connect.facebook.net/fbevents.js
  ssl: boolean              // HTTPS + valid cert
  contactForm: boolean      // <form> mit email-Input
  score: 0-100
  issues: string[]          // Konkrete Probleme
  recommendations: string[] // Konkrete Empfehlungen
}
```

---

## 9. Datenbankschema (MySQL) — Erweiterungen

```sql
-- Neu: email_templates
CREATE TABLE IF NOT EXISTS email_templates (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(512),
  body TEXT,
  type ENUM('cold','security','dsgvo','upgrade','custom') DEFAULT 'cold',
  variables JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Neu: settings (Key-Value-Store für API Keys etc.)
CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(128) PRIMARY KEY,
  `value` TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migration: contacts-Feld zu scans (idempotent)
ALTER TABLE scans ADD COLUMN IF NOT EXISTS contacts JSON;

-- Migration: Kontaktfelder zu leads (idempotent)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_name VARCHAR(512);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_email VARCHAR(512);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(128);
```

Alle Migrationen werden in `initDB()` ausgeführt — `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` macht sie idempotent.

---

## 10. KI-Einsatz (OpenRouter)

Alle Modellnamen verwenden das OpenRouter-Format `provider/model-name`:

| Feature | Modell (OpenRouter-ID) | Zweck |
|---------|--------|-------|
| Website-Analyse | `anthropic/claude-3.5-sonnet` | Zusammenfassung, Opportunities, Pitch |
| Kontakt-Extraktion | `anthropic/claude-3-haiku` | Schnell + günstig für HTML-Parsing |
| E-Mail-Generierung | `anthropic/claude-3.5-haiku` | Personalisierte Kaltakquise-Mail |
| Lead-Scoring | `anthropic/claude-3-haiku` | Score 0–100 basierend auf Schwachstellen |
| DSGVO-Bewertung | Regelbasiert | Kein KI-Einsatz nötig (deterministisch) |

Standard-Modell konfigurierbar in `.env` und Einstellungsseite. Fallback auf `anthropic/claude-3-haiku` bei nicht konfiguriertem Key.

---

## 11. Sicherheit & Ethik

- Scanner nur für autorisierte Domains oder auf eigene Verantwortung
- Rate-Limiting: 100 Requests/Minute (bereits implementiert)
- Keine aggressiven Scan-Methoden (kein Port-Scanning, kein Brute-Force)
- **Kein Login-System** (lokales Single-User-Tool). API läuft nur auf `localhost` — kein öffentlicher Zugriff. `GET /api/settings` gibt Keys zurück, da das Tool nur lokal betrieben wird.
- **SSL `rejectUnauthorized: false`** beim Scanner ist bewusst — nur für lokalen Betrieb, ermöglicht Scan von Domains mit ungültigen Certs.
- **DSGVO-Hinweis für extrahierte Kontaktdaten:** UI zeigt Hinweistext "Kontaktdaten nur für einmalige Geschäftsanbahnung verwenden (Art. 6 Abs. 1 lit. f DSGVO)". Keine automatische Speicherlöschung in v1.
- **DB-Migrationen:** `initDB()` führt `CREATE TABLE IF NOT EXISTS` aus. Neue Felder werden per `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ergänzt — idempotent, sicher bei bereits bestehenden Instanzen.
- **API Key-Speicherung:** Keys werden in der `settings`-Tabelle im Klartext gespeichert (lokale Installation, kein Multi-User-Betrieb). In der UI werden Keys als `password`-Inputs angezeigt.
- **Input-Validierung:** Alle PUT/POST-Endpunkte validieren Typen und bereinigen Strings. URL-Inputs werden via `new URL()` geprüft.
- Hinweis in UI: "Dieses Tool dient ausschließlich zur Akquise und darf nur für öffentlich erreichbare Websites genutzt werden."

---

## 12. Projektstruktur

```
AkquiseFlow-AI/
├── backend/src/
│   ├── index.ts                    # Express Server Entry
│   ├── db/index.ts                 # MySQL Pool + initDB ✓
│   ├── routes/
│   │   ├── scan.ts                 # ✓ vorhanden
│   │   ├── leads.ts                # ✓ vorhanden
│   │   ├── emailTemplates.ts       # NEU
│   │   ├── settings.ts             # NEU
│   │   └── dashboard.ts            # NEU
│   ├── services/
│   │   ├── scanner.ts              # ✓ vorhanden
│   │   ├── cveService.ts           # ✓ vorhanden + CIRCL/OSV ergänzen
│   │   ├── openrouterService.ts    # ✓ vorhanden
│   │   ├── braveSearch.ts          # ✓ vorhanden
│   │   └── dsgvoService.ts         # NEU
│   ├── middleware/
│   │   └── errorHandler.ts         # ✓ vorhanden
│   └── types/index.ts              # ✓ vorhanden + erweitern
├── frontend/src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/                        # Axios API-Client
│   ├── components/
│   │   ├── Layout/                 # TopNav, PageWrapper
│   │   ├── ui/                     # Badge, Button, Card, Table, Spinner
│   │   └── charts/                 # CVEChart, ScoreGauge
│   └── pages/
│       ├── Dashboard.tsx
│       ├── Scanner.tsx
│       ├── Leads.tsx
│       ├── EmailTemplates.tsx
│       └── Settings.tsx
└── docs/superpowers/specs/
    └── 2026-03-14-akquiseflow-dashboard-design.md
```
