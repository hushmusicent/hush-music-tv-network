import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { channelsAPI } from '../lib/api';
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
  Shuffle,
  SkipForward
} from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Seeded random function for consistent shuffling across all viewers
const seededRandom = (seed) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

// Shuffle array using a seed (date-based so all viewers see same order)
const shuffleWithSeed = (array, seed) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Get today's seed - changes daily so playlist order changes each day
const getDailySeed = () => {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
};

// Get playlist videos (shuffled if random play enabled)
const getPlaylistVideos = (videos, randomPlay = false) => {
  if (!videos || videos.length === 0) return [];
  return randomPlay ? shuffleWithSeed(videos, getDailySeed()) : videos;
};

const LiveTV = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const isAdmin = user?.is_admin;
  
  const [channels, setChannels] = useState([]);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [playlistVideos, setPlaylistVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [showChannelList, setShowChannelList] = useState(true);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const playerRef = useRef(null);
  const videoRef = useRef(null);
  const youtubePlayerRef = useRef(null);

  // Load YouTube IFrame API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
  }, []);

  useEffect(() => {
    loadChannels();
    
    // Update time every second for live feel
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(timeInterval);
  }, []);

  // Get current video from playlist
  const currentVideo = playlistVideos[currentVideoIndex];
  const isUploadedVideo = currentVideo && (currentVideo.video_url || !currentVideo.youtube_id);

  // Play next video in playlist
  const playNextVideo = useCallback(() => {
    if (playlistVideos.length === 0) return;
    const nextIndex = (currentVideoIndex + 1) % playlistVideos.length;
    setCurrentVideoIndex(nextIndex);
  }, [playlistVideos, currentVideoIndex]);

  // Handle uploaded video ending
  const handleUploadedVideoEnd = () => {
    playNextVideo();
  };

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

    // Wait for YT API to load
    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(initPlayer, 100);
        return;
      }

      youtubePlayerRef.current = new window.YT.Player('youtube-player', {
        videoId: currentVideo.youtube_id,
        playerVars: {
          autoplay: 1,
          mute: isMuted ? 1 : 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onStateChange: (event) => {
            // YT.PlayerState.ENDED = 0
            if (event.data === 0) {
              playNextVideo();
            }
          },
          onError: () => {
            // Skip to next video on error
            toast.error('Video unavailable, skipping...');
            setTimeout(playNextVideo, 1000);
          }
        }
      });
    };

    initPlayer();

    return () => {
      if (youtubePlayerRef.current) {
        try {
          youtubePlayerRef.current.destroy();
        } catch (e) {}
        youtubePlayerRef.current = null;
      }
    };
  }, [currentVideo?.youtube_id, isUploadedVideo, isMuted, playNextVideo]);

  // Handle uploaded video playback
  useEffect(() => {
    if (isUploadedVideo && videoRef.current) {
      const video = videoRef.current;
      video.currentTime = 0; // Start from beginning
      video.muted = isMuted;
      video.play().catch(() => {});
    }
  }, [currentVideoIndex, isUploadedVideo, isMuted]);

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
    // Get playlist videos (shuffled if random play enabled)
    const videos = getPlaylistVideos(channel.videos, channel.random_play);
    setCurrentChannel(channel);
    setPlaylistVideos(videos);
    setCurrentVideoIndex(0); // Start from first video
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
                    <h4 className="font-medium text-sm truncate flex items-center gap-1">
                      {channel.name}
                      {channel.random_play && (
                        <Shuffle size={12} className="text-purple-400 flex-shrink-0" />
                      )}
                    </h4>
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
                    playsInline
                    data-testid="live-uploaded-video"
                  />
                ) : currentVideo.youtube_id ? (
                  /* YouTube Player using IFrame API - plays to completion */
                  <div 
                    id="youtube-player" 
                    className="absolute inset-0 w-full h-full"
                    data-testid="live-youtube-video"
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
                  <p className="text-xs text-gray-500">
                    {Math.floor((item.video.duration || 300) / 60)}:{((item.video.duration || 300) % 60).toString().padStart(2, '0')}
                  </p>
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
