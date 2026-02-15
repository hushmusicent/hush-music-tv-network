import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { analyticsAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { 
  BarChart3, 
  Users, 
  Eye, 
  TrendingUp,
  RefreshCw,
  ArrowLeft,
  Radio
} from 'lucide-react';

const Analytics = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Wait for auth to finish loading before checking permissions
    if (authLoading) return;
    
    // First check if user is authenticated at all
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    
    // Only redirect if we have user data AND they're not admin
    // This prevents redirect when user object is still being populated
    if (user && user.is_admin === false) {
      navigate('/');
      return;
    }
    
    // Load stats if user is admin (or user.is_admin is undefined/true)
    if (user?.is_admin) {
      loadStats();
    }
  }, [isAuthenticated, user, authLoading, navigate]);

  const loadStats = async () => {
    try {
      setRefreshing(true);
      const response = await analyticsAPI.getStats();
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Show loading while auth is being checked
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <BarChart3 size={48} className="mx-auto mb-4 text-primary animate-pulse" />
          <p className="text-gray-400">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 md:px-12 lg:px-16 py-8" data-testid="analytics-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => navigate('/dashboard')}
            className="p-2"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="font-heading text-4xl md:text-5xl tracking-tight flex items-center gap-3">
              <BarChart3 size={36} className="text-primary" />
              Analytics
            </h1>
            <p className="text-gray-400 mt-2">
              Track your channel performance and viewer engagement
            </p>
          </div>
        </div>

        <Button
          onClick={loadStats}
          disabled={refreshing}
          className="bg-primary hover:bg-primary-hover"
        >
          <RefreshCw size={16} className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Current Viewers */}
        <div className="bg-surface rounded-xl border border-white/10 p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500/20 rounded-lg">
              <Users size={24} className="text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Current Viewers</p>
              <p className="text-3xl font-bold text-green-400">
                {stats?.current_viewers || 0}
              </p>
              <p className="text-xs text-gray-500">Active in last 5 minutes</p>
            </div>
          </div>
        </div>

        {/* 24h Viewers */}
        <div className="bg-surface rounded-xl border border-white/10 p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <Eye size={24} className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Viewers (24h)</p>
              <p className="text-3xl font-bold text-blue-400">
                {stats?.viewers_24h || 0}
              </p>
              <p className="text-xs text-gray-500">Unique viewers</p>
            </div>
          </div>
        </div>

        {/* Total Views */}
        <div className="bg-surface rounded-xl border border-white/10 p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-500/20 rounded-lg">
              <TrendingUp size={24} className="text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Views (24h)</p>
              <p className="text-3xl font-bold text-purple-400">
                {stats?.total_views_24h || 0}
              </p>
              <p className="text-xs text-gray-500">All channel views</p>
            </div>
          </div>
        </div>
      </div>

      {/* Channel Stats */}
      <div className="bg-surface rounded-xl border border-white/10 p-6">
        <h2 className="font-heading text-xl mb-6 flex items-center gap-2">
          <Radio size={20} className="text-primary" />
          Channel Performance (Last 24 Hours)
        </h2>

        {stats?.channel_stats?.length > 0 ? (
          <div className="space-y-4">
            {stats.channel_stats.map((channel, index) => {
              const maxViews = stats.channel_stats[0]?.total_views || 1;
              const percentage = (channel.total_views / maxViews) * 100;
              
              return (
                <div key={channel.channel_id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-400 w-6">
                        #{index + 1}
                      </span>
                      <span className="font-medium">{channel.channel_name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-primary font-bold">{channel.total_views}</span>
                      <span className="text-gray-500 text-sm ml-1">views</span>
                      <span className="text-gray-400 text-sm ml-3">
                        ({channel.unique_viewers} unique)
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-primary to-purple-500 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <Eye size={48} className="mx-auto mb-4 text-gray-600" />
            <p className="text-gray-400">No viewing data yet</p>
            <p className="text-gray-500 text-sm mt-2">
              Analytics will appear as viewers watch your channels
            </p>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-6 text-sm text-gray-500">
        <p>
          Viewer data is collected anonymously when users watch channels. 
          Current viewers shows activity in the last 5 minutes.
        </p>
      </div>
    </div>
  );
};

export default Analytics;
