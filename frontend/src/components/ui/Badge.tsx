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
