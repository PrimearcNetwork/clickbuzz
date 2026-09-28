import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { adminLogout } from '../../services/adminSession';
import {
  Menu, X, Users, LogOut,
  CreditCard, ChevronDown, ChevronRight, Settings,
  Layers, Monitor, Home
} from 'lucide-react';

const AdminLayout = () => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState({
    Master: true,
  });

  const menuConfig = [
    {
      name: 'Master',
      icon: Layers,
      children: [
        { name: 'Genre Listing', path: '/admin/genres' },
        { name: 'Language Listing', path: '/admin/languages' },
        { name: 'Age Certificate', path: '/admin/age-certificates' },
        { name: 'Mature Theme', path: '/admin/mature-themes' },
        { name: 'Vendor', path: '/admin/vendors' },
        { name: 'Badge', path: '/admin/badges' },
      ]
    },
    {
      name: 'Shows',
      icon: Monitor,
      children: [
        { name: 'Show Listing', path: '/admin/movies' },
      ]
    },
    {
      name: 'Home',
      icon: Home,
      children: [

        { name: 'Hero Banner Listing', path: '/admin/hero-banners' },
        { name: 'Tray Listing', path: '/admin/trays' },
      ]
    },
    {
      name: 'Users',
      icon: Users,
      children: [
        { name: 'User Listing', path: '/admin/users' },
      ]
    },
    {
      name: 'Subscription',
      icon: CreditCard,
      children: [
        { name: 'Plans', path: '/admin/subscriptions' },
      ]
    },
    {
      name: 'Settings',
      icon: Settings,
      children: [
        { name: 'Menu Settings', path: '/admin/settings' },
        { name: 'Pages', path: '/admin/pages' },
      ]
    }
  ];

  // Auto-open menu category based on current path
  useEffect(() => {
    menuConfig.forEach(category => {
      if (category.children.some(child => location.pathname === child.path || (child.path !== '/admin' && location.pathname.startsWith(child.path)))) {
        setOpenMenus(prev => ({ ...prev, [category.name]: true }));
      }
    });
  }, [location.pathname]);

  const toggleMenu = (name) => {
    setOpenMenus(prev => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div className="min-h-screen bg-[#1c2333] text-gray-300 flex fixed inset-0 z-50 font-sans">

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Admin Sidebar */}
      <div className={`fixed inset-y-0 left-0 w-64 bg-[#141a29] border-r border-gray-800 flex flex-col shrink-0 shadow-2xl z-40 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 h-20 flex items-center justify-between border-b border-gray-800/50 shrink-0">
          <h2 className="text-xl md:text-2xl font-bold text-[#4aa5ff] tracking-wider">ClickBuz Admin</h2>
          <button className="md:hidden text-gray-400 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 py-6 space-y-1 px-4 overflow-y-auto custom-scrollbar">
          {menuConfig.map((category) => {
            const isOpen = openMenus[category.name];
            const isActive = category.children.some(child => location.pathname === child.path);

            return (
              <div key={category.name} className="pb-1">
                <button
                  onClick={() => toggleMenu(category.name)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 font-medium ${isActive
                      ? 'bg-[#5a6ef7] text-white shadow-lg shadow-indigo-500/20'
                      : 'text-gray-400 hover:bg-[#1e2638] hover:text-white'
                    }`}
                >
                  <div className="flex items-center space-x-3">
                    <category.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                    <span>{category.name}</span>
                  </div>
                  {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>

                {isOpen && (
                  <div className="mt-1 space-y-1 flex flex-col py-2">
                    {category.children.map(child => {
                      const isChildActive = location.pathname === child.path;
                      return (
                        <Link
                          key={child.name}
                          to={child.path}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-colors text-sm font-medium ml-2 ${isChildActive
                              ? 'text-[#00E5FF]'
                              : 'text-gray-400 hover:text-white hover:bg-[#1e2638]'
                            }`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isChildActive ? 'bg-[#00E5FF]' : 'bg-gray-500'}`}></div>
                          <span>{child.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-gray-800/50 shrink-0">
          <Link to="/" onClick={adminLogout} className="flex items-center space-x-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors font-medium">
            <LogOut size={20} />
            <span>Exit Admin</span>
          </Link>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">

        {/* Top Header */}
        <header className="h-20 bg-[#1c2333] border-b border-gray-800/30 flex items-center justify-between px-4 md:px-8 shrink-0 z-10 shadow-sm">
          <div className="flex items-center">
            <button
              className="mr-4 md:hidden text-gray-400 hover:text-white"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={24} />
            </button>
            <h1 className="text-lg md:text-xl font-bold text-white uppercase tracking-wider truncate max-w-[150px] sm:max-w-xs">
              {(() => {
                for (const cat of menuConfig) {
                  const match = cat.children.find(c => c.path === location.pathname);
                  if (match) return match.name;
                }
                return 'Admin Panel';
              })()}
            </h1>
          </div>
          <div className="flex items-center space-x-3 md:space-x-5">
            <div className="flex items-center space-x-1 p-1 bg-[#141a29] rounded-full border border-gray-700/50">
              <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gray-700/50 text-white cursor-pointer"><span className="text-xs">⚙</span></div>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-gray-500 hover:text-white cursor-pointer"><span className="text-xs">🌙</span></div>
            </div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#3b82f6] to-[#4aa5ff] flex items-center justify-center text-white font-bold shadow-md shadow-blue-500/30 cursor-pointer">
              AD
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-8 bg-[#1c2333]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
