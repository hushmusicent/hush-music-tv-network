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
  Radio,
  Clock,
  SkipForward,
  ChevronRight,
  X,
  UserPlus,
  UserCheck
} from 'lucide-react';

const Analytics = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [channelDetail, setChannelDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  const loadChannelDetail = async (channelId, channelName) => {
    setSelectedChannel({ id: channelId, name: channelName });
    setDetailLoading(true);
    try {
      const response = await analyticsAPI.getChannelStats(channelId);
      setChannelDetail(response.data);
    } catch (error) {
      console.error('Failed to load channel analytics:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  // Show loading while auth is being checked or user data is loading
  if (authLoading || !user || loading) {
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
                <button
                  key={channel.channel_id}
                  onClick={() => loadChannelDetail(channel.channel_id, channel.channel_name)}
                  className="w-full text-left space-y-2 group hover:bg-white/5 rounded-lg p-2 -m-2 transition-colors"
                  data-testid={`channel-stat-${channel.channel_id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-400 w-6">
                        #{index + 1}
                      </span>
                      <span className="font-medium group-hover:text-primary transition-colors">{channel.channel_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <div>
                        <span className="text-primary font-bold">{channel.total_views}</span>
                        <span className="text-gray-500 text-sm ml-1">views</span>
                        <span className="text-gray-400 text-sm ml-3">
                          ({channel.unique_viewers} unique)
                        </span>
                      </div>
                      <ChevronRight size={14} className="text-gray-500 group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                  <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-primary to-purple-500 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </button>
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

      {/* Channel Detail Panel */}
      {selectedChannel && (
        <div className="mt-6 bg-surface rounded-xl border border-white/10 p-6" data-testid="channel-detail-analytics">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-heading text-xl flex items-center gap-2">
              <BarChart3 size={20} className="text-primary" />
              {selectedChannel.name}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => { setSelectedChannel(null); setChannelDetail(null); }}>
              <X size={16} />
            </Button>
          </div>

          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={24} className="animate-spin text-primary" />
            </div>
          ) : channelDetail ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-black/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                    <Eye size={12} /> 7-Day Views
                  </div>
                  <p className="text-2xl font-bold text-blue-400">{channelDetail.total_views_7d}</p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                    <Users size={12} /> Unique Viewers
                  </div>
                  <p className="text-2xl font-bold text-green-400">{channelDetail.unique_viewers_7d}</p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                    <UserPlus size={12} /> New Viewers
                  </div>
                  <p className="text-2xl font-bold text-cyan-400">{channelDetail.new_viewers}</p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                    <UserCheck size={12} /> Returning
                  </div>
                  <p className="text-2xl font-bold text-purple-400">{channelDetail.returning_viewers}</p>
                </div>
              </div>

              {/* Peak Hours Heatmap */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                  <Clock size={14} /> Peak Hours (Last 7 Days)
                </h3>
                <div className="flex gap-[2px] items-end h-24">
                  {channelDetail.peak_hours?.map((count, hour) => {
                    const max = Math.max(...channelDetail.peak_hours, 1);
                    const pct = (count / max) * 100;
                    return (
                      <div key={hour} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div 
                          className="w-full rounded-t transition-all bg-gradient-to-t from-blue-600 to-blue-400 hover:from-blue-500 hover:to-blue-300 min-h-[2px]"
                          style={{ height: `${Math.max(pct, 2)}%` }}
                        />
                        {hour % 3 === 0 && (
                          <span className="text-[9px] text-gray-500">{hour === 0 ? '12a' : hour <= 12 ? `${hour}${hour === 12 ? 'p' : 'a'}` : `${hour - 12}p`}</span>
                        )}
                        <div className="absolute bottom-full mb-1 bg-black/90 text-[10px] text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                          {hour}:00 - {count} views
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Daily Timeline */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                  <TrendingUp size={14} /> Daily Views (Last 7 Days)
                </h3>
                <div className="flex gap-2 items-end h-20">
                  {channelDetail.daily_timeline?.map((day) => {
                    const max = Math.max(...channelDetail.daily_timeline.map(d => d.views), 1);
                    const pct = (day.views / max) * 100;
                    const label = new Date(day.date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' });
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] text-gray-400">{day.views}</span>
                        <div 
                          className="w-full rounded-t bg-gradient-to-t from-purple-600 to-purple-400 min-h-[2px]"
                          style={{ height: `${Math.max(pct, 2)}%` }}
                        />
                        <span className="text-[10px] text-gray-500">{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Most Viewed & Most Skipped */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {channelDetail.most_viewed?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                      <Eye size={14} /> Most Watched Videos
                    </h3>
                    <div className="space-y-2">
                      {channelDetail.most_viewed.slice(0, 8).map((v, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs bg-black/20 rounded px-2 py-1.5">
                          <span className="text-gray-500 w-4">{i + 1}</span>
                          <span className="truncate flex-1">{v.title}</span>
                          <span className="text-green-400 font-medium">{v.views}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {channelDetail.most_skipped?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                      <SkipForward size={14} className="text-red-400" /> Most Skipped Videos
                    </h3>
                    <div className="space-y-2">
                      {channelDetail.most_skipped.slice(0, 8).map((v, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs bg-black/20 rounded px-2 py-1.5">
                          <span className="text-gray-500 w-4">{i + 1}</span>
                          <span className="truncate flex-1">{v.title}</span>
                          <span className="text-red-400 font-medium">{v.skips} skips</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

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
