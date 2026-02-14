import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tv, Mail, Lock, User, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register } = useAuth();
  
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});

  const from = location.state?.from?.pathname || '/';

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    
    if (!isLogin && !formData.username) {
      newErrors.username = 'Username is required';
    } else if (!isLogin && formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    if (!isLogin && formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    try {
      if (isLogin) {
        await login(formData.email, formData.password);
        toast.success('Welcome back!');
      } else {
        await register(formData.email, formData.username, formData.password);
        toast.success('Account created successfully!');
      }
      navigate(from, { replace: true });
    } catch (error) {
      const message = error.response?.data?.detail || 'Authentication failed';
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
            <span className="font-heading text-3xl tracking-wider">STREAMTV</span>
          </Link>
          
          <div>
            <h1 className="font-heading text-6xl tracking-tight mb-4">
              YOUR OWN
              <br />
              <span className="text-primary">TV NETWORK</span>
            </h1>
            <p className="text-gray-400 text-lg max-w-md">
              Create custom channels, schedule programming, and broadcast 24/7 to your audience.
            </p>
          </div>
          
          <p className="text-gray-500 text-sm">
            © 2025 StreamTV. All rights reserved.
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
              <span className="font-heading text-2xl tracking-wider">STREAMTV</span>
            </Link>
          </div>

          {/* Back Button */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
            data-testid="back-btn"
          >
            <ArrowLeft size={18} />
            Back
          </button>

          {/* Form Header */}
          <div className="mb-8">
            <h2 className="font-heading text-4xl tracking-tight mb-2">
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-gray-400">
              {isLogin
                ? 'Sign in to continue to your channels'
                : 'Start creating your TV network today'}
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
                  placeholder="you@example.com"
                  className={`pl-11 bg-black/50 border-white/10 h-12 ${errors.email ? 'border-red-500' : ''}`}
                  data-testid="email-input"
                />
              </div>
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
            </div>

            {!isLogin && (
              <div>
                <Label htmlFor="username" className="text-gray-300">Username</Label>
                <div className="relative mt-2">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    value={formData.username}
                    onChange={handleChange}
                    placeholder="yourname"
                    className={`pl-11 bg-black/50 border-white/10 h-12 ${errors.username ? 'border-red-500' : ''}`}
                    data-testid="username-input"
                  />
                </div>
                {errors.username && <p className="text-red-500 text-sm mt-1">{errors.username}</p>}
              </div>
            )}

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

            {!isLogin && (
              <div>
                <Label htmlFor="confirmPassword" className="text-gray-300">Confirm Password</Label>
                <div className="relative mt-2">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className={`pl-11 bg-black/50 border-white/10 h-12 ${errors.confirmPassword ? 'border-red-500' : ''}`}
                    data-testid="confirm-password-input"
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="text-red-500 text-sm mt-1">{errors.confirmPassword}</p>
                )}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-hover h-12 font-bold text-lg glow-primary-hover"
              data-testid="submit-btn"
            >
              {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          {/* Toggle */}
          <div className="mt-6 text-center">
            <p className="text-gray-400">
              {isLogin ? "Don't have an account?" : 'Already have an account?'}
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setErrors({});
                }}
                className="ml-2 text-primary hover:underline font-medium"
                data-testid="toggle-auth-mode"
              >
                {isLogin ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </div>

          {/* Guest Notice */}
          <div className="mt-8 p-4 bg-black/30 rounded-lg border border-white/5">
            <p className="text-sm text-gray-400 text-center">
              You can browse channels as a guest.
              <Link to="/browse" className="text-primary hover:underline ml-1">
                Browse Now
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
