import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { channelsAPI } from '../lib/api';
import { Play, Pause, Volume2, VolumeX, SkipForward, SkipBack } from 'lucide-react';
import '../embed.css';

// Calculate the current position in a channel's playlist based on real time
const calculateLivePosition = (videos) => {
  if (!videos || videos.length === 0) return { videoIndex: 0, seekTime: 0 };
  
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  
  const secondsSinceMidnight = Math.floor((now - startOfDay) / 1000);
  
  let totalDuration = 0;
  videos.forEach(v => {
    totalDuration += v.duration || 300;
  });
  
  if (totalDuration === 0) return { videoIndex: 0, seekTime: 0 };
  
  const positionInPlaylist = secondsSinceMidnight % totalDuration;
  
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

const EmbedPlayer = () => {
  const { channelId } = useParams();
  const [searchParams] = useSearchParams();
  
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [seekTime, setSeekTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(searchParams.get('muted') === '1');
  const [showControls, setShowControls] = useState(false);
  const controlsTimeoutRef = useRef(null);

  // Options from query params
  const autoplay = searchParams.get('autoplay') !== '0';
  const showInfo = searchParams.get('info') !== '0';
  const showBranding = searchParams.get('branding') !== '0';
  const liveSync = searchParams.get('live') !== '0'; // Default to live sync

  useEffect(() => {
    loadChannel();
  }, [channelId]);

  const loadChannel = async () => {
    try {
      const response = await channelsAPI.getById(channelId);
      setChannel(response.data);
      
      // Calculate live position if live sync enabled
      if (liveSync && response.data.videos?.length > 0) {
        const { videoIndex, seekTime: newSeekTime } = calculateLivePosition(response.data.videos);
        setCurrentIndex(videoIndex);
        setSeekTime(newSeekTime);
      }
      
      setIsPlaying(autoplay);
    } catch (err) {
      setError('Channel not found');
    } finally {
      setLoading(false);
    }
  };

  // Sync to live position periodically
  useEffect(() => {
    if (!liveSync || !channel?.videos?.length) return;
    
    const syncInterval = setInterval(() => {
      const { videoIndex, seekTime: newSeekTime } = calculateLivePosition(channel.videos);
      if (videoIndex !== currentIndex) {
        setCurrentIndex(videoIndex);
        setSeekTime(newSeekTime);
      }
    }, 5000);
    
    return () => clearInterval(syncInterval);
  }, [liveSync, channel, currentIndex]);

  const currentVideo = channel?.videos?.[currentIndex];
  const isLiveStreamChannel = channel?.is_live_stream && channel?.live_stream_youtube_id;
  const isUploadedVideo = currentVideo && (currentVideo.video_url && !currentVideo.youtube_id);

  const nextVideo = useCallback(() => {
    if (channel?.videos?.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % channel.videos.length);
    }
  }, [channel?.videos?.length]);

  const prevVideo = () => {
    if (channel?.videos?.length > 1) {
      setCurrentIndex((prev) => (prev - 1 + channel.videos.length) % channel.videos.length);
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  if (loading) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm opacity-70">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <p className="text-white text-sm">{error || 'Channel not available'}</p>
      </div>
    );
  }

  // Live stream channels
  if (isLiveStreamChannel) {
    const liveEmbedUrl = `https://www.youtube.com/embed/${channel.live_stream_youtube_id}?autoplay=1&mute=${isMuted ? 1 : 0}&rel=0&modestbranding=1&playsinline=1`;
    return (
      <div className="embed-container" onMouseMove={handleMouseMove} onMouseLeave={() => setShowControls(false)} data-testid="embed-player">
        <iframe
          src={liveEmbedUrl}
          title={channel.name}
          className="absolute inset-0 w-full h-full"
          style={{ border: 'none' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        {showBranding && (
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded z-10">
            <span className="text-[10px] font-bold text-white tracking-wider">HUSH MUSIC TV</span>
          </div>
        )}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-red-600 px-2 py-1 rounded-sm z-10">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          <span className="text-[10px] font-bold text-white">LIVE</span>
        </div>
      </div>
    );
  }

  if (!currentVideo) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <p className="text-white text-sm">No content available</p>
      </div>
    );
  }

  // Determine player source
  const youtubeEmbedUrl = currentVideo.youtube_id
    ? `https://www.youtube.com/embed/${currentVideo.youtube_id}?autoplay=${isPlaying ? 1 : 0}&mute=${isMuted ? 1 : 0}&start=${liveSync ? Math.floor(seekTime) : 0}&rel=0&modestbranding=1&playsinline=1`
    : null;

  return (
    <div 
      className="embed-container"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setShowControls(false)}
      data-testid="embed-player"
    >
      {/* YouTube Embed */}
      <iframe
        key={`${currentVideo.youtube_id}-${isPlaying}-${isMuted}-${currentIndex}`}
        src={embedUrl}
        title={currentVideo.title}
        className="absolute inset-0 w-full h-full"
        style={{ border: 'none' }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />

      {/* Branding Watermark */}
      {showBranding && (
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded z-10">
          <span className="text-[10px] font-bold text-white tracking-wider">HUSH MUSIC TV</span>
        </div>
      )}

      {/* Live Badge */}
      {channel.is_24_7 && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-red-600 px-2 py-1 rounded-sm z-10">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          <span className="text-[10px] font-bold text-white">LIVE</span>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Channel Info */}
        {showInfo && (
          <div className="mb-3">
            <h3 className="font-bold text-white text-sm truncate">{channel.name}</h3>
            <p className="text-gray-300 text-xs truncate">{currentVideo.title}</p>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {channel.videos.length > 1 && (
              <button
                onClick={prevVideo}
                className="p-1.5 hover:bg-white/20 rounded-full transition-colors text-white"
              >
                <SkipBack size={16} />
              </button>
            )}
            
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors text-white"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>

            {channel.videos.length > 1 && (
              <button
                onClick={nextVideo}
                className="p-1.5 hover:bg-white/20 rounded-full transition-colors text-white"
              >
                <SkipForward size={16} />
              </button>
            )}

            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 hover:bg-white/20 rounded-full transition-colors text-white"
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>

            {channel.videos.length > 1 && (
              <span className="text-xs text-gray-400 ml-2">
                {currentIndex + 1}/{channel.videos.length}
              </span>
            )}
          </div>

          {/* Powered by link */}
          {showBranding && (
            <a
              href={window.location.origin}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-gray-400 hover:text-white transition-colors"
            >
              Hush Music TV
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmbedPlayer;
