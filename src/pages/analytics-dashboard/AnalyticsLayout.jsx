import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { adminLogout } from '../../services/adminSession';
import { Menu, X, LayoutDashboard, Users, LogOut, BarChart3 } from 'lucide-react';

// Standalone shell for the analytics module (see CLAUDE.md §23) — visually
// distinct from both the public site (cyan/#02040a) and the admin panel
// (indigo/#1c2333) so it reads as its own tool, structurally mirroring
// AdminLayout.jsx's sidebar+header shape without sharing its palette or code.
const NAV_ITEMS = [
  { name: 'Overview', path: '/analytics', icon: LayoutDashboard, end: true },
  { name: 'Visitors', path: '/analytics/visitors', icon: Users, end: false },
];

const AnalyticsLayout = () => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (item) => (item.end
    ? location.pathname === item.path
    : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));

  return (
    <div className="min-h-screen bg-[#0b0e16] text-gray-300 flex fixed inset-0 z-50 font-sans">
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <div className={`fixed inset-y-0 left-0 w-60 bg-[#0d1119] border-r border-white/10 flex flex-col shrink-0 shadow-2xl z-40 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 h-20 flex items-center justify-between border-b border-white/10 shrink-0">
          <Link to="/analytics" className="flex items-center gap-2">
            <BarChart3 size={22} className="text-[#3987e5]" />
            <h2 className="text-lg font-bold text-white tracking-wide">Analytics</h2>
          </Link>
          <button className="md:hidden text-gray-400 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 py-6 space-y-1 px-4 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${active
                  ? 'bg-[#3987e5]/15 text-[#6fa8f0]'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <item.icon size={18} strokeWidth={active ? 2.5 : 2} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-white/10 shrink-0">
          <Link to="/" onClick={adminLogout} className="flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors font-medium text-sm">
            <LogOut size={18} />
            <span>Exit Analytics</span>
          </Link>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-20 bg-[#0b0e16] border-b border-white/10 flex items-center justify-between px-4 md:px-8 shrink-0 z-10">
          <div className="flex items-center">
            <button
              className="mr-4 md:hidden text-gray-400 hover:text-white"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={22} />
            </button>
            <h1 className="text-lg md:text-xl font-bold text-white truncate">
              {NAV_ITEMS.find((item) => isActive(item))?.name || 'Analytics'}
            </h1>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-8 bg-[#0b0e16]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AnalyticsLayout;
