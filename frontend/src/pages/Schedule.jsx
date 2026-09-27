import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  ChevronRight,
  ZoomIn,
  ZoomOut,
  X,
  Volume2,
  VolumeX,
  Maximize2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import axios from 'axios';
import YouTube from 'react-youtube';
import { getPrefetchedLiveSchedule } from '../lib/prefetch';
import { useVirtualList } from '../hooks/useVirtualList';

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

// Zoom levels: hours visible at once
const ZOOM_LEVELS = [
  { hours: 2, label: '2h' },
  { hours: 3, label: '3h' },
  { hours: 6, label: '6h' },
  { hours: 12, label: '12h' },
  { hours: 24, label: '24h' },
];

// Get current time in Eastern timezone
const getEasternTime = () => {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
};

const Schedule = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentDate, setCurrentDate] = useState('');
  const [startHour, setStartHour] = useState(getEasternTime().getHours());
  const [zoomLevel, setZoomLevel] = useState(2); // Index into ZOOM_LEVELS (default 6h)
  const [visibleHours, setVisibleHours] = useState([]);
  const timelineRef = useRef(null);
  
  // Video player state
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const playerRef = useRef(null);

  const hoursToShow = ZOOM_LEVELS[zoomLevel].hours;

  // Virtualize the channel-rows list so Fire TV Stick / Amazon Silk don't
  // mount 89 rows (each with a thumbnail + up to 40 timeline blocks) at once.
  // Rows are 72px tall (p-3 padding around a 48px thumbnail).
  const ROW_HEIGHT = 72;
  const rowsContainerRef = useRef(null);
  const {
    startIndex: scheduleRowsStart,
    endIndex: scheduleRowsEnd,
    offsetTop: scheduleRowsOffset,
  } = useVirtualList({
    containerRef: rowsContainerRef,
    itemCount: schedules.length,
    itemHeight: ROW_HEIGHT,
    overscan: 3,
    enabled: schedules.length > 0,
    useWindow: true,
  });

  // Calculate visible hour range based on zoom level
  useEffect(() => {
    const hours = [];
    for (let i = 0; i < hoursToShow; i++) {
      hours.push((startHour + i) % 24);
    }
    setVisibleHours(hours);
  }, [startHour, hoursToShow]);

  // Update current time every minute for live indicator
  useEffect(() => {
    const interval = setInterval(() => {
      // Force re-render for live indicator
      setStartHour(prev => prev);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    // TV Guide is public — load schedules regardless of auth state.
    loadSchedules();
  }, [isAuthenticated, user, authLoading]);

  const loadSchedules = async () => {
    try {
      setLoading(true);
      // Prefer prefetched cache (kicked off at app boot). Falls back to a
      // fresh network fetch inside the helper if the cache is empty/stale.
      const data = await getPrefetchedLiveSchedule();
      setSchedules(data.schedules || []);
      setCurrentDate(data.date);
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

  const formatTimeWithMinutes = (hour, minutes) => {
    const h = hour % 12 || 12;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${h}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  // Get the current video that should be playing based on time (Eastern)
  const getCurrentVideo = useCallback((schedule) => {
    if (!schedule?.videos) return null;
    
    const now = getEasternTime();
    const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    
    for (const video of schedule.videos) {
      const [startH, startM, startS] = video.start_time.split(':').map(Number);
      const [endH, endM, endS] = video.end_time.split(':').map(Number);
      const videoStart = startH * 3600 + startM * 60 + (startS || 0);
      const videoEnd = endH * 3600 + endM * 60 + (endS || 0);
      
      if (currentSeconds >= videoStart && currentSeconds < videoEnd) {
        const elapsedSeconds = currentSeconds - videoStart;
        return { ...video, elapsedSeconds };
      }
    }
    return null;
  }, []);

  // Play video at the synchronized position (Eastern time)
  const playVideoAtPosition = (video, channel) => {
    // Navigate to Live TV with this channel pre-selected so the player syncs
    // to the current Eastern-time slot for the channel.
    if (channel?.channel_id) {
      navigate(`/live?channel=${channel.channel_id}`);
      return;
    }
    const now = getEasternTime();
    const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const [startH, startM, startS] = video.start_time.split(':').map(Number);
    const videoStart = startH * 3600 + startM * 60 + (startS || 0);
    const elapsedSeconds = currentSeconds - videoStart;
    
    setSelectedVideo({ ...video, startAt: Math.max(0, elapsedSeconds) });
    setSelectedChannel(channel);
  };

  // Handle clicking on a video block
  const handleVideoClick = (video, schedule) => {
    playVideoAtPosition(video, schedule);
  };

  // Handle clicking on channel to watch current live video
  const handleChannelClick = (schedule) => {
    if (schedule?.channel_id) {
      navigate(`/live?channel=${schedule.channel_id}`);
      return;
    }
    const currentVideo = getCurrentVideo(schedule);
    if (currentVideo) {
      playVideoAtPosition(currentVideo, schedule);
    }
  };

  const getVideosInTimeRange = (schedule, rangeStartHour, rangeEndHour) => {
    if (!schedule?.videos) return [];
    
    return schedule.videos.filter(video => {
      const [videoStartH, videoStartM] = video.start_time.split(':').map(Number);
      const [videoEndH, videoEndM] = video.end_time.split(':').map(Number);
      const videoStartMinutes = videoStartH * 60 + videoStartM;
      const videoEndMinutes = videoEndH * 60 + videoEndM;
      const rangeStartMinutes = rangeStartHour * 60;
      const rangeEndMinutes = rangeEndHour * 60;
      
      // Check if video overlaps with the time range
      return (videoStartMinutes < rangeEndMinutes && videoEndMinutes > rangeStartMinutes);
    });
  };

  const getVideoStyle = (video, cellStartHour, cellEndHour) => {
    const [startH, startM] = video.start_time.split(':').map(Number);
    const [endH, endM] = video.end_time.split(':').map(Number);
    
    const videoStartMinutes = startH * 60 + startM;
    const videoEndMinutes = endH * 60 + endM;
    const cellStartMinutes = cellStartHour * 60;
    const cellEndMinutes = cellEndHour * 60;
    const cellDurationMinutes = cellEndMinutes - cellStartMinutes;
    
    // Calculate where video starts within this cell
    const startInCell = Math.max(0, videoStartMinutes - cellStartMinutes);
    const endInCell = Math.min(cellDurationMinutes, videoEndMinutes - cellStartMinutes);
    
    const leftPercent = (startInCell / cellDurationMinutes) * 100;
    const widthPercent = ((endInCell - startInCell) / cellDurationMinutes) * 100;
    
    return { 
      left: `${leftPercent}%`, 
      width: `${Math.max(widthPercent, 2)}%`,
    };
  };

  const getCurrentTimePosition = () => {
    const now = getEasternTime();
    const hours = now.getHours();
    const mins = now.getMinutes();
    const currentMinutes = hours * 60 + mins;
    
    const startMinutes = startHour * 60;
    const endMinutes = startMinutes + hoursToShow * 60;
    
    if (currentMinutes < startMinutes || currentMinutes >= endMinutes) return null;
    
    const positionPercent = ((currentMinutes - startMinutes) / (hoursToShow * 60)) * 100;
    return positionPercent;
  };

  const scrollHours = (direction) => {
    const scrollAmount = Math.max(1, Math.floor(hoursToShow / 2));
    if (direction === 'left') {
      setStartHour(prev => (prev - scrollAmount + 24) % 24);
    } else {
      setStartHour(prev => (prev + scrollAmount) % 24);
    }
  };

  const goToNow = () => {
    setStartHour(getEasternTime().getHours());
  };

  const zoomIn = () => {
    if (zoomLevel > 0) {
      setZoomLevel(prev => prev - 1);
    }
  };

  const zoomOut = () => {
    if (zoomLevel < ZOOM_LEVELS.length - 1) {
      setZoomLevel(prev => prev + 1);
    }
  };

  const closePlayer = () => {
    setSelectedVideo(null);
    setSelectedChannel(null);
  };

  const onPlayerReady = (event) => {
    playerRef.current = event.target;
    if (selectedVideo?.startAt) {
      event.target.seekTo(selectedVideo.startAt, true);
    }
    if (isMuted) {
      event.target.mute();
    }
  };

  const toggleMute = () => {
    if (playerRef.current) {
      if (isMuted) {
        playerRef.current.unMute();
      } else {
        playerRef.current.mute();
      }
      setIsMuted(!isMuted);
    }
  };

  // Generate time markers for the header
  const getTimeMarkers = () => {
    const markers = [];
    const interval = hoursToShow <= 6 ? 1 : hoursToShow <= 12 ? 2 : 3;
    
    for (let i = 0; i < hoursToShow; i += interval) {
      const hour = (startHour + i) % 24;
      markers.push({ hour, position: (i / hoursToShow) * 100 });
    }
    return markers;
  };

  if (authLoading || loading) {
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
  const timeMarkers = getTimeMarkers();

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white" data-testid="schedule-page">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0f]/95 backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate(isAuthenticated && user?.is_admin ? '/dashboard' : '/')}
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
          
          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1 mr-2">
              <Button 
                variant="ghost"
                size="icon"
                onClick={zoomIn}
                disabled={zoomLevel === 0}
                className="h-8 w-8 hover:bg-white/10"
                title="Zoom in (show less time)"
                data-testid="zoom-in-btn"
              >
                <ZoomIn size={16} />
              </Button>
              <span className="px-2 text-sm font-medium text-gray-300 min-w-[40px] text-center">
                {ZOOM_LEVELS[zoomLevel].label}
              </span>
              <Button 
                variant="ghost"
                size="icon"
                onClick={zoomOut}
                disabled={zoomLevel === ZOOM_LEVELS.length - 1}
                className="h-8 w-8 hover:bg-white/10"
                title="Zoom out (show more time)"
                data-testid="zoom-out-btn"
              >
                <ZoomOut size={16} />
              </Button>
            </div>

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
        <div className="flex items-center px-6 pb-3">
          <div className="w-52 flex-shrink-0" />
          
          <div className="flex items-center flex-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => scrollHours('left')}
              className="hover:bg-white/10 mr-2 h-8 w-8"
              data-testid="scroll-left"
            >
              <ChevronLeft size={18} />
            </Button>
            
            <div className="flex-1 relative h-8">
              {/* Time markers */}
              {timeMarkers.map((marker, idx) => (
                <div 
                  key={idx}
                  className="absolute top-0 bottom-0 flex items-center"
                  style={{ left: `${marker.position}%` }}
                >
                  <div className={`text-xs font-medium whitespace-nowrap ${
                    marker.hour === getEasternTime().getHours() 
                      ? 'text-red-400' 
                      : 'text-gray-400'
                  }`}>
                    {formatTime(marker.hour)} ET
                  </div>
                </div>
              ))}
              
              {/* Current time indicator in header */}
              {currentTimePos !== null && (
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500"
                  style={{ left: `${currentTimePos}%` }}
                />
              )}
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={() => scrollHours('right')}
              className="hover:bg-white/10 ml-2 h-8 w-8"
              data-testid="scroll-right"
            >
              <ChevronRight size={18} />
            </Button>
          </div>
          
          <div className="w-10 flex-shrink-0" />
        </div>
      </div>

      {/* TV Guide Grid */}
      <div className="relative" ref={timelineRef}>
        {/* Current Time Indicator Line */}
        {currentTimePos !== null && (
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"
            style={{ left: `calc(208px + (100% - 208px - 40px) * ${currentTimePos / 100})` }}
          >
            <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-500 rounded-full" />
          </div>
        )}

        {/* Channel Rows — virtualized against the window scroll so only
            the rows currently in view are mounted. Keeps DOM node count flat
            for Fire TV Stick / Silk regardless of channel count. */}
        <div
          ref={rowsContainerRef}
          className="relative"
          style={{ height: schedules.length * ROW_HEIGHT }}
          data-testid="schedule-rows-container"
        >
          <div style={{ transform: `translateY(${scheduleRowsOffset}px)` }} className="divide-y divide-white/5">
            {schedules.slice(scheduleRowsStart, scheduleRowsEnd + 1).map((schedule) => {
            const currentVideo = getCurrentVideo(schedule);
            const isLive = currentVideo !== null;
            
            return (
              <div 
                key={schedule.channel_id} 
                style={{ height: ROW_HEIGHT }}
                className="flex hover:bg-white/[0.02] transition-colors"
                data-testid={`schedule-channel-${schedule.channel_id}`}
              >
                {/* Channel Info */}
                <div 
                  className="w-52 flex-shrink-0 p-3 flex items-center gap-3 bg-[#12121a] border-r border-white/10 cursor-pointer hover:bg-[#1a1a24] transition-colors"
                  onClick={() => handleChannelClick(schedule)}
                  title="Click to watch live"
                >
                  <div className="relative">
                    {schedule.channel_thumbnail ? (
                      <img 
                        src={schedule.channel_thumbnail} 
                        alt={schedule.channel_name}
                        loading="lazy"
                        decoding="async"
                        className="w-12 h-12 rounded object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-primary/20 flex items-center justify-center">
                        <Tv size={20} className="text-primary" />
                      </div>
                    )}
                    {isLive && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">{schedule.channel_name}</h3>
                    <p className="text-xs text-gray-500 truncate">
                      {isLive ? (
                        <span className="text-red-400">Now: {currentVideo.title}</span>
                      ) : (
                        `${schedule.videos?.length || 0} videos`
                      )}
                    </p>
                  </div>
                  {user?.is_admin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        regenerateSchedule(schedule.channel_id);
                      }}
                      disabled={refreshing}
                      className="h-7 w-7 hover:bg-white/10"
                      title="Shuffle schedule"
                      data-testid={`regenerate-${schedule.channel_id}`}
                    >
                      <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                    </Button>
                  )}
                </div>

                {/* Timeline - Single continuous row */}
                <div className="flex-1 relative h-16 bg-[#0d0d12]">
                  {/* Get all videos in the visible time range */}
                  {getVideosInTimeRange(schedule, startHour, startHour + hoursToShow).map((video, vidIdx) => {
                    const style = getVideoStyle(video, startHour, startHour + hoursToShow);
                    const isCurrentlyPlaying = currentVideo?.video_id === video.video_id;
                    const colors = [
                      'from-primary/90 to-primary/70',
                      'from-purple-600/90 to-purple-600/70',
                      'from-cyan-600/90 to-cyan-600/70',
                      'from-amber-600/90 to-amber-600/70',
                      'from-rose-600/90 to-rose-600/70',
                      'from-emerald-600/90 to-emerald-600/70',
                    ];
                    
                    return (
                      <div
                        key={`${video.video_id}-${vidIdx}`}
                        className={`absolute top-1 bottom-1 rounded cursor-pointer transition-all hover:brightness-110 hover:scale-[1.02]
                          bg-gradient-to-r ${colors[vidIdx % colors.length]}
                          ${isCurrentlyPlaying ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-[#0d0d12]' : ''}
                        `}
                        style={style}
                        onClick={() => handleVideoClick(video, schedule)}
                        title={`${video.title}\n${video.start_time} - ${video.end_time}\nClick to watch`}
                        data-testid={`video-block-${video.video_id}`}
                      >
                        <div className="absolute inset-0 p-1.5 flex flex-col justify-between overflow-hidden pointer-events-none">
                          <p className="text-[11px] font-medium truncate leading-tight">
                            {video.title}
                          </p>
                          <div className="flex items-center justify-between text-[9px] text-white/80">
                            <span className="flex items-center gap-0.5">
                              <Clock size={8} />
                              {video.start_time.slice(0, 5)} · {Math.floor((video.duration || 300) / 60)}:{((video.duration || 300) % 60).toString().padStart(2, '0')}
                            </span>
                            {isCurrentlyPlaying && (
                              <span className="flex items-center gap-0.5 text-red-300 font-medium">
                                <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                                LIVE
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Spacer for scroll buttons */}
                <div className="w-10 flex-shrink-0" />
              </div>
            );
            })}
          </div>
        </div>

        {/* Empty State */}
        {schedules.length === 0 && !loading && (
          <div className="text-center py-20">
            <Calendar size={64} className="mx-auto mb-4 text-gray-600" />
            <h3 className="text-xl font-semibold mb-2">No Schedules Available</h3>
            <p className="text-gray-500 mb-6">
              {isAuthenticated && user?.is_admin
                ? 'Add videos to your channels to generate schedules.'
                : 'No channels are broadcasting right now. Check back shortly.'}
            </p>
            <Button onClick={() => navigate(isAuthenticated && user?.is_admin ? '/dashboard' : '/live')} className="bg-primary">
              {isAuthenticated && user?.is_admin ? 'Go to Dashboard' : 'Go to Live TV'}
            </Button>
          </div>
        )}
      </div>

      {/* Video Player Modal */}
      {selectedVideo && selectedChannel && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <div className="relative w-full max-w-5xl">
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={closePlayer}
              className="absolute -top-12 right-0 hover:bg-white/10 text-white"
              data-testid="close-player"
            >
              <X size={24} />
            </Button>
            
            {/* Channel info */}
            <div className="absolute -top-12 left-0 flex items-center gap-3">
              <div className="flex items-center gap-2">
                {selectedChannel.channel_thumbnail ? (
                  <img 
                    src={selectedChannel.channel_thumbnail} 
                    alt={selectedChannel.channel_name}
                    className="w-8 h-8 rounded"
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
                    <Tv size={16} className="text-primary" />
                  </div>
                )}
                <span className="font-medium">{selectedChannel.channel_name}</span>
              </div>
              <span className="text-gray-400">•</span>
              <span className="text-gray-400 text-sm">{selectedVideo.title}</span>
              <div className="flex items-center gap-1 text-red-400 text-sm">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                LIVE
              </div>
            </div>
            
            {/* YouTube Player */}
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              {selectedVideo.youtube_id ? (
                <YouTube
                  videoId={selectedVideo.youtube_id}
                  opts={{
                    width: '100%',
                    height: '100%',
                    playerVars: {
                      autoplay: 1,
                      start: Math.floor(selectedVideo.startAt || 0),
                      controls: 1,
                      modestbranding: 1,
                      rel: 0,
                    },
                  }}
                  onReady={onPlayerReady}
                  className="w-full h-full"
                  iframeClassName="w-full h-full"
                />
              ) : (
                <video
                  src={`${process.env.REACT_APP_BACKEND_URL}${selectedVideo.video_url}`}
                  autoPlay
                  controls
                  className="w-full h-full"
                  ref={(el) => {
                    if (el && selectedVideo.startAt) {
                      el.currentTime = selectedVideo.startAt;
                    }
                  }}
                />
              )}
            </div>
            
            {/* Player controls */}
            <div className="absolute -bottom-12 left-0 right-0 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  className="hover:bg-white/10 text-white"
                >
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </Button>
                <span className="text-sm text-gray-400">
                  {selectedVideo.start_time.slice(0, 5)} - {selectedVideo.end_time.slice(0, 5)}
                </span>
              </div>
              <div className="text-sm text-gray-400">
                Click anywhere outside or press X to close
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#12121a] border border-white/10 rounded-full px-4 py-2 flex items-center gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          <span>Live Now</span>
        </div>
        <div className="w-px h-4 bg-white/20" />
        <div className="flex items-center gap-1.5">
          <Play size={12} className="text-primary" />
          <span>Click video to watch</span>
        </div>
        <div className="w-px h-4 bg-white/20" />
        <div className="flex items-center gap-1.5">
          <ZoomIn size={12} />
          <ZoomOut size={12} />
          <span>Zoom: {ZOOM_LEVELS[zoomLevel].label}</span>
        </div>
      </div>
    </div>
  );
};

export default Schedule;
