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
