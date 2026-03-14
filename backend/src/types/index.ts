export interface ScanResult {
  id: string;
  url: string;
  scannedAt: string;
  status: 'pending' | 'scanning' | 'completed' | 'failed';
  technologies: Technology[];
  ssl: SSLInfo | null;
  headers: HeaderAnalysis;
  cves: CVEResult[];
  aiAnalysis: AIAnalysis | null;
  score: SecurityScore;
  metadata: SiteMetadata;
  contacts?: Contact[];
  dsgvo?: DSGVOResult;
}

export interface Technology {
  name: string;
  version?: string;
  category: string;
  confidence: number;
  cveCount?: number;
}

export interface SSLInfo {
  valid: boolean;
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  daysUntilExpiry: number;
  protocol: string;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | 'T' | 'M';
  selfSigned: boolean;
  expired: boolean;
  san: string[];
}

export interface HeaderAnalysis {
  score: number;
  missing: string[];
  present: string[];
  details: Record<string, string>;
  recommendations: string[];
}

export interface CVEResult {
  id: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  cvssScore: number;
  publishedDate: string;
  technology: string;
  version?: string;
  url: string;
}

export interface AIAnalysis {
  summary: string;
  opportunities: string[];
  risks: string[];
  recommendations: string[];
  pitch: string;
  score: number;
  model: string;
}

export interface SecurityScore {
  overall: number;
  ssl: number;
  headers: number;
  cve: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface SiteMetadata {
  title: string;
  description: string;
  favicon: string;
  ip: string;
  hosting: string;
  cms: string;
  language: string;
  responseTime: number;
  statusCode: number;
}

export interface Lead {
  id: string;
  url: string;
  company: string;
  description: string;
  score: number;
  status: 'new' | 'contacted' | 'qualified' | 'rejected';
  createdAt: string;
  scanResult?: ScanResult;
  tags: string[];
  notes: string;
}

export interface SearchQuery {
  query: string;
  industry?: string;
  location?: string;
  maxResults?: number;
}

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  extra_snippets?: string[];
}

export interface ScanRequest {
  url: string;
  options?: {
    scanSSL?: boolean;
    scanCVE?: boolean;
    aiAnalysis?: boolean;
    deepScan?: boolean;
  };
}

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
