import axios from 'axios';
import type { CVEResult, Technology } from '../types';

interface NvdCveItem {
  cve: {
    id: string;
    descriptions: { lang: string; value: string }[];
    published: string;
    metrics?: {
      cvssMetricV31?: { cvssData: { baseScore: number; baseSeverity: string } }[];
      cvssMetricV2?: { cvssData: { baseScore: number }; baseSeverity: string }[];
    };
  };
}

const cache = new Map<string, { data: CVEResult[]; expires: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function severityFromScore(score: number): CVEResult['severity'] {
  if (score >= 9.0) return 'CRITICAL';
  if (score >= 7.0) return 'HIGH';
  if (score >= 4.0) return 'MEDIUM';
  if (score > 0) return 'LOW';
  return 'NONE';
}

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

const OSV_ECOSYSTEM: Record<string, string> = {
  wordpress: 'Packagist', joomla: 'Packagist', drupal: 'Packagist',
  laravel: 'Packagist', symfony: 'Packagist',
  jquery: 'npm', react: 'npm', vue: 'npm', angular: 'npm',
  'next.js': 'npm', nuxt: 'npm', bootstrap: 'npm',
};

async function fetchCVEsFromCIRCL(techName: string, version?: string): Promise<CVEResult[]> {
  try {
    const key = techName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const mapping = CIRCL_MAP[key];
    if (!mapping) return [];
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

async function fetchCVEsFromOSV(techName: string, version?: string): Promise<CVEResult[]> {
  try {
    const ecosystem = OSV_ECOSYSTEM[techName.toLowerCase()] || null;
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

async function fetchCVEsForTech(techName: string, version?: string): Promise<CVEResult[]> {
  const cacheKey = `${techName}-${version || 'any'}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  try {
    const query = version ? `${techName} ${version}` : techName;
    const params: Record<string, string | number> = {
      keywordSearch: query,
      resultsPerPage: 10,
    };

    const headers: Record<string, string> = {};
    if (process.env.NVD_API_KEY && process.env.NVD_API_KEY !== 'your_nvd_api_key_here') {
      headers['apiKey'] = process.env.NVD_API_KEY;
    }

    const response = await axios.get('https://services.nvd.nist.gov/rest/json/cves/2.0', {
      params,
      headers,
      timeout: 10000,
    });

    const items: NvdCveItem[] = response.data?.vulnerabilities?.map((v: { cve: NvdCveItem['cve'] }) => v) || [];

    const results: CVEResult[] = items.map(item => {
      const cve = item.cve;
      const desc = cve.descriptions.find(d => d.lang === 'en')?.value || '';
      const metrics = cve.metrics;
      let score = 0;
      let severity: CVEResult['severity'] = 'NONE';

      if (metrics?.cvssMetricV31?.[0]) {
        score = metrics.cvssMetricV31[0].cvssData.baseScore;
        severity = severityFromScore(score);
      } else if (metrics?.cvssMetricV2?.[0]) {
        score = metrics.cvssMetricV2[0].cvssData.baseScore;
        severity = severityFromScore(score);
      }

      return {
        id: cve.id,
        description: desc.substring(0, 500),
        severity,
        cvssScore: score,
        publishedDate: cve.published,
        technology: techName,
        version,
      };
    });

    // Additional sources: CIRCL + OSV in parallel
    const [circlResults, osvResults] = await Promise.all([
      fetchCVEsFromCIRCL(techName, version),
      fetchCVEsFromOSV(techName, version),
    ]);

    // Deduplicate by CVE ID
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
  } catch {
    return [];
  }
}

export async function checkCVEs(technologies: Technology[]): Promise<CVEResult[]> {
  const allCves: CVEResult[] = [];
  const techsToCheck = technologies.filter(t =>
    ['cms', 'framework', 'server', 'language', 'ecommerce'].includes(t.category)
  );

  // Parallel mit max 3 gleichzeitig
  const chunks = [];
  for (let i = 0; i < techsToCheck.length; i += 3) {
    chunks.push(techsToCheck.slice(i, i + 3));
  }

  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map(t => fetchCVEsForTech(t.name, t.version))
    );
    for (let i = 0; i < chunk.length; i++) {
      const count = results[i].length;
      chunk[i].cveCount = count;
      allCves.push(...results[i]);
    }
    // Kleine Pause um NVD Rate-Limit zu respektieren
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 600));
    }
  }

  return allCves.sort((a, b) => (b.cvssScore || 0) - (a.cvssScore || 0));
}
