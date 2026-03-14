import client from './client';
import type { ScanResult, Lead, EmailTemplate, DashboardStats } from '../types';

export const getDashboardStats = () =>
  client.get<DashboardStats>('/dashboard/stats').then(r => r.data);

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

export const getSettings = () =>
  client.get<Record<string, string>>('/settings').then(r => r.data);
export const saveSettings = (settings: Record<string, string>) =>
  client.put('/settings', settings).then(r => r.data);
