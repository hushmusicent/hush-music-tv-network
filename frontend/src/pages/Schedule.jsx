import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  RefreshCw, 
  Play,
  Tv,
  ChevronLeft,
  ChevronRight
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
  const [currentDate, setCurrentDate] = useState('');
  const [currentHour, setCurrentHour] = useState(new Date().getHours());
  const [visibleHours, setVisibleHours] = useState([]);
  const timelineRef = useRef(null);

  // Calculate visible hour range (6 hours at a time)
  useEffect(() => {
    const hours = [];
    for (let i = 0; i < 6; i++) {
      hours.push((currentHour + i) % 24);
    }
    setVisibleHours(hours);
  }, [currentHour]);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHour(new Date().getHours());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

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
      
      setSchedules(prev => prev.map(s => 
        s.channel_id === channelId ? response.data : s
      ));
    } catch (error) {
      console.error('Failed to regenerate schedule:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const formatTime = (hour) => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
  };

  const getVideosInTimeRange = (schedule, startHour, endHour) => {
    if (!schedule?.videos) return [];
    
    return schedule.videos.filter(video => {
      const [videoStartH] = video.start_time.split(':').map(Number);
      const [videoEndH] = video.end_time.split(':').map(Number);
      
      // Check if video overlaps with the hour range
      return (videoStartH >= startHour && videoStartH < endHour) ||
             (videoStartH < startHour && videoEndH > startHour);
    });
  };

  const getVideoPosition = (video, hourStart) => {
    const [startH, startM] = video.start_time.split(':').map(Number);
    const videoStartMinutes = startH * 60 + startM;
    const hourStartMinutes = hourStart * 60;
    
    // Calculate left position within the hour cell
    const offsetMinutes = Math.max(0, videoStartMinutes - hourStartMinutes);
    const leftPercent = (offsetMinutes / 60) * 100;
    
    // Calculate width
    const durationMinutes = video.duration / 60;
    const remainingInHour = 60 - offsetMinutes;
    const widthMinutes = Math.min(durationMinutes, remainingInHour);
    const widthPercent = Math.min((widthMinutes / 60) * 100, 100 - leftPercent);
    
    return { left: `${leftPercent}%`, width: `${Math.max(widthPercent, 5)}%` };
  };

  const getCurrentTimePosition = () => {
    const now = new Date();
    const hours = now.getHours();
    const mins = now.getMinutes();
    
    // Check if current time is in visible range
    if (!visibleHours.includes(hours)) return null;
    
    const hourIndex = visibleHours.indexOf(hours);
    const leftPercent = (hourIndex + mins / 60) * (100 / 6);
    
    return leftPercent;
  };

  const scrollHours = (direction) => {
    if (direction === 'left') {
      setCurrentHour(prev => (prev - 3 + 24) % 24);
    } else {
      setCurrentHour(prev => (prev + 3) % 24);
    }
  };

  const goToNow = () => {
    setCurrentHour(new Date().getHours());
  };

  if (authLoading || !user || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <Calendar size={48} className="mx-auto mb-4 text-primary animate-pulse" />
          <p className="text-muted-foreground">Loading TV Guide...</p>
        </div>
      </div>
    );
  }

  const currentTimePos = getCurrentTimePosition();

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white" data-testid="schedule-page">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0f]/95 backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate('/dashboard')}
              className="hover:bg-white/10"
              data-testid="back-to-dashboard"
            >
              <ArrowLeft size={20} />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <Tv className="text-primary" size={28} />
                TV Guide
              </h1>
              <p className="text-sm text-gray-400 mt-0.5">
                24-Hour Schedule • {currentDate}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button 
              variant="outline"
              size="sm"
              onClick={goToNow}
              className="border-red-500/50 text-red-400 hover:bg-red-500/10"
              data-testid="go-to-now-btn"
            >
              <Clock size={14} className="mr-1.5" />
              Now
            </Button>
            <Button 
              onClick={loadSchedules}
              disabled={refreshing}
              size="sm"
              className="bg-primary hover:bg-primary/90"
              data-testid="refresh-all-schedules"
            >
              <RefreshCw size={14} className={`mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Time Navigation */}
        <div className="flex items-center px-6 pb-4">
          <div className="w-48 flex-shrink-0" />
          
          <div className="flex items-center flex-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => scrollHours('left')}
              className="hover:bg-white/10 mr-2"
              data-testid="scroll-left"
            >
              <ChevronLeft size={20} />
            </Button>
            
            <div className="flex-1 relative">
              <div className="grid grid-cols-6 gap-px">
                {visibleHours.map((hour, idx) => (
                  <div 
                    key={idx}
                    className={`text-center py-2 text-sm font-medium border-b-2 ${
                      hour === new Date().getHours() 
                        ? 'text-red-400 border-red-500' 
                        : 'text-gray-400 border-transparent'
                    }`}
                  >
                    {formatTime(hour)}
                  </div>
                ))}
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={() => scrollHours('right')}
              className="hover:bg-white/10 ml-2"
              data-testid="scroll-right"
            >
              <ChevronRight size={20} />
            </Button>
          </div>
        </div>
      </div>

      {/* TV Guide Grid */}
      <div className="relative" ref={timelineRef}>
        {/* Current Time Indicator */}
        {currentTimePos !== null && (
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"
            style={{ left: `calc(192px + ${currentTimePos}% * (100% - 192px - 56px) / 100)` }}
          >
            <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-500 rounded-full" />
          </div>
        )}

        {/* Channel Rows */}
        <div className="divide-y divide-white/5">
          {schedules.map((schedule) => (
            <div 
              key={schedule.channel_id} 
              className="flex hover:bg-white/[0.02] transition-colors"
              data-testid={`schedule-channel-${schedule.channel_id}`}
            >
              {/* Channel Info */}
              <div className="w-48 flex-shrink-0 p-3 flex items-center gap-3 bg-[#12121a] border-r border-white/10">
                {schedule.channel_thumbnail ? (
                  <img 
                    src={schedule.channel_thumbnail} 
                    alt={schedule.channel_name}
                    className="w-12 h-12 rounded object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded bg-primary/20 flex items-center justify-center">
                    <Tv size={20} className="text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm truncate">{schedule.channel_name}</h3>
                  <p className="text-xs text-gray-500">{schedule.videos?.length || 0} videos</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => regenerateSchedule(schedule.channel_id)}
                  disabled={refreshing}
                  className="h-7 w-7 hover:bg-white/10"
                  title="Shuffle schedule"
                  data-testid={`regenerate-${schedule.channel_id}`}
                >
                  <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                </Button>
              </div>

              {/* Timeline Grid */}
              <div className="flex-1 flex">
                {visibleHours.map((hour, hourIdx) => {
                  const videosInHour = getVideosInTimeRange(schedule, hour, hour + 1);
                  const isCurrentHour = hour === new Date().getHours();
                  
                  return (
                    <div 
                      key={hourIdx}
                      className={`flex-1 relative h-20 border-r border-white/5 ${
                        isCurrentHour ? 'bg-red-500/5' : ''
                      }`}
                    >
                      {videosInHour.slice(0, 3).map((video, vidIdx) => {
                        const pos = getVideoPosition(video, hour);
                        const colors = [
                          'bg-gradient-to-r from-primary/80 to-primary/60',
                          'bg-gradient-to-r from-purple-600/80 to-purple-600/60',
                          'bg-gradient-to-r from-cyan-600/80 to-cyan-600/60',
                          'bg-gradient-to-r from-amber-600/80 to-amber-600/60',
                          'bg-gradient-to-r from-rose-600/80 to-rose-600/60',
                        ];
                        
                        return (
                          <div
                            key={`${video.video_id}-${vidIdx}`}
                            className={`absolute top-1 bottom-1 rounded overflow-hidden cursor-pointer group ${colors[vidIdx % colors.length]}`}
                            style={{ left: pos.left, width: pos.width, minWidth: '40px' }}
                            title={`${video.title}\n${video.start_time} - ${video.end_time}`}
                          >
                            <div className="absolute inset-0 p-1.5 flex flex-col justify-between">
                              <p className="text-[10px] font-medium truncate leading-tight">
                                {video.title}
                              </p>
                              <div className="flex items-center gap-1 text-[9px] text-white/70">
                                <Clock size={8} />
                                {video.start_time.slice(0, 5)}
                              </div>
                            </div>
                            <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors" />
                          </div>
                        );
                      })}
                      
                      {videosInHour.length === 0 && (
                        <div className="absolute inset-1 rounded bg-white/5 flex items-center justify-center">
                          <span className="text-[10px] text-gray-600">-</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* Spacer for scroll buttons */}
              <div className="w-14 flex-shrink-0" />
            </div>
          ))}
        </div>

        {/* Empty State */}
        {schedules.length === 0 && !loading && (
          <div className="text-center py-20">
            <Calendar size={64} className="mx-auto mb-4 text-gray-600" />
            <h3 className="text-xl font-semibold mb-2">No Schedules Available</h3>
            <p className="text-gray-500 mb-6">
              Add videos to your channels to generate schedules.
            </p>
            <Button onClick={() => navigate('/dashboard')} className="bg-primary">
              Go to Dashboard
            </Button>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#12121a] border border-white/10 rounded-full px-4 py-2 flex items-center gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          <span>Live Now</span>
        </div>
        <div className="w-px h-4 bg-white/20" />
        <div className="flex items-center gap-1.5">
          <Play size={12} className="text-primary" />
          <span>Click to preview</span>
        </div>
        <div className="w-px h-4 bg-white/20" />
        <div className="flex items-center gap-1.5">
          <RefreshCw size={12} />
          <span>Shuffle schedule</span>
        </div>
      </div>
    </div>
  );
};

export default Schedule;
