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
