import { Routes, Route, Navigate } from 'react-router-dom';
import TopNav from './components/Layout/TopNav';
import Dashboard from './pages/Dashboard';
import Scanner from './pages/Scanner';
import Leads from './pages/Leads';
import EmailTemplates from './pages/EmailTemplates';
import Settings from './pages/Settings';

export default function App() {
  return (
    <div className="min-h-screen bg-[#020817]">
      <TopNav />
      <main className="max-w-[1400px] mx-auto px-6 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/scanner" element={<Scanner />} />
          <Route path="/scanner/:id" element={<Scanner />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/email" element={<EmailTemplates />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
