import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { channelsAPI, analyticsAPI } from '../lib/api';
import { Button } from '../components/ui/button';
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
  X,
  Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Get or create anonymous viewer ID
const getViewerId = () => {
  let viewerId = localStorage.getItem('viewer_id');
  if (!viewerId) {
    viewerId = 'v_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('viewer_id', viewerId);
  }
  return viewerId;
};

// Get current time in Eastern timezone
const getEasternTime = () => {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
};

// Calculate current video from schedule based on Eastern time
const getCurrentVideoFromSchedule = (schedule) => {
  if (!schedule?.videos || schedule.videos.length === 0) {
    return { video: null, seekTime: 0, videoIndex: -1 };
  }
  
  const now = getEasternTime();
  const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  
  for (let i = 0; i < schedule.videos.length; i++) {
    const video = schedule.videos[i];
    const [startH, startM, startS] = video.start_time.split(':').map(Number);
    const [endH, endM, endS] = video.end_time.split(':').map(Number);
    const videoStart = startH * 3600 + startM * 60 + (startS || 0);
    const videoEnd = endH * 3600 + endM * 60 + (endS || 0);
    
    if (currentSeconds >= videoStart && currentSeconds < videoEnd) {
      const seekTime = currentSeconds - videoStart;
      return { video, seekTime, videoIndex: i };
    }
  }
  
  // If no video found (shouldn't happen with 24h schedule), return first
  return { video: schedule.videos[0], seekTime: 0, videoIndex: 0 };
};

const LiveTV = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const isAdmin = user?.is_admin;
  
  const [channels, setChannels] = useState([]);
  const [schedules, setSchedules] = useState({}); // channel_id -> schedule
  const [currentChannel, setCurrentChannel] = useState(null);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [seekTime, setSeekTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [showChannelList, setShowChannelList] = useState(true);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [scheduleDate, setScheduleDate] = useState('');
  const [showChannelChanger, setShowChannelChanger] = useState(true);
  const [channelInput, setChannelInput] = useState('');
  const [showChannelOSD, setShowChannelOSD] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerRef = useRef(null);
  const videoRef = useRef(null);
  const youtubePlayerRef = useRef(null);
  const scheduleCheckRef = useRef(null);
  const channelInputTimeoutRef = useRef(null);
  const osdTimeoutRef = useRef(null);

  // Track fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Load YouTube IFrame API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // Load channels and schedules
  useEffect(() => {
    loadChannelsAndSchedules();
    
    // Update time every second for live feel
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(timeInterval);
  }, []);

  // Periodic view tracking
  useEffect(() => {
    if (!currentChannel) return;
    
    const trackInterval = setInterval(() => {
      try {
        analyticsAPI.recordView(currentChannel.id, getViewerId());
      } catch (e) {}
    }, 120000);
    
    return () => clearInterval(trackInterval);
  }, [currentChannel]);

  // Check for video changes based on schedule (every second)
  useEffect(() => {
    if (!currentChannel || !schedules[currentChannel.id]) return;
    
    const checkSchedule = () => {
      const schedule = schedules[currentChannel.id];
      const { video, seekTime: newSeekTime, videoIndex } = getCurrentVideoFromSchedule(schedule);
      
      if (video && (!currentVideo || video.video_id !== currentVideo.video_id)) {
        console.log('Schedule video change:', video.title);
        setCurrentVideo(video);
        setSeekTime(newSeekTime);
      }
    };
    
    // Check immediately and then every second
    checkSchedule();
    scheduleCheckRef.current = setInterval(checkSchedule, 1000);
    
    return () => {
      if (scheduleCheckRef.current) {
        clearInterval(scheduleCheckRef.current);
      }
    };
  }, [currentChannel, schedules, currentVideo]);

  const loadChannelsAndSchedules = async () => {
    try {
      setLoading(true);
      
      // Load schedules from the public endpoint
      const scheduleResponse = await axios.get(`${BACKEND_URL}/api/schedule/live`);
      const { schedules: scheduleList, date } = scheduleResponse.data;
      
      setScheduleDate(date);
      
      // Convert to map
      const scheduleMap = {};
      const channelList = [];
      
      for (const schedule of scheduleList) {
        scheduleMap[schedule.channel_id] = schedule;
        channelList.push({
          id: schedule.channel_id,
          name: schedule.channel_name,
          thumbnail: schedule.channel_thumbnail,
          videos: schedule.videos,
          schedule: schedule
        });
      }
      
      setSchedules(scheduleMap);
      setChannels(channelList);
      
      // Select first channel
      if (channelList.length > 0 && !currentChannel) {
        selectChannel(channelList[0], scheduleMap);
      }
    } catch (error) {
      console.error('Failed to load schedules:', error);
      toast.error('Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  const selectChannel = (channel, scheduleMap = schedules) => {
    setCurrentChannel(channel);
    
    const schedule = scheduleMap[channel.id];
    if (schedule) {
      const { video, seekTime: newSeekTime } = getCurrentVideoFromSchedule(schedule);
      setCurrentVideo(video);
      setSeekTime(newSeekTime);
    }
    
    // Track view
    try {
      analyticsAPI.recordView(channel.id, getViewerId());
    } catch (e) {}
    
    // Show OSD
    showOSD();
  };

  // Show channel OSD temporarily
  const showOSD = () => {
    setShowChannelOSD(true);
    if (osdTimeoutRef.current) {
      clearTimeout(osdTimeoutRef.current);
    }
    osdTimeoutRef.current = setTimeout(() => {
      setShowChannelOSD(false);
    }, 3000);
  };

  // Get current channel index
  const getCurrentChannelIndex = () => {
    if (!currentChannel) return -1;
    return channels.findIndex(c => c.id === currentChannel.id);
  };

  // Channel up
  const channelUp = () => {
    const currentIndex = getCurrentChannelIndex();
    if (currentIndex > 0) {
      selectChannel(channels[currentIndex - 1]);
    } else if (channels.length > 0) {
      // Wrap to last channel
      selectChannel(channels[channels.length - 1]);
    }
  };

  // Channel down
  const channelDown = () => {
    const currentIndex = getCurrentChannelIndex();
    if (currentIndex < channels.length - 1) {
      selectChannel(channels[currentIndex + 1]);
    } else if (channels.length > 0) {
      // Wrap to first channel
      selectChannel(channels[0]);
    }
  };

  // Go to channel by number
  const goToChannel = (num) => {
    const index = num - 1; // Convert to 0-based index
    if (index >= 0 && index < channels.length) {
      selectChannel(channels[index]);
    }
  };

  // Handle number key input for channel selection
  const handleChannelNumberInput = (digit) => {
    // Clear previous timeout
    if (channelInputTimeoutRef.current) {
      clearTimeout(channelInputTimeoutRef.current);
    }
    
    // Append digit to input
    const newInput = channelInput + digit;
    setChannelInput(newInput);
    setShowChannelOSD(true);
    
    // Set timeout to process the input
    channelInputTimeoutRef.current = setTimeout(() => {
      const channelNum = parseInt(newInput, 10);
      if (channelNum > 0 && channelNum <= channels.length) {
        goToChannel(channelNum);
      }
      setChannelInput('');
    }, 1500); // Wait 1.5 seconds after last digit
  };

  const isUploadedVideo = currentVideo && (currentVideo.video_url || !currentVideo.youtube_id);

  // Initialize YouTube player when video changes
  useEffect(() => {
    if (!currentVideo?.youtube_id || isUploadedVideo) return;
    
    // Clean up previous player
    if (youtubePlayerRef.current) {
      try {
        youtubePlayerRef.current.destroy();
      } catch (e) {}
      youtubePlayerRef.current = null;
    }

    let errorTimeout = null;

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(initPlayer, 100);
        return;
      }

      const container = document.getElementById('youtube-player');
      if (!container) return;
      
      container.innerHTML = '';
      
      const playerDiv = document.createElement('div');
      playerDiv.id = 'yt-player-instance';
      container.appendChild(playerDiv);

      youtubePlayerRef.current = new window.YT.Player('yt-player-instance', {
        videoId: currentVideo.youtube_id,
        playerVars: {
          autoplay: 1,
          controls: 1,
          start: Math.floor(seekTime),
          modestbranding: 1,
          rel: 0,
          fs: 1,
          playsinline: 1,
        },
        events: {
          onReady: (event) => {
            if (isMuted) {
              event.target.mute();
            }
            // Seek to live position
            event.target.seekTo(seekTime, true);
            event.target.playVideo();
            
            // Clear error timeout
            if (errorTimeout) {
              clearTimeout(errorTimeout);
            }
          },
          onStateChange: (event) => {
            // Video ended
            if (event.data === window.YT.PlayerState.ENDED) {
              // Schedule will handle next video automatically
            }
          },
          onError: (event) => {
            console.error('YouTube error:', event.data);
            // Schedule will handle next video
          }
        }
      });

      // Timeout for unavailable videos
      errorTimeout = setTimeout(() => {
        console.log('Video timeout - may be unavailable');
      }, 10000);
    };

    initPlayer();

    return () => {
      if (errorTimeout) clearTimeout(errorTimeout);
    };
  }, [currentVideo, seekTime, isMuted, isUploadedVideo]);

  // Handle uploaded video
  useEffect(() => {
    if (!isUploadedVideo || !currentVideo || !videoRef.current) return;
    
    const video = videoRef.current;
    video.currentTime = seekTime;
    video.play().catch(e => console.log('Autoplay blocked:', e));
  }, [currentVideo, seekTime, isUploadedVideo]);

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (youtubePlayerRef.current) {
      if (isMuted) {
        youtubePlayerRef.current.unMute();
      } else {
        youtubePlayerRef.current.mute();
      }
    }
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
  };

  const toggleFullscreen = () => {
    const player = playerRef.current;
    if (!player) return;
    
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      player.requestFullscreen();
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      
      // Handle number keys for channel selection
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleChannelNumberInput(e.key);
        return;
      }
      
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          channelUp();
          break;
        case 'ArrowDown':
          e.preventDefault();
          channelDown();
          break;
        case 'm':
        case 'M':
          toggleMute();
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'l':
        case 'L':
          setShowChannelList(prev => !prev);
          break;
        case 'c':
        case 'C':
          setShowChannelChanger(prev => !prev);
          break;
        case 'a':
        case 'A':
          if (isAdmin) setShowAdminPanel(prev => !prev);
          break;
        case 'Escape':
          setChannelInput('');
          setShowChannelOSD(false);
          break;
        default:
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [channels, currentChannel, isAdmin, isMuted, channelInput]);

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York'
    });
  };

  const formatScheduleTime = (timeStr) => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const hour = h % 12 || 12;
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  // Get upcoming videos from schedule
  const getUpcomingVideos = () => {
    if (!currentChannel || !schedules[currentChannel.id]) return [];
    
    const schedule = schedules[currentChannel.id];
    const { videoIndex } = getCurrentVideoFromSchedule(schedule);
    
    // Return next 3 videos
    const upcoming = [];
    for (let i = 1; i <= 3; i++) {
      const idx = (videoIndex + i) % schedule.videos.length;
      upcoming.push(schedule.videos[idx]);
    }
    return upcoming;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Radio size={48} className="mx-auto mb-4 text-primary animate-pulse" />
          <p className="text-gray-400">Loading Live TV...</p>
        </div>
      </div>
    );
  }

  const upcomingVideos = getUpcomingVideos();

  return (
    <div className="min-h-screen bg-black text-white flex" data-testid="live-tv-page">
      {/* Channel Sidebar */}
      {showChannelList && (
        <div className="w-72 bg-[#0a0a0f] border-r border-white/10 flex flex-col h-screen overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Tv size={20} className="text-primary" />
                Channels
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowChannelList(false)}
                className="h-8 w-8"
              >
                <X size={16} />
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
              <Calendar size={12} />
              <span>Schedule: {scheduleDate} (ET)</span>
            </div>
          </div>
          
          {/* Channel List */}
          <div className="flex-1 overflow-y-auto">
            {channels.map((channel, index) => {
              const isActive = currentChannel?.id === channel.id;
              const schedule = schedules[channel.id];
              const { video: nowPlaying } = schedule ? getCurrentVideoFromSchedule(schedule) : {};
              
              return (
                <button
                  key={channel.id}
                  onClick={() => selectChannel(channel)}
                  className={`w-full p-3 flex items-center gap-3 transition-colors ${
                    isActive 
                      ? 'bg-primary/20 border-l-2 border-primary' 
                      : 'hover:bg-white/5 border-l-2 border-transparent'
                  }`}
                  data-testid={`channel-${channel.id}`}
                >
                  <div className="relative">
                    {channel.thumbnail ? (
                      <img 
                        src={channel.thumbnail} 
                        alt={channel.name}
                        className="w-12 h-12 rounded object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-primary/20 flex items-center justify-center">
                        <Tv size={20} className="text-primary" />
                      </div>
                    )}
                    {isActive && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium text-sm truncate">{channel.name}</p>
                    {nowPlaying && (
                      <p className="text-xs text-gray-500 truncate">
                        {isActive ? (
                          <span className="text-red-400">Now: {nowPlaying.title}</span>
                        ) : (
                          nowPlaying.title
                        )}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-600">{index + 1}</span>
                </button>
              );
            })}
          </div>
          
          {/* Keyboard shortcuts */}
          <div className="p-3 border-t border-white/10 text-xs text-gray-500">
            <p>↑↓ Switch • 0-9 Go to • C Remote</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Video Player */}
        <div className="flex-1 relative bg-black" ref={playerRef}>
          {/* Toggle channel list button */}
          {!showChannelList && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowChannelList(true)}
              className="absolute top-4 left-4 z-20 bg-black/50 hover:bg-black/70"
            >
              <List size={20} />
            </Button>
          )}

          {/* YouTube Player */}
          {currentVideo?.youtube_id && !isUploadedVideo && (
            <div id="youtube-player" className="w-full h-full" />
          )}

          {/* Uploaded Video Player */}
          {isUploadedVideo && currentVideo && (
            <video
              ref={videoRef}
              src={`${BACKEND_URL}${currentVideo.video_url || `/api/videos/${currentVideo.youtube_id}`}`}
              className="w-full h-full object-contain"
              autoPlay
              muted={isMuted}
              playsInline
            />
          )}

          {/* No video state */}
          {!currentVideo && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Tv size={64} className="mx-auto mb-4 text-gray-600" />
                <p className="text-gray-400">Select a channel to start watching</p>
              </div>
            </div>
          )}

          {/* Channel info overlay */}
          {currentChannel && currentVideo && (
            <div className={`${isFullscreen ? 'fixed' : 'absolute'} top-4 right-4 bg-black/70 backdrop-blur-sm rounded-lg p-3 max-w-sm z-40`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs text-red-400 font-medium">LIVE</span>
                <span className="text-xs text-gray-400">
                  {formatTime(getEasternTime())} ET
                </span>
              </div>
              <p className="font-medium text-sm">{currentChannel.name}</p>
              <p className="text-xs text-gray-400 truncate mt-1">{currentVideo.title}</p>
              <p className="text-xs text-gray-500 mt-1">
                {formatScheduleTime(currentVideo.start_time)} - {formatScheduleTime(currentVideo.end_time)}
              </p>
            </div>
          )}

          {/* Channel Changer OSD */}
          {showChannelOSD && currentChannel && (
            <div className={`${isFullscreen ? 'fixed' : 'absolute'} top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none`}>
              <div className="bg-black/90 backdrop-blur-sm rounded-xl p-6 text-center min-w-[200px]">
                <div className="text-6xl font-bold text-primary mb-2">
                  {channelInput || (getCurrentChannelIndex() + 1)}
                </div>
                <p className="text-lg font-medium text-white">
                  {channelInput ? 'Entering...' : currentChannel.name}
                </p>
                {!channelInput && currentVideo && (
                  <p className="text-sm text-gray-400 mt-1 truncate max-w-[250px]">
                    {currentVideo.title}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Channel Changer Remote */}
          {showChannelChanger && (
            <div 
              className={`${isFullscreen ? 'fixed bottom-24 right-6' : 'absolute bottom-20 right-4'} z-50`} 
              data-testid="channel-changer"
            >
              <div className="bg-[#12121a]/95 backdrop-blur-sm border border-white/10 rounded-xl p-3 flex flex-col items-center gap-2">
                {/* Channel Up */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={channelUp}
                  className="h-10 w-10 rounded-full hover:bg-primary/20 hover:text-primary"
                  data-testid="channel-up"
                >
                  <ChevronUp size={24} />
                </Button>
                
                {/* Channel Number Display */}
                <div 
                  className="w-14 h-14 rounded-lg bg-black flex items-center justify-center cursor-pointer hover:bg-white/5"
                  onClick={showOSD}
                  data-testid="channel-number-display"
                >
                  <span className="text-2xl font-bold text-primary">
                    {channelInput || (getCurrentChannelIndex() + 1)}
                  </span>
                </div>
                
                {/* Channel Down */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={channelDown}
                  className="h-10 w-10 rounded-full hover:bg-primary/20 hover:text-primary"
                  data-testid="channel-down"
                >
                  <ChevronDown size={24} />
                </Button>
                
                {/* Channel count */}
                <span className="text-[10px] text-gray-500">
                  of {channels.length}
                </span>
              </div>
            </div>
          )}

          {/* Player controls */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  className="hover:bg-white/10"
                >
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </Button>
              </div>
              
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAdminPanel(!showAdminPanel)}
                    className="hover:bg-white/10"
                  >
                    <Settings size={16} className="mr-1" />
                    Admin
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleFullscreen}
                  className="hover:bg-white/10"
                >
                  <Maximize size={20} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Schedule Bar */}
        {currentChannel && upcomingVideos.length > 0 && (
          <div className="bg-[#0a0a0f] border-t border-white/10 p-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
                <Clock size={14} />
                <span>Up Next</span>
              </div>
              <div className="flex gap-3 overflow-x-auto">
                {upcomingVideos.map((video, idx) => (
                  <div 
                    key={`${video.video_id}-${idx}`}
                    className="flex items-center gap-2 bg-white/5 rounded px-2 py-1 shrink-0"
                  >
                    <span className="text-xs text-gray-500">
                      {formatScheduleTime(video.start_time)}
                    </span>
                    <span className="text-xs text-gray-300 truncate max-w-[150px]">
                      {video.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Admin Panel */}
      {showAdminPanel && isAdmin && (
        <div className="w-80 bg-[#0a0a0f] border-l border-white/10 p-4 h-screen overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2">
              <Settings size={18} className="text-primary" />
              Admin Panel
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowAdminPanel(false)}
              className="h-8 w-8"
            >
              <X size={16} />
            </Button>
          </div>
          
          <div className="space-y-4">
            <Button
              onClick={() => navigate('/dashboard')}
              className="w-full bg-primary hover:bg-primary/90"
            >
              <Settings size={16} className="mr-2" />
              Dashboard
            </Button>
            
            <Button
              onClick={() => navigate('/schedule')}
              variant="outline"
              className="w-full border-cyan-500/50 text-cyan-400"
            >
              <Calendar size={16} className="mr-2" />
              TV Guide
            </Button>
            
            {currentChannel && (
              <Button
                onClick={() => navigate(`/edit/${currentChannel.id}`)}
                variant="outline"
                className="w-full"
              >
                <Edit size={16} className="mr-2" />
                Edit Channel
              </Button>
            )}
            
            <Button
              onClick={() => navigate('/create')}
              variant="outline"
              className="w-full"
            >
              <Plus size={16} className="mr-2" />
              Create Channel
            </Button>
          </div>
          
          <div className="mt-6 p-3 bg-white/5 rounded-lg text-xs text-gray-400">
            <p className="font-medium text-gray-300 mb-2">Schedule Info</p>
            <p>Date: {scheduleDate}</p>
            <p>Timezone: Eastern (ET)</p>
            <p className="mt-2">Resets at midnight ET</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveTV;
