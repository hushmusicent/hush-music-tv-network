import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { channelsAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
  ChevronUp, 
  ChevronDown, 
  Radio, 
  Clock, 
  Tv,
  Volume2,
  VolumeX,
  Maximize,
  List
} from 'lucide-react';

// Calculate the current position in a channel's playlist based on real time
const calculateLivePosition = (videos, baseTime = null) => {
  if (!videos || videos.length === 0) return { videoIndex: 0, seekTime: 0 };
  
  const now = baseTime || new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  
  // Seconds since midnight
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
  const [channels, setChannels] = useState([]);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [seekTime, setSeekTime] = useState(0);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [showChannelList, setShowChannelList] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const playerRef = useRef(null);
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
      
      // Only update if video changed
      if (videoIndex !== currentVideoIndex) {
        setCurrentVideoIndex(videoIndex);
        setSeekTime(newSeekTime);
      }
    }, 5000); // Check every 5 seconds
    
    return () => clearInterval(syncInterval);
  }, [currentChannel, currentVideoIndex]);

  // Update schedule when channel changes
  useEffect(() => {
    if (currentChannel?.videos) {
      setSchedule(generateSchedule(currentChannel.videos));
    }
  }, [currentChannel, currentTime]);

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
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [channels, currentChannel]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Tv size={48} className="mx-auto mb-4 text-primary animate-pulse" />
          <p className="text-gray-400">Loading Live TV...</p>
        </div>
      </div>
    );
  }

  const currentVideo = currentChannel?.videos?.[currentVideoIndex];
  
  // Build YouTube URL with start time for live sync
  const embedUrl = currentVideo 
    ? `https://www.youtube.com/embed/${currentVideo.youtube_id}?autoplay=1&mute=${isMuted ? 1 : 0}&start=${Math.floor(seekTime)}&rel=0&modestbranding=1&controls=0&enablejsapi=1`
    : '';

  return (
    <div className="min-h-screen bg-black" data-testid="live-tv-page">
      <div className="flex h-screen">
        {/* Channel List Sidebar */}
        {showChannelList && (
          <div className="w-72 bg-[#0A0A0A] border-r border-white/10 flex flex-col">
            <div className="p-4 border-b border-white/10">
              <h2 className="font-heading text-xl tracking-wide flex items-center gap-2">
                <Radio size={20} className="text-primary" />
                CHANNELS
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                {channels.length} channels • Use ↑↓ to switch
              </p>
            </div>
            
            <ScrollArea className="flex-1">
              <div className="p-2">
                {channels.map((channel, index) => (
                  <button
                    key={channel.id}
                    onClick={() => selectChannel(channel)}
                    className={`w-full p-3 rounded-lg flex items-center gap-3 text-left transition-all ${
                      currentChannel?.id === channel.id
                        ? 'bg-primary/20 border border-primary/50'
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                    data-testid={`channel-btn-${channel.id}`}
                  >
                    <div className="w-10 h-10 rounded bg-surface flex items-center justify-center text-lg font-bold text-primary">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{channel.name}</h4>
                      <p className="text-xs text-gray-500 truncate">{channel.category}</p>
                    </div>
                    {currentChannel?.id === channel.id && (
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-[10px] text-red-400 font-medium">LIVE</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Video Player */}
          <div 
            ref={playerRef}
            className="relative flex-1 bg-black group"
          >
            {currentVideo ? (
              <>
                <iframe
                  ref={iframeRef}
                  key={`${currentVideo.youtube_id}-${currentVideoIndex}-${Math.floor(seekTime)}`}
                  src={embedUrl}
                  title={currentVideo.title}
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />

                {/* Channel Info Overlay */}
                <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 bg-red-600 px-3 py-1 rounded">
                        <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                        <span className="text-xs font-bold">LIVE</span>
                      </div>
                      <div>
                        <h3 className="font-heading text-2xl">{currentChannel?.name}</h3>
                        <p className="text-sm text-gray-300">{currentVideo.title}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <Clock size={16} />
                      {currentTime.toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                {/* Controls Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {/* Channel Up/Down */}
                      <div className="flex flex-col gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => changeChannel('up')}
                          className="h-8 px-3 bg-white/10 hover:bg-white/20"
                          data-testid="channel-up-btn"
                        >
                          <ChevronUp size={18} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => changeChannel('down')}
                          className="h-8 px-3 bg-white/10 hover:bg-white/20"
                          data-testid="channel-down-btn"
                        >
                          <ChevronDown size={18} />
                        </Button>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsMuted(!isMuted)}
                        className="bg-white/10 hover:bg-white/20"
                        data-testid="mute-btn"
                      >
                        {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowChannelList(!showChannelList)}
                        className="bg-white/10 hover:bg-white/20"
                        data-testid="toggle-channels-btn"
                      >
                        <List size={18} />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 bg-black/50 px-2 py-1 rounded">
                        CH {channels.findIndex(c => c.id === currentChannel?.id) + 1}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={toggleFullscreen}
                        className="bg-white/10 hover:bg-white/20"
                        data-testid="fullscreen-btn"
                      >
                        <Maximize size={18} />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-gray-400">Select a channel to watch</p>
              </div>
            )}
          </div>

          {/* Schedule Bar */}
          <div className="bg-[#0A0A0A] border-t border-white/10">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading text-lg tracking-wide flex items-center gap-2">
                  <Clock size={18} className="text-primary" />
                  SCHEDULE
                </h3>
                <span className="text-xs text-gray-500">
                  {currentChannel?.name} • What's on
                </span>
              </div>
              
              <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
                {schedule.map((slot, index) => (
                  <div
                    key={index}
                    className={`flex-shrink-0 p-3 rounded-lg border ${
                      slot.isNowPlaying
                        ? 'bg-primary/20 border-primary/50 min-w-[200px]'
                        : 'bg-surface border-white/5 min-w-[180px]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-mono ${slot.isNowPlaying ? 'text-primary' : 'text-gray-500'}`}>
                        {formatTime(slot.startTime)}
                      </span>
                      {slot.isNowPlaying && (
                        <span className="text-[10px] bg-red-600 px-1.5 py-0.5 rounded text-white font-bold">
                          NOW
                        </span>
                      )}
                    </div>
                    <p className={`text-sm truncate ${slot.isNowPlaying ? 'text-white' : 'text-gray-400'}`}>
                      {slot.video.title}
                    </p>
                    <p className="text-[10px] text-gray-600 mt-1">
                      {Math.floor((slot.video.duration || 300) / 60)} min
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveTV;
