import { NavLink } from 'react-router-dom';
import { Shield, Search, Users, Mail, Settings } from 'lucide-react';

const TABS = [
  { to: '/dashboard', label: 'Dashboard', icon: Shield },
  { to: '/scanner', label: 'Scanner', icon: Search },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/email', label: 'E-Mail', icon: Mail },
  { to: '/settings', label: 'Einstellungen', icon: Settings },
];

export default function TopNav() {
  return (
    <nav className="bg-[#0a1628] border-b border-[#1a2540] sticky top-0 z-50">
      <div className="max-w-[1400px] mx-auto px-6 flex items-center h-[52px] gap-1">
        <div className="flex items-center gap-2 mr-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-700 to-cyan-500 flex items-center justify-center">
            <Shield size={16} className="text-white" />
          </div>
          <span className="font-bold text-[15px] bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            AkquiseFlow AI
          </span>
        </div>
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 h-[52px] text-[13px] border-b-2 transition-colors ${
                isActive
                  ? 'text-cyan-400 border-cyan-400'
                  : 'text-slate-500 border-transparent hover:text-slate-300'
              }`
            }
          >
            <Icon size={14} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
