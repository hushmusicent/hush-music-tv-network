import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { channelsAPI } from '../lib/api';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  RefreshCw, 
  ChevronDown, 
  ChevronRight,
  Play,
  Tv
} from 'lucide-react';
import { Button } from '../components/ui/button';
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_BACKEND_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const Schedule = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedChannels, setExpandedChannels] = useState({});
  const [currentDate, setCurrentDate] = useState('');

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
      loadSchedules();
    }
  }, [isAuthenticated, user, authLoading, navigate]);

  const loadSchedules = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/schedule/channels');
      setSchedules(response.data.schedules || []);
      setCurrentDate(response.data.date);
      
      // Expand first channel by default
      if (response.data.schedules?.length > 0) {
        setExpandedChannels({ [response.data.schedules[0].channel_id]: true });
      }
    } catch (error) {
      console.error('Failed to load schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const regenerateSchedule = async (channelId) => {
    try {
      setRefreshing(true);
      const response = await api.post(`/api/schedule/regenerate/${channelId}`);
      
      // Update the schedule in state
      setSchedules(prev => prev.map(s => 
        s.channel_id === channelId ? response.data : s
      ));
    } catch (error) {
      console.error('Failed to regenerate schedule:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const toggleChannel = (channelId) => {
    setExpandedChannels(prev => ({
      ...prev,
      [channelId]: !prev[channelId]
    }));
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getCurrentTimePosition = () => {
    const now = new Date();
    const hours = now.getHours();
    const mins = now.getMinutes();
    return ((hours * 60 + mins) / (24 * 60)) * 100;
  };

  const getTimeSlotPosition = (timeStr) => {
    const [hours, mins] = timeStr.split(':').map(Number);
    return ((hours * 60 + mins) / (24 * 60)) * 100;
  };

  const getTimeSlotWidth = (startStr, endStr) => {
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;
    return ((endMins - startMins) / (24 * 60)) * 100;
  };

  if (authLoading || !user || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Calendar size={48} className="mx-auto mb-4 text-primary animate-pulse" />
          <p className="text-muted-foreground">Loading schedules...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate('/dashboard')}
            data-testid="back-to-dashboard"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Calendar className="text-primary" />
              24-Hour Schedule
            </h1>
            <p className="text-muted-foreground mt-1">
              Random video schedules for all channels • {currentDate}
            </p>
          </div>
        </div>
        <Button 
          onClick={loadSchedules}
          disabled={refreshing}
          data-testid="refresh-all-schedules"
        >
          <RefreshCw size={16} className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh All
        </Button>
      </div>

      {/* Time Header */}
      <div className="mb-4 ml-72 mr-4">
        <div className="flex justify-between text-xs text-muted-foreground">
          {[0, 3, 6, 9, 12, 15, 18, 21].map(hour => (
            <span key={hour} className="w-12 text-center">
              {hour === 0 ? '12 AM' : hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
            </span>
          ))}
        </div>
      </div>

      {/* Channels List */}
      <div className="space-y-4">
        {schedules.map((schedule) => (
          <div 
            key={schedule.channel_id} 
            className="bg-card rounded-lg border border-border overflow-hidden"
            data-testid={`schedule-channel-${schedule.channel_id}`}
          >
            {/* Channel Header */}
            <div 
              className="flex items-center p-4 cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => toggleChannel(schedule.channel_id)}
            >
              <button className="mr-3 text-muted-foreground">
                {expandedChannels[schedule.channel_id] ? (
                  <ChevronDown size={20} />
                ) : (
                  <ChevronRight size={20} />
                )}
              </button>
              
              {schedule.channel_thumbnail ? (
                <img 
                  src={schedule.channel_thumbnail} 
                  alt={schedule.channel_name}
                  className="w-12 h-12 rounded object-cover mr-4"
                />
              ) : (
                <div className="w-12 h-12 rounded bg-primary/20 flex items-center justify-center mr-4">
                  <Tv size={24} className="text-primary" />
                </div>
              )}
              
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{schedule.channel_name}</h3>
                <p className="text-sm text-muted-foreground">
                  {schedule.videos.length} scheduled slots
                </p>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  regenerateSchedule(schedule.channel_id);
                }}
                disabled={refreshing}
                data-testid={`regenerate-${schedule.channel_id}`}
              >
                <RefreshCw size={14} className={`mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                Shuffle
              </Button>
            </div>

            {/* Timeline View */}
            {expandedChannels[schedule.channel_id] && (
              <div className="border-t border-border">
                {/* Timeline Bar */}
                <div className="relative h-16 bg-background mx-4 my-4 rounded overflow-hidden">
                  {/* Hour markers */}
                  {[...Array(24)].map((_, i) => (
                    <div 
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-border/30"
                      style={{ left: `${(i / 24) * 100}%` }}
                    />
                  ))}
                  
                  {/* Current time indicator */}
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"
                    style={{ left: `${getCurrentTimePosition()}%` }}
                  >
                    <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-500 rounded-full" />
                  </div>
                  
                  {/* Video blocks */}
                  {schedule.videos.slice(0, 50).map((video, idx) => (
                    <div
                      key={`${video.video_id}-${idx}`}
                      className="absolute top-1 bottom-1 rounded overflow-hidden group cursor-pointer"
                      style={{
                        left: `${getTimeSlotPosition(video.start_time)}%`,
                        width: `${Math.max(getTimeSlotWidth(video.start_time, video.end_time), 0.5)}%`,
                        backgroundColor: `hsl(${(idx * 37) % 360}, 70%, 50%)`,
                      }}
                      title={`${video.title}\n${video.start_time} - ${video.end_time}`}
                    >
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                    </div>
                  ))}
                </div>

                {/* Video List */}
                <div className="max-h-96 overflow-y-auto px-4 pb-4">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-left text-muted-foreground border-b border-border">
                        <th className="py-2 px-2 w-24">Time</th>
                        <th className="py-2 px-2">Video</th>
                        <th className="py-2 px-2 w-20 text-right">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.videos.map((video, idx) => (
                        <tr 
                          key={`${video.video_id}-${idx}`}
                          className="border-b border-border/50 hover:bg-accent/30"
                        >
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Clock size={12} />
                              <span className="font-mono text-xs">
                                {video.start_time.slice(0, 5)}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-3">
                              {video.thumbnail ? (
                                <img 
                                  src={video.thumbnail} 
                                  alt={video.title}
                                  className="w-16 h-9 rounded object-cover"
                                />
                              ) : (
                                <div className="w-16 h-9 rounded bg-muted flex items-center justify-center">
                                  <Play size={14} className="text-muted-foreground" />
                                </div>
                              )}
                              <span className="truncate max-w-md">{video.title}</span>
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right text-muted-foreground">
                            {formatDuration(video.duration)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {schedules.length === 0 && !loading && (
        <div className="text-center py-16">
          <Calendar size={64} className="mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-xl font-semibold mb-2">No Schedules Available</h3>
          <p className="text-muted-foreground">
            Add videos to your channels to generate schedules.
          </p>
        </div>
      )}
    </div>
  );
};

export default Schedule;
