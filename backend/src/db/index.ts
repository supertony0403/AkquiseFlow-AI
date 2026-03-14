import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'akquiseflow_ai',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
});

export async function initDB(): Promise<void> {
  const conn = await pool.getConnection();
  try {
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

    // Idempotente Migrationen
    const migrations = [
      `ALTER TABLE scans ADD COLUMN IF NOT EXISTS contacts JSON`,
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_name VARCHAR(512)`,
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_email VARCHAR(512)`,
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(128)`,
    ];
    for (const m of migrations) {
      await conn.execute(m).catch((err: any) => {
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
