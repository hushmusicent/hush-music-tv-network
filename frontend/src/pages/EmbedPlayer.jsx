import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { channelsAPI } from '../lib/api';
import { Play, Pause, Volume2, VolumeX, SkipForward, SkipBack } from 'lucide-react';
import '../embed.css';

const EmbedPlayer = () => {
  const { channelId } = useParams();
  const [searchParams] = useSearchParams();
  
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(searchParams.get('muted') === '1');
  const [showControls, setShowControls] = useState(false);
  const controlsTimeoutRef = useRef(null);

  // Options from query params
  const autoplay = searchParams.get('autoplay') !== '0';
  const showInfo = searchParams.get('info') !== '0';
  const showBranding = searchParams.get('branding') !== '0';

  useEffect(() => {
    loadChannel();
  }, [channelId]);

  const loadChannel = async () => {
    try {
      const response = await channelsAPI.getById(channelId);
      setChannel(response.data);
      setIsPlaying(autoplay);
    } catch (err) {
      setError('Channel not found');
    } finally {
      setLoading(false);
    }
  };

  const currentVideo = channel?.videos?.[currentIndex];

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

  if (!currentVideo) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <p className="text-white text-sm">No content available</p>
      </div>
    );
  }

  const embedUrl = `https://www.youtube.com/embed/${currentVideo.youtube_id}?autoplay=${isPlaying ? 1 : 0}&mute=${isMuted ? 1 : 0}&rel=0&modestbranding=1&controls=0&enablejsapi=1`;

  return (
    <div 
      className="embed-container"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setShowControls(false)}
      data-testid="embed-player"
    >
      {/* YouTube Embed */}
      <iframe
        key={`${currentVideo.youtube_id}-${isPlaying}-${isMuted}`}
        src={embedUrl}
        title={currentVideo.title}
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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
