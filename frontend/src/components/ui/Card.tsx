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
