import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { channelsAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  ChevronUp, 
  ChevronDown, 
  Radio, 
  Clock, 
  Tv,
  Volume2,
  VolumeX,
  Maximize,
  List,
  Settings,
  Edit,
  Plus,
  Trash2,
  X,
  Save,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Calculate the current position in a channel's playlist based on real time
// This ensures all viewers see the same video at the same time
const calculateLivePosition = (videos, baseTime = null) => {
  if (!videos || videos.length === 0) return { videoIndex: 0, seekTime: 0 };
  
  const now = baseTime || new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  
  // Seconds since midnight - this is the "global clock" all viewers share
  const secondsSinceMidnight = Math.floor((now - startOfDay) / 1000);
  
  // Calculate total playlist duration
  let totalDuration = 0;
  videos.forEach(v => {
    totalDuration += v.duration || 300; // Default 5 min if no duration
  });
  
  if (totalDuration === 0) return { videoIndex: 0, seekTime: 0 };
  
  // Find position in the looped playlist
  const positionInPlaylist = secondsSinceMidnight % totalDuration;
  
  // Find which video and at what time
  let accumulated = 0;
  for (let i = 0; i < videos.length; i++) {
    const videoDuration = videos[i].duration || 300;
    if (accumulated + videoDuration > positionInPlaylist) {
      return {
        videoIndex: i,
        seekTime: positionInPlaylist - accumulated
      };
    }
    accumulated += videoDuration;
  }
  
  return { videoIndex: 0, seekTime: 0 };
};

// Generate schedule for a channel
const generateSchedule = (videos, hoursAhead = 4) => {
  if (!videos || videos.length === 0) return [];
  
  const schedule = [];
  const now = new Date();
  const { videoIndex, seekTime } = calculateLivePosition(videos);
  
  let currentTime = new Date(now);
  let currentVideoIndex = videoIndex;
  
  // Subtract the seek time to get the start of current video
  currentTime.setSeconds(currentTime.getSeconds() - seekTime);
  
  const endTime = new Date(now);
  endTime.setHours(endTime.getHours() + hoursAhead);
  
  while (currentTime < endTime && schedule.length < 20) {
    const video = videos[currentVideoIndex % videos.length];
    const duration = video.duration || 300;
    
    const startTime = new Date(currentTime);
    const endTimeSlot = new Date(currentTime);
    endTimeSlot.setSeconds(endTimeSlot.getSeconds() + duration);
    
    schedule.push({
      video,
      startTime,
      endTime: endTimeSlot,
      isNowPlaying: schedule.length === 0
    });
    
    currentTime = endTimeSlot;
    currentVideoIndex++;
  }
  
  return schedule;
};

const formatTime = (date) => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const LiveTV = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const isAdmin = user?.is_admin;
  
  const [channels, setChannels] = useState([]);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [seekTime, setSeekTime] = useState(0);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [showChannelList, setShowChannelList] = useState(true);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const playerRef = useRef(null);
  const videoRef = useRef(null);
  const iframeRef = useRef(null);

  useEffect(() => {
    loadChannels();
    
    // Update time every second for live feel
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(timeInterval);
  }, []);

  // Recalculate position periodically to stay in sync
  useEffect(() => {
    if (!currentChannel?.videos?.length) return;
    
    const syncInterval = setInterval(() => {
      const { videoIndex, seekTime: newSeekTime } = calculateLivePosition(currentChannel.videos);
      
      // Update if video changed OR if we've drifted more than 10 seconds
      if (videoIndex !== currentVideoIndex) {
        setCurrentVideoIndex(videoIndex);
        setSeekTime(newSeekTime);
      } else if (Math.abs(newSeekTime - seekTime) > 10) {
        // Re-sync if drifted too far
        setSeekTime(newSeekTime);
      }
    }, 3000); // Check every 3 seconds for better sync
    
    return () => clearInterval(syncInterval);
  }, [currentChannel, currentVideoIndex, seekTime]);

  // Update schedule when channel changes or time updates
  useEffect(() => {
    if (currentChannel?.videos) {
      setSchedule(generateSchedule(currentChannel.videos));
    }
  }, [currentChannel, currentTime]);

  // Determine if current video is uploaded
  const currentVideo = currentChannel?.videos?.[currentVideoIndex];
  const isUploadedVideo = currentVideo && (currentVideo.video_url || !currentVideo.youtube_id);
  
  // Handle uploaded video playback and sync
  useEffect(() => {
    if (isUploadedVideo && videoRef.current) {
      const video = videoRef.current;
      
      // Sync video to calculated position
      if (Math.abs(video.currentTime - seekTime) > 2) {
        video.currentTime = seekTime;
      }
      
      video.muted = isMuted;
      video.play().catch(() => {});
    }
  }, [currentVideoIndex, seekTime, isUploadedVideo, isMuted]);

  // Handle uploaded video time updates for better sync
  const handleTimeUpdate = () => {
    if (!isUploadedVideo || !videoRef.current || !currentChannel?.videos) return;
    
    const video = videoRef.current;
    const { seekTime: expectedTime } = calculateLivePosition(currentChannel.videos);
    
    // If we're more than 5 seconds off, re-sync
    if (Math.abs(video.currentTime - expectedTime) > 5) {
      video.currentTime = expectedTime;
    }
  };

  const handleUploadedVideoEnd = () => {
    // Recalculate live position when video ends
    if (currentChannel?.videos?.length) {
      const { videoIndex, seekTime: newSeekTime } = calculateLivePosition(currentChannel.videos);
      setCurrentVideoIndex(videoIndex);
      setSeekTime(newSeekTime);
    }
  };

  const loadChannels = async () => {
    try {
      const response = await channelsAPI.getAll({});
      const activeChannels = response.data.filter(c => c.videos?.length > 0);
      setChannels(activeChannels);
      
      if (activeChannels.length > 0) {
        selectChannel(activeChannels[0]);
      }
    } catch (error) {
      console.error('Failed to load channels:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectChannel = useCallback((channel) => {
    const { videoIndex, seekTime: newSeekTime } = calculateLivePosition(channel.videos);
    setCurrentChannel(channel);
    setCurrentVideoIndex(videoIndex);
    setSeekTime(newSeekTime);
    setSchedule(generateSchedule(channel.videos));
  }, []);

  const changeChannel = (direction) => {
    if (channels.length === 0) return;
    
    const currentIndex = channels.findIndex(c => c.id === currentChannel?.id);
    let newIndex;
    
    if (direction === 'up') {
      newIndex = currentIndex <= 0 ? channels.length - 1 : currentIndex - 1;
    } else {
      newIndex = currentIndex >= channels.length - 1 ? 0 : currentIndex + 1;
    }
    
    selectChannel(channels[newIndex]);
  };

  const toggleFullscreen = () => {
    if (playerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        playerRef.current.requestFullscreen();
      }
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        changeChannel('up');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        changeChannel('down');
      } else if (e.key === 'm') {
        setIsMuted(prev => !prev);
      } else if (e.key === 'g') {
        setShowChannelList(prev => !prev);
      } else if (e.key === 'a' && isAdmin) {
        setShowAdminPanel(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [channels, currentChannel, isAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 100px)' }}>
        <div className="text-center">
          <Tv size={48} className="mx-auto mb-4 text-primary animate-pulse" />
          <p className="text-gray-400">Loading Live TV...</p>
        </div>
      </div>
    );
  }

  // Build YouTube URL with start time for live sync
  const embedUrl = currentVideo?.youtube_id 
    ? `https://www.youtube.com/embed/${currentVideo.youtube_id}?autoplay=1&mute=${isMuted ? 1 : 0}&start=${Math.floor(seekTime)}&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`
    : '';
  
  // Build uploaded video URL
  const uploadedVideoUrl = currentVideo?.video_url 
    ? `${BACKEND_URL}${currentVideo.video_url}`
    : null;

  return (
    <div className="px-4 md:px-8 py-4" data-testid="live-tv-page">
      <div className="flex gap-4" style={{ height: 'calc(100vh - 140px)' }}>
        {/* Channel List Sidebar */}
        {showChannelList && (
          <div className="w-64 bg-surface rounded-lg border border-white/10 flex flex-col overflow-hidden flex-shrink-0">
            <div className="p-4 border-b border-white/10">
              <h2 className="font-heading text-lg tracking-wide flex items-center gap-2">
                <Radio size={18} className="text-primary" />
                CHANNELS
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                {channels.length} channels • ↑↓ to switch
              </p>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {channels.map((channel, index) => (
                <button
                  key={channel.id}
                  onClick={() => selectChannel(channel)}
                  className={`w-full p-3 flex items-center gap-3 text-left transition-all border-l-2 ${
                    currentChannel?.id === channel.id
                      ? 'bg-primary/20 border-l-primary'
                      : 'hover:bg-white/5 border-l-transparent'
                  }`}
                  data-testid={`channel-btn-${channel.id}`}
                >
                  <div className="w-8 h-8 rounded bg-black/50 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">{channel.name}</h4>
                    <p className="text-xs text-gray-500 truncate">{channel.category}</p>
                  </div>
                  {currentChannel?.id === channel.id && (
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
            
            {/* Admin Controls at bottom */}
            {isAdmin && (
              <div className="p-3 border-t border-white/10">
                <Button
                  size="sm"
                  onClick={() => setShowAdminPanel(!showAdminPanel)}
                  className={`w-full ${showAdminPanel ? 'bg-primary' : 'bg-white/10'}`}
                >
                  <Settings size={14} className="mr-2" />
                  Admin Panel
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Video Player */}
          <div 
            ref={playerRef}
            className="relative bg-black rounded-lg overflow-hidden group"
            style={{ aspectRatio: '16/9', maxHeight: 'calc(100vh - 300px)' }}
          >
            {currentVideo ? (
              <>
                {/* Uploaded Video Player */}
                {isUploadedVideo && uploadedVideoUrl ? (
                  <video
                    ref={videoRef}
                    src={uploadedVideoUrl}
                    className="absolute inset-0 w-full h-full object-contain"
                    autoPlay
                    muted={isMuted}
                    onEnded={handleUploadedVideoEnd}
                    onTimeUpdate={handleTimeUpdate}
                    playsInline
                    data-testid="live-uploaded-video"
                  />
                ) : currentVideo.youtube_id ? (
                  /* YouTube Embed with live sync */
                  <iframe
                    ref={iframeRef}
                    key={`${currentVideo.youtube_id}-${currentVideoIndex}-${Math.floor(seekTime / 10) * 10}`}
                    src={embedUrl}
                    title={currentVideo.title}
                    className="absolute inset-0 w-full h-full"
                    style={{ border: 'none' }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-gray-400">Video not available</p>
                  </div>
                )}

                {/* LIVE Badge */}
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 px-3 py-1 rounded z-10">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  <span className="text-xs font-bold tracking-wider">LIVE</span>
                </div>

                {/* Current Time */}
                <div className="absolute top-4 right-4 bg-black/70 px-3 py-1 rounded text-sm z-10">
                  <Clock size={14} className="inline mr-1" />
                  {currentTime.toLocaleTimeString()}
                </div>

                {/* Video Info Overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4">
                  <h3 className="font-heading text-xl md:text-2xl">{currentChannel?.name}</h3>
                  <p className="text-sm text-gray-300">{currentVideo?.title}</p>
                </div>

                {/* Controls */}
                <div className="absolute bottom-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsMuted(!isMuted)}
                    className="bg-black/50 hover:bg-black/70"
                  >
                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={toggleFullscreen}
                    className="bg-black/50 hover:bg-black/70"
                  >
                    <Maximize size={18} />
                  </Button>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(`/edit/${currentChannel?.id}`)}
                      className="bg-black/50 hover:bg-primary/70"
                    >
                      <Edit size={18} />
                    </Button>
                  )}
                </div>

                {/* Channel Navigation */}
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => changeChannel('up')}
                    className="bg-black/50 hover:bg-black/70"
                  >
                    <ChevronUp size={18} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => changeChannel('down')}
                    className="bg-black/50 hover:bg-black/70"
                  >
                    <ChevronDown size={18} />
                  </Button>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Radio size={48} className="mx-auto mb-4 text-gray-600" />
                  <p className="text-gray-400">No channel selected</p>
                </div>
              </div>
            )}
          </div>

          {/* Schedule Bar */}
          <div className="bg-surface rounded-lg border border-white/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-primary" />
              <h3 className="font-heading text-sm tracking-wide">SCHEDULE</h3>
              <span className="text-xs text-gray-500 ml-auto">{currentChannel?.name}</span>
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
              {schedule.map((item, index) => (
                <div
                  key={index}
                  className={`flex-shrink-0 p-3 rounded-lg min-w-[150px] transition-all ${
                    item.isNowPlaying
                      ? 'bg-primary/20 border border-primary/50'
                      : 'bg-black/30 border border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium">{formatTime(item.startTime)}</span>
                    {item.isNowPlaying && (
                      <span className="text-[10px] bg-red-600 px-1.5 py-0.5 rounded font-bold">NOW</span>
                    )}
                  </div>
                  <p className="text-sm truncate">{item.video.title}</p>
                  <p className="text-xs text-gray-500">{Math.floor((item.video.duration || 300) / 60)} min</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Admin Panel Sidebar */}
        {isAdmin && showAdminPanel && (
          <div className="w-80 bg-surface rounded-lg border border-white/10 flex flex-col overflow-hidden flex-shrink-0">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-heading text-lg tracking-wide flex items-center gap-2">
                <Settings size={18} className="text-primary" />
                ADMIN PANEL
              </h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAdminPanel(false)}
              >
                <X size={16} />
              </Button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Current Channel Info */}
              {currentChannel && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-400">Current Channel</h3>
                  <div className="bg-black/30 rounded-lg p-3">
                    <p className="font-semibold">{currentChannel.name}</p>
                    <p className="text-xs text-gray-500">{currentChannel.category}</p>
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/edit/${currentChannel.id}`)}
                        className="flex-1 border-white/20 text-xs"
                      >
                        <Edit size={12} className="mr-1" />
                        Edit Channel
                      </Button>
                    </div>
                  </div>
                  
                  {/* Videos in Channel */}
                  <h3 className="text-sm font-medium text-gray-400 mt-4">
                    Videos ({currentChannel.videos?.length || 0})
                  </h3>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {currentChannel.videos?.map((video, index) => (
                      <div
                        key={video.id}
                        className={`bg-black/30 rounded-lg p-2 flex items-center gap-2 ${
                          index === currentVideoIndex ? 'ring-1 ring-primary' : ''
                        }`}
                      >
                        <span className="w-5 text-center text-xs text-gray-500">{index + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{video.title}</p>
                          <p className="text-[10px] text-gray-500">
                            {Math.floor((video.duration || 300) / 60)}min
                            {index === currentVideoIndex && (
                              <span className="text-red-400 ml-2">• Playing</span>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Quick Actions */}
              <div className="pt-4 border-t border-white/10 space-y-2">
                <h3 className="text-sm font-medium text-gray-400">Quick Actions</h3>
                <Button
                  size="sm"
                  onClick={() => navigate('/create')}
                  className="w-full bg-primary hover:bg-primary-hover text-xs"
                >
                  <Plus size={14} className="mr-1" />
                  Create New Channel
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate('/dashboard')}
                  className="w-full border-white/20 text-xs"
                >
                  <Settings size={14} className="mr-1" />
                  Go to Dashboard
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <span>Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">↑↓</kbd> to switch channels</span>
          <span>Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">M</kbd> to mute</span>
          <span>Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">G</kbd> to toggle guide</span>
          {isAdmin && (
            <span>Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">A</kbd> for admin panel</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowChannelList(!showChannelList)}
            className="text-xs"
          >
            <List size={14} className="mr-1" />
            {showChannelList ? 'Hide' : 'Show'} Channels
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LiveTV;
