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
