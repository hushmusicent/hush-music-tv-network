import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tv, Mail, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState({});

  const from = location.state?.from?.pathname || '/dashboard';

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    try {
      await login(formData.email, formData.password);
      toast.success('Welcome back, Admin!');
      navigate(from, { replace: true });
    } catch (error) {
      const message = error.response?.data?.detail || 'Invalid credentials';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  return (
    <div className="min-h-screen flex" data-testid="login-page">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1576307302704-b6142d572612?w=1920"
            alt="Background"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A] via-[#0A0A0A]/80 to-transparent" />
        </div>
        
        <div className="relative z-10 flex flex-col justify-between p-12">
          <Link to="/" className="flex items-center gap-3">
            <div className="p-2 bg-primary rounded-lg">
              <Tv size={24} />
            </div>
            <span className="font-heading text-3xl tracking-wider">HUSH MUSIC TV</span>
          </Link>
          
          <div>
            <h1 className="font-heading text-6xl tracking-tight mb-4">
              ADMIN
              <br />
              <span className="text-primary">PANEL</span>
            </h1>
            <p className="text-gray-400 text-lg max-w-md">
              Manage your TV network, create channels, and control all content.
            </p>
          </div>
          
          <p className="text-gray-500 text-sm">
            © 2025 Hush Music TV Network. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-surface">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8">
            <Link to="/" className="flex items-center gap-3">
              <div className="p-2 bg-primary rounded-lg">
                <Tv size={24} />
              </div>
              <span className="font-heading text-2xl tracking-wider">HUSH MUSIC TV</span>
            </Link>
          </div>

          {/* Back Button */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
            data-testid="back-btn"
          >
            <ArrowLeft size={18} />
            Back to Home
          </button>

          {/* Form Header */}
          <div className="mb-8">
            <h2 className="font-heading text-4xl tracking-tight mb-2">
              Admin Login
            </h2>
            <p className="text-gray-400">
              Sign in to manage your TV network
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="email" className="text-gray-300">Email</Label>
              <div className="relative mt-2">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="admin@example.com"
                  className={`pl-11 bg-black/50 border-white/10 h-12 ${errors.email ? 'border-red-500' : ''}`}
                  data-testid="email-input"
                />
              </div>
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
            </div>

            <div>
              <Label htmlFor="password" className="text-gray-300">Password</Label>
              <div className="relative mt-2">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className={`pl-11 pr-11 bg-black/50 border-white/10 h-12 ${errors.password ? 'border-red-500' : ''}`}
                  data-testid="password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-hover h-12 font-bold text-lg glow-primary-hover"
              data-testid="submit-btn"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {/* Guest Notice */}
          <div className="mt-8 p-4 bg-black/30 rounded-lg border border-white/5">
            <p className="text-sm text-gray-400 text-center">
              Visitors can browse channels without signing in.
              <Link to="/live" className="text-primary hover:underline ml-1" data-testid="login-live-tv-link">
                Live TV
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
