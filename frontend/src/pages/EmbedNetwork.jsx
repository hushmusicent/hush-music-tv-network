import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { channelsAPI } from '../lib/api';
import { Play, ChevronLeft, ChevronRight } from 'lucide-react';
import '../embed.css';

const EmbedNetwork = () => {
  const [searchParams] = useSearchParams();
  const [channels, setChannels] = useState([]);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(searchParams.get('muted') === '1');
  const scrollRef = useRef(null);

  // Options from query params
  const category = searchParams.get('category');
  const autoplay = searchParams.get('autoplay') !== '0';
  const showSidebar = searchParams.get('sidebar') !== '0';

  useEffect(() => {
    loadChannels();
  }, [category]);

  const loadChannels = async () => {
    try {
      const params = category ? { category } : {};
      const response = await channelsAPI.getAll(params);
      const activeChannels = response.data.filter(c => c.videos?.length > 0 || (c.is_live_stream && c.live_stream_youtube_id));
      setChannels(activeChannels);
      if (activeChannels.length > 0) {
        setCurrentChannel(activeChannels[0]);
      }
      setIsPlaying(autoplay);
    } catch (err) {
      console.error('Failed to load channels:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectChannel = (channel) => {
    setCurrentChannel(channel);
    setCurrentIndex(0);
  };

  const currentVideo = currentChannel?.videos?.[currentIndex];

  const nextVideo = () => {
    if (currentChannel?.videos?.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % currentChannel.videos.length);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-full bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-white text-center">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm opacity-70">Loading Hush Music TV...</p>
        </div>
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="w-full h-full bg-[#0A0A0A] flex items-center justify-center">
        <p className="text-white text-sm">No channels available</p>
      </div>
    );
  }

  const embedUrl = currentVideo 
    ? currentVideo.youtube_id 
      ? `https://www.youtube.com/embed/${currentVideo.youtube_id}?autoplay=${isPlaying ? 1 : 0}&mute=${isMuted ? 1 : 0}&rel=0&modestbranding=1&controls=0`
      : null
    : '';
  const isLiveStreamChannel = currentChannel?.is_live_stream && currentChannel?.live_stream_youtube_id;
  const liveStreamUrl = isLiveStreamChannel
    ? `https://www.youtube.com/embed/${currentChannel.live_stream_youtube_id}?autoplay=1&mute=${isMuted ? 1 : 0}&rel=0&modestbranding=1`
    : null;

  return (
    <div className="embed-container flex" data-testid="embed-network">
      {/* Main Player */}
      <div className={`flex-1 flex flex-col ${showSidebar ? '' : 'w-full'}`}>
        {/* Video */}
        <div className="flex-1 relative bg-black">
          {isLiveStreamChannel ? (
            <iframe
              key={`live-${currentChannel.id}`}
              src={liveStreamUrl}
              title={currentChannel.name}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : currentVideo?.video_url && !currentVideo?.youtube_id ? (
            <video
              key={`r2-${currentVideo.video_id || currentIndex}`}
              src={currentVideo.video_url}
              className="absolute inset-0 w-full h-full object-contain bg-black"
              autoPlay={isPlaying}
              muted={isMuted}
              onEnded={nextVideo}
              playsInline
            />
          ) : currentVideo ? (
            <iframe
              key={`${currentVideo.youtube_id}-${isPlaying}-${isMuted}`}
              src={embedUrl}
              title={currentVideo.title}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              Select a channel
            </div>
          )}

          {/* Branding */}
          <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded z-10">
            <span className="text-xs font-bold text-white tracking-wider">HUSH MUSIC TV</span>
          </div>

          {/* Now Playing */}
          {currentChannel && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 z-10">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs text-red-400 font-medium">NOW PLAYING</span>
              </div>
              <h3 className="font-bold text-white truncate">{currentChannel.name}</h3>
              {currentVideo && (
                <p className="text-sm text-gray-300 truncate">{currentVideo.title}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Channel Sidebar */}
      {showSidebar && (
        <div className="w-64 bg-[#121212] border-l border-white/10 flex flex-col">
          <div className="p-3 border-b border-white/10">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Channels</h4>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => selectChannel(channel)}
                className={`w-full p-3 flex items-center gap-3 text-left transition-colors ${
                  currentChannel?.id === channel.id
                    ? 'bg-purple-600/20 border-l-2 border-purple-500'
                    : 'hover:bg-white/5 border-l-2 border-transparent'
                }`}
              >
                <div className="w-12 h-12 rounded bg-black flex-shrink-0 overflow-hidden">
                  <img
                    src={channel.thumbnail || channel.videos?.[0]?.thumbnail}
                    alt={channel.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h5 className="text-sm font-medium text-white truncate">{channel.name}</h5>
                  <p className="text-xs text-gray-500">{channel.category}</p>
                </div>
                {currentChannel?.id === channel.id && (
                  <Play size={14} className="text-purple-400" fill="currentColor" />
                )}
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-white/10 text-center">
            <a
              href={window.location.origin}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-gray-500 hover:text-purple-400 transition-colors"
            >
              Powered by Hush Music TV Network
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmbedNetwork;
