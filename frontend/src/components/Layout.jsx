import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Toaster } from './ui/sonner';
import {
  Tv,
  Home,
  Grid3X3,
  Plus,
  Heart,
  User,
  LogOut,
  Menu,
  X,
  Search,
  ChevronRight,
  Radio,
  Download,
} from 'lucide-react';

const navItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/live', icon: Radio, label: 'Live TV' },
  { path: '/schedule', icon: Grid3X3, label: 'TV Guide' },
];

const Layout = ({ children }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleNavClick = (path) => {
    navigate(path);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-heavy">
        <div className="flex items-center justify-between px-4 md:px-8 py-4">
          {/* Left: Logo & Mobile Menu */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
              data-testid="mobile-menu-btn"
            >
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            
            <Link to="/" className="flex items-center gap-3 group" data-testid="logo-link">
              <img
                src="/hush-logo-tight.png"
                alt="Hush Music TV"
                className="h-12 w-auto group-hover:scale-110 transition-transform"
              />
            </Link>
          </div>

          {/* Center: Navigation (Desktop) */}
          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-link flex items-center gap-2 text-sm font-medium transition-colors ${
                  location.pathname === item.path
                    ? 'text-white active'
                    : 'text-gray-400 hover:text-white'
                }`}
                data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right: Search & Auth */}
          <div className="flex items-center gap-4">
            <Link
              to="/schedule"
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              data-testid="search-btn"
              title="TV Guide"
            >
              <Search size={20} className="text-gray-400" />
            </Link>

            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-2 p-2 hover:bg-white/10 rounded-lg transition-colors"
                    data-testid="user-menu-btn"
                  >
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                      <span className="font-bold text-sm">
                        {user?.username?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                    <ChevronRight size={16} className="text-gray-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-surface border-white/10">
                  <div className="px-3 py-2">
                    <p className="font-medium">{user?.username}</p>
                    <p className="text-sm text-gray-400">{user?.email}</p>
                  </div>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem
                    onClick={() => navigate('/dashboard')}
                    className="cursor-pointer hover:bg-white/10"
                    data-testid="menu-dashboard"
                  >
                    <User size={16} className="mr-2" />
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate('/create')}
                    className="cursor-pointer hover:bg-white/10"
                    data-testid="menu-create"
                  >
                    <Plus size={16} className="mr-2" />
                    Create Channel
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate('/favorites')}
                    className="cursor-pointer hover:bg-white/10"
                    data-testid="menu-favorites"
                  >
                    <Heart size={16} className="mr-2" />
                    Favorites
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem
                    onClick={logout}
                    className="cursor-pointer text-red-400 hover:bg-white/10"
                    data-testid="menu-logout"
                  >
                    <LogOut size={16} className="mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/download"
                  className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  data-testid="download-btn"
                >
                  <Download size={18} />
                  <span className="hidden lg:inline">Get App</span>
                </Link>
                <Button
                  onClick={() => navigate('/login')}
                  className="bg-primary hover:bg-primary-hover text-white font-medium px-6"
                  data-testid="login-btn"
                >
                  Admin
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-surface transform transition-transform duration-300 ease-in-out md:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full pt-20 px-4">
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => (
              <button
                key={item.path}
                onClick={() => handleNavClick(item.path)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  location.pathname === item.path
                    ? 'bg-primary text-white'
                    : 'text-gray-400 hover:bg-white/10 hover:text-white'
                }`}
                data-testid={`mobile-nav-${item.label.toLowerCase().replace(' ', '-')}`}
              >
                <item.icon size={20} />
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
            
            {/* Download App Link */}
            <button
              onClick={() => handleNavClick('/download')}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                location.pathname === '/download'
                  ? 'bg-primary text-white'
                  : 'text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
              data-testid="mobile-nav-download"
            >
              <Download size={20} />
              <span className="font-medium">Get App</span>
            </button>
          </nav>

          {isAuthenticated && (
            <>
              <div className="border-t border-white/10 my-4" />
              <nav className="flex flex-col gap-2">
                <button
                  onClick={() => handleNavClick('/dashboard')}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <User size={20} />
                  <span>Dashboard</span>
                </button>
                <button
                  onClick={() => handleNavClick('/create')}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Plus size={20} />
                  <span>Create Channel</span>
                </button>
                <button
                  onClick={() => handleNavClick('/favorites')}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Heart size={20} />
                  <span>Favorites</span>
                </button>
              </nav>
            </>
          )}
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="pt-20 h-screen overflow-y-auto">
        {children}
      </main>

      {/* Toast Notifications */}
      <Toaster position="bottom-right" theme="dark" />
    </div>
  );
};

export default Layout;
