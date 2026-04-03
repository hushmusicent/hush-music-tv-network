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
  Clock,
  Calendar,
  Globe,
  MapPin,
  Tv,
  Play,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

const Analytics = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [stats, setStats] = useState(null);
  const [commercialStats, setCommercialStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // overview, time, demographics, commercials
  const [timeRange, setTimeRange] = useState('daily'); // hourly, daily, weekly, monthly
  const [expandedSections, setExpandedSections] = useState({
    channels: true,
    demographics: true,
    geographic: true
  });

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (user && user.is_admin === false) {
      navigate('/');
      return;
    }
    if (user?.is_admin) {
      loadStats();
    }
  }, [isAuthenticated, user, authLoading, navigate]);

  const loadStats = async () => {
    try {
      setRefreshing(true);
      const [statsRes, commercialRes] = await Promise.all([
        analyticsAPI.getStats(),
        analyticsAPI.getCommercialStats().catch(() => ({ data: null }))
      ]);
      setStats(statsRes.data);
      setCommercialStats(commercialRes.data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (authLoading || !user || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-center">
          <BarChart3 size={48} className="mx-auto mb-4 text-purple-500 animate-pulse" />
          <p className="text-gray-400">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const StatCard = ({ icon: Icon, label, value, subValue, color = "purple" }) => (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 md:p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg bg-${color}-500/20`}>
          <Icon size={20} className={`text-${color}-400`} />
        </div>
        <span className="text-gray-400 text-sm">{label}</span>
      </div>
      <p className="text-2xl md:text-3xl font-bold text-white">{value}</p>
      {subValue && <p className="text-sm text-gray-500 mt-1">{subValue}</p>}
    </div>
  );

  const BarChartSimple = ({ data, label, maxBars = 24 }) => {
    const entries = Object.entries(data || {}).slice(0, maxBars);
    const maxValue = Math.max(...entries.map(([_, v]) => v), 1);
    
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 md:p-6">
        <h3 className="text-white font-semibold mb-4">{label}</h3>
        <div className="flex items-end gap-1 h-32">
          {entries.map(([key, value]) => (
            <div key={key} className="flex-1 flex flex-col items-center">
              <div 
                className="w-full bg-purple-500 rounded-t min-h-[2px]"
                style={{ height: `${(value / maxValue) * 100}%` }}
                title={`${key}: ${value}`}
              />
              <span className="text-[10px] text-gray-500 mt-1 rotate-45 origin-left">{key.slice(-2)}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-2">
          <span>0</span>
          <span>{maxValue}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-950 px-4 md:px-8 lg:px-12 py-6" data-testid="analytics-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => navigate('/dashboard')}
            className="text-gray-400 hover:text-white"
            data-testid="back-to-dashboard"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Analytics Dashboard</h1>
            <p className="text-gray-500 text-sm">Comprehensive viewer insights</p>
          </div>
        </div>
        <Button
          onClick={loadStats}
          disabled={refreshing}
          className="bg-purple-600 hover:bg-purple-700"
          data-testid="refresh-analytics"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'time', label: 'Time Analysis', icon: Clock },
          { id: 'demographics', label: 'Geographic', icon: Globe },
          { id: 'commercials', label: 'Commercials', icon: Play }
        ].map(tab => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'ghost'}
            onClick={() => setActiveTab(tab.id)}
            className={activeTab === tab.id ? 'bg-purple-600' : 'text-gray-400'}
            data-testid={`tab-${tab.id}`}
          >
            <tab.icon size={16} className="mr-2" />
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && stats && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Users} label="Current Viewers" value={stats.current_viewers || 0} color="green" />
            <StatCard icon={Eye} label="Views (24h)" value={stats.total_views_24h || 0} color="blue" />
            <StatCard icon={Users} label="Unique (24h)" value={stats.viewers_24h || 0} color="purple" />
            <StatCard 
              icon={TrendingUp} 
              label="All Time Views" 
              value={stats.time_stats?.yearly?.total_views || 0} 
              color="yellow" 
            />
          </div>

          {/* Channel Stats */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 md:p-6">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => toggleSection('channels')}
            >
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Tv size={18} />
                Channel Performance (24h)
              </h3>
              {expandedSections.channels ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
            </div>
            {expandedSections.channels && (
              <div className="mt-4 space-y-2 max-h-80 overflow-y-auto">
                {(stats.channel_stats || []).map((channel, idx) => (
                  <div key={channel.channel_id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-800/50">
                    <span className="text-gray-500 w-6 text-sm">{idx + 1}</span>
                    <span className="text-white flex-1 truncate">{channel.channel_name}</span>
                    <span className="text-purple-400 font-mono">{channel.total_views} views</span>
                    <span className="text-gray-500 text-sm">{channel.unique_viewers} unique</span>
                  </div>
                ))}
                {(!stats.channel_stats || stats.channel_stats.length === 0) && (
                  <p className="text-gray-500 text-center py-4">No channel data yet</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Time Analysis Tab */}
      {activeTab === 'time' && stats && (
        <div className="space-y-6">
          {/* Time Range Selector */}
          <div className="flex gap-2 flex-wrap">
            {['hourly', 'daily', 'weekly', 'monthly'].map(range => (
              <Button
                key={range}
                variant={timeRange === range ? 'default' : 'outline'}
                onClick={() => setTimeRange(range)}
                className={timeRange === range ? 'bg-purple-600' : 'border-gray-700 text-gray-300'}
                size="sm"
              >
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </Button>
            ))}
          </div>

          {/* Time Stats Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard 
              icon={Clock} 
              label={`${timeRange.charAt(0).toUpperCase() + timeRange.slice(1)} Views`}
              value={stats.time_stats?.[timeRange]?.views || 0}
            />
            <StatCard 
              icon={Users} 
              label={`${timeRange.charAt(0).toUpperCase() + timeRange.slice(1)} Unique`}
              value={stats.time_stats?.[timeRange]?.viewers || 0}
            />
            <StatCard 
              icon={Calendar} 
              label="Yearly Total"
              value={stats.time_stats?.yearly?.total_views || 0}
            />
          </div>

          {/* Distribution Chart */}
          <BarChartSimple 
            data={stats.time_stats?.[timeRange]?.distribution} 
            label={`${timeRange.charAt(0).toUpperCase() + timeRange.slice(1)} Distribution`}
            maxBars={timeRange === 'hourly' ? 24 : timeRange === 'daily' ? 7 : timeRange === 'weekly' ? 4 : 12}
          />
        </div>
      )}

      {/* Demographics Tab */}
      {activeTab === 'demographics' && stats && (
        <div className="space-y-6">
          {/* Geographic Data */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 md:p-6">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => toggleSection('geographic')}
            >
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Globe size={18} />
                Geographic Distribution
              </h3>
              {expandedSections.geographic ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
            </div>
            {expandedSections.geographic && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Countries */}
                <div className="bg-gray-800/30 rounded-lg p-4">
                  <h4 className="text-gray-400 text-sm mb-3 flex items-center gap-2">
                    <Globe size={14} /> Top Countries
                  </h4>
                  <div className="space-y-2">
                    {Object.entries(stats.demographics?.geographic?.countries || {}).map(([country, count], idx) => (
                      <div key={country} className="flex justify-between text-sm items-center">
                        <span className="text-gray-300 flex items-center gap-2">
                          <span className="text-gray-500 w-4">{idx + 1}.</span>
                          {country}
                        </span>
                        <span className="text-purple-400 font-mono">{count}</span>
                      </div>
                    ))}
                    {Object.keys(stats.demographics?.geographic?.countries || {}).length === 0 && (
                      <p className="text-gray-500 text-sm">No data yet</p>
                    )}
                  </div>
                </div>

                {/* Regions */}
                <div className="bg-gray-800/30 rounded-lg p-4">
                  <h4 className="text-gray-400 text-sm mb-3 flex items-center gap-2">
                    <MapPin size={14} /> Top Regions
                  </h4>
                  <div className="space-y-2">
                    {Object.entries(stats.demographics?.geographic?.regions || {}).map(([region, count], idx) => (
                      <div key={region} className="flex justify-between text-sm items-center">
                        <span className="text-gray-300 flex items-center gap-2">
                          <span className="text-gray-500 w-4">{idx + 1}.</span>
                          {region}
                        </span>
                        <span className="text-purple-400 font-mono">{count}</span>
                      </div>
                    ))}
                    {Object.keys(stats.demographics?.geographic?.regions || {}).length === 0 && (
                      <p className="text-gray-500 text-sm">No data yet</p>
                    )}
                  </div>
                </div>

                {/* Cities */}
                <div className="bg-gray-800/30 rounded-lg p-4">
                  <h4 className="text-gray-400 text-sm mb-3 flex items-center gap-2">
                    <MapPin size={14} /> Top Cities
                  </h4>
                  <div className="space-y-2">
                    {Object.entries(stats.demographics?.geographic?.cities || {}).map(([city, count], idx) => (
                      <div key={city} className="flex justify-between text-sm items-center">
                        <span className="text-gray-300 flex items-center gap-2">
                          <span className="text-gray-500 w-4">{idx + 1}.</span>
                          {city}
                        </span>
                        <span className="text-purple-400 font-mono">{count}</span>
                      </div>
                    ))}
                    {Object.keys(stats.demographics?.geographic?.cities || {}).length === 0 && (
                      <p className="text-gray-500 text-sm">No data yet</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Info about auto-collection */}
          <div className="bg-green-900/20 border border-green-800/50 rounded-xl p-4">
            <p className="text-green-300 text-sm">
              Geographic data is automatically collected from viewer IP addresses - no survey required.
            </p>
          </div>
        </div>
      )}

      {/* Commercials Tab */}
      {activeTab === 'commercials' && (
        <div className="space-y-6">
          {commercialStats ? (
            <>
              {/* Commercial Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={Play} label="Plays (24h)" value={commercialStats.total_plays_24h || 0} color="green" />
                <StatCard icon={Eye} label="Plays (7d)" value={commercialStats.total_plays_7d || 0} color="blue" />
                <StatCard icon={Calendar} label="Plays (30d)" value={commercialStats.total_plays_30d || 0} color="purple" />
                <StatCard icon={TrendingUp} label="All Time" value={commercialStats.total_plays_all_time || 0} color="yellow" />
              </div>

              {/* Commercial Time Distribution */}
              <BarChartSimple 
                data={commercialStats.time_stats?.daily} 
                label="Daily Commercial Plays (Last 7 Days)"
                maxBars={7}
              />

              {/* Per-Commercial Stats */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 md:p-6">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <Play size={18} />
                  Commercial Performance
                </h3>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {(commercialStats.commercial_stats || []).map((commercial, idx) => (
                    <div key={commercial.commercial_id} className="flex items-center gap-3 p-3 rounded bg-gray-800/30 hover:bg-gray-800/50">
                      <span className="text-gray-500 w-6 text-sm">{idx + 1}</span>
                      <span className="text-white flex-1 truncate">{commercial.commercial_name}</span>
                      <div className="flex gap-4 text-sm">
                        <span className="text-green-400">{commercial.plays} plays</span>
                        <span className="text-blue-400">{commercial.completes} complete</span>
                        <span className="text-yellow-400">{commercial.completion_rate}% rate</span>
                      </div>
                    </div>
                  ))}
                  {(!commercialStats.commercial_stats || commercialStats.commercial_stats.length === 0) && (
                    <p className="text-gray-500 text-center py-4">No commercial data yet</p>
                  )}
                </div>
              </div>

              {/* Commercial Geographic Distribution */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 md:p-6">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <Globe size={18} />
                  Commercial Viewers by Location
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(commercialStats.demographics?.countries || {}).map(([country, count]) => (
                    <div key={country} className="flex justify-between text-sm bg-gray-800/30 rounded p-2">
                      <span className="text-gray-300">{country}</span>
                      <span className="text-purple-400 font-mono">{count}</span>
                    </div>
                  ))}
                  {Object.keys(commercialStats.demographics?.countries || {}).length === 0 && (
                    <p className="text-gray-500 text-sm col-span-3">No geographic data yet</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <Play size={48} className="mx-auto mb-4 text-gray-600" />
              <p className="text-gray-400">No commercial analytics data available yet</p>
              <p className="text-gray-500 text-sm mt-2">Commercial analytics will appear once commercials start playing</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Analytics;
