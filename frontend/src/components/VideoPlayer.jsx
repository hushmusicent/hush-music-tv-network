import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, SkipForward, SkipBack, Radio } from 'lucide-react';

const VideoPlayer = ({ videos = [], channelName = '', isLive = true, startIndex = 0, seekTime = 0 }) => {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [currentSeekTime, setCurrentSeekTime] = useState(seekTime);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const playerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);

  // Update when startIndex or seekTime changes (live sync)
  useEffect(() => {
    if (startIndex !== currentIndex) {
      setCurrentIndex(startIndex);
      setCurrentSeekTime(seekTime);
    }
  }, [startIndex, seekTime]);

  const currentVideo = videos[currentIndex];

  // Auto-advance to next video
  const handleVideoEnd = useCallback(() => {
    if (videos.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % videos.length);
    }
  }, [videos.length]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.key === 'm') {
        setIsMuted((prev) => !prev);
      } else if (e.key === 'ArrowRight') {
        handleVideoEnd();
      } else if (e.key === 'ArrowLeft' && videos.length > 1) {
        setCurrentIndex((prev) => (prev - 1 + videos.length) % videos.length);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleVideoEnd, videos.length]);

  // Show/hide controls
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  const nextVideo = () => {
    if (videos.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % videos.length);
    }
  };

  const prevVideo = () => {
    if (videos.length > 1) {
      setCurrentIndex((prev) => (prev - 1 + videos.length) % videos.length);
    }
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

  if (!currentVideo) {
    return (
      <div className="relative w-full aspect-video bg-black flex items-center justify-center">
        <div className="text-center">
          <Radio size={48} className="mx-auto mb-4 text-gray-500" />
          <p className="text-gray-400">No content available</p>
        </div>
      </div>
    );
  }

  // YouTube embed URL with autoplay, loop, and live seek position
  const embedUrl = `https://www.youtube.com/embed/${currentVideo.youtube_id}?autoplay=${isPlaying ? 1 : 0}&mute=${isMuted ? 1 : 0}&start=${Math.floor(currentSeekTime)}&rel=0&modestbranding=1&enablejsapi=1&loop=0&controls=0`;

  return (
    <div
      ref={playerRef}
      className="relative w-full aspect-video bg-black group"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setShowControls(false)}
      data-testid="video-player"
    >
      {/* YouTube Embed */}
      <iframe
        key={`${currentVideo.youtube_id}-${isPlaying}-${isMuted}-${currentIndex}-${Math.floor(currentSeekTime)}`}
        src={embedUrl}
        title={currentVideo.title}
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />

      {/* Live Badge */}
      {isLive && (
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 px-3 py-1 rounded-sm z-10">
          <span className="w-2 h-2 bg-white rounded-full live-indicator" />
          <span className="text-xs font-bold tracking-wider">LIVE</span>
        </div>
      )}

      {/* Channel Info Overlay */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-6 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="mb-4">
          <h3 className="font-heading text-2xl md:text-3xl tracking-wide">{channelName}</h3>
          <p className="text-gray-300 text-sm mt-1">{currentVideo.title}</p>
          {videos.length > 1 && (
            <p className="text-gray-500 text-xs mt-1">
              {currentIndex + 1} of {videos.length}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {videos.length > 1 && (
              <button
                onClick={prevVideo}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
                data-testid="prev-video-btn"
              >
                <SkipBack size={20} />
              </button>
            )}
            
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-3 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
              data-testid="play-pause-btn"
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>

            {videos.length > 1 && (
              <button
                onClick={nextVideo}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
                data-testid="next-video-btn"
              >
                <SkipForward size={20} />
              </button>
            )}

            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
              data-testid="mute-btn"
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
            data-testid="fullscreen-btn"
          >
            <Maximize size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
