import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { channelsAPI, favoritesAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import VideoPlayer from '../components/VideoPlayer';
import ChannelCard from '../components/ChannelCard';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { Input } from '../components/ui/input';
import { 
  Heart, 
  Share2, 
  Users, 
  Radio, 
  Calendar,
  ChevronRight,
  ExternalLink,
  Code,
  Copy,
  Check
} from 'lucide-react';
import { toast } from 'sonner';

const Watch = () => {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  
  const [channel, setChannel] = useState(null);
  const [relatedChannels, setRelatedChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showEmbedCode, setShowEmbedCode] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  const isAdmin = user?.is_admin === true;

  useEffect(() => {
    loadChannel();
  }, [channelId]);

  const loadChannel = async () => {
    setLoading(true);
    try {
      const response = await channelsAPI.getById(channelId);
      setChannel(response.data);

      // Load related channels from same category
      const relatedRes = await channelsAPI.getAll({ category: response.data.category });
      setRelatedChannels(
        relatedRes.data.filter((c) => c.id !== channelId).slice(0, 4)
      );
    } catch (error) {
      console.error('Failed to load channel:', error);
      toast.error('Channel not found');
      navigate('/browse');
    } finally {
      setLoading(false);
    }
  };

  const handleFavorite = async () => {
    if (!isAuthenticated) {
      toast.error('Please sign in to add favorites');
      navigate('/login');
      return;
    }

    try {
      if (isFavorite) {
        await favoritesAPI.remove(channelId);
        setIsFavorite(false);
        toast.success('Removed from favorites');
      } else {
        await favoritesAPI.add(channelId);
        setIsFavorite(true);
        toast.success('Added to favorites');
      }
    } catch (error) {
      toast.error('Failed to update favorites');
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard!');
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  const embedCode = `<iframe src="${window.location.origin}/embed/${channelId}" width="640" height="360" frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;

  const copyEmbedCode = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopiedEmbed(true);
      toast.success('Embed code copied!');
      setTimeout(() => setCopiedEmbed(false), 2000);
    } catch (error) {
      toast.error('Failed to copy embed code');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" data-testid="watch-page-loading">
        <Skeleton className="w-full aspect-video bg-white/10" />
        <div className="px-6 md:px-12 lg:px-16 py-8 space-y-4">
          <Skeleton className="h-10 w-1/2 bg-white/10" />
          <Skeleton className="h-6 w-1/3 bg-white/10" />
        </div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Radio size={64} className="mx-auto mb-4 text-gray-500" />
          <h2 className="text-xl font-semibold mb-2">Channel not found</h2>
          <Button onClick={() => navigate('/browse')}>Browse Channels</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" data-testid="watch-page">
      {/* Video Player */}
      <div className="w-full bg-black">
        <div className="max-w-[1920px] mx-auto">
          <VideoPlayer
            videos={channel.videos || []}
            channelName={channel.name}
            isLive={channel.is_24_7}
          />
        </div>
      </div>

      {/* Channel Info */}
      <div className="px-6 md:px-12 lg:px-16 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Content */}
          <div className="flex-1">
            {/* Channel Header */}
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  {channel.is_24_7 && (
                    <span className="flex items-center gap-1.5 bg-live px-2 py-1 rounded-sm text-xs font-bold">
                      <span className="w-1.5 h-1.5 bg-white rounded-full live-indicator" />
                      24/7
                    </span>
                  )}
                  <span className="text-sm text-gray-400 uppercase tracking-wider">
                    {channel.category}
                  </span>
                </div>
                <h1 className="font-heading text-4xl md:text-5xl tracking-tight mb-2">
                  {channel.name}
                </h1>
                <p className="text-gray-400 mb-4">
                  by <span className="text-white">{channel.owner_username}</span>
                </p>
                <p className="text-gray-300 max-w-2xl">
                  {channel.description || 'No description available'}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleFavorite}
                  variant={isFavorite ? 'default' : 'outline'}
                  className={isFavorite 
                    ? 'bg-accent-rose hover:bg-accent-rose/90' 
                    : 'border-white/20 hover:bg-white/10'
                  }
                  data-testid="favorite-channel-btn"
                >
                  <Heart size={18} className="mr-2" fill={isFavorite ? 'currentColor' : 'none'} />
                  {isFavorite ? 'Favorited' : 'Favorite'}
                </Button>
                <Button
                  onClick={handleShare}
                  variant="outline"
                  className="border-white/20 hover:bg-white/10"
                  data-testid="share-btn"
                >
                  <Share2 size={18} className="mr-2" />
                  Share
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-6 mb-8 pb-8 border-b border-white/10">
              <div className="flex items-center gap-2 text-gray-400">
                <Users size={18} />
                <span>{channel.viewers_count?.toLocaleString() || 0} viewers</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Heart size={18} />
                <span>{channel.favorites_count?.toLocaleString() || 0} favorites</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Radio size={18} />
                <span>{channel.videos?.length || 0} videos in playlist</span>
              </div>
            </div>

            {/* Playlist */}
            <div>
              <h2 className="font-heading text-2xl tracking-wide mb-4 flex items-center gap-2">
                <Calendar size={24} className="text-primary" />
                Playlist
              </h2>

              {channel.videos && channel.videos.length > 0 ? (
                <div className="space-y-3">
                  {channel.videos.map((video, index) => (
                    <div
                      key={video.id}
                      className="flex items-center gap-4 p-3 rounded-lg bg-surface hover:bg-white/5 transition-colors"
                    >
                      <span className="w-8 text-center text-gray-500 font-mono">
                        {index + 1}
                      </span>
                      <div className="w-32 aspect-video bg-black rounded overflow-hidden flex-shrink-0">
                        <img
                          src={video.thumbnail || `https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`}
                          alt={video.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">{video.title}</h4>
                        <a
                          href={`https://youtube.com/watch?v=${video.youtube_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-gray-400 hover:text-primary flex items-center gap-1"
                        >
                          YouTube <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <Radio size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No videos in playlist</p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - Related Channels */}
          <aside className="lg:w-80 xl:w-96">
            <div className="sticky top-24">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading text-xl tracking-wide">Related Channels</h3>
                <Link
                  to={`/browse?category=${channel.category}`}
                  className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
                >
                  More <ChevronRight size={14} />
                </Link>
              </div>

              <div className="space-y-4">
                {relatedChannels.length > 0 ? (
                  relatedChannels.map((relChannel) => (
                    <Link
                      key={relChannel.id}
                      to={`/watch/${relChannel.id}`}
                      className="flex gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group"
                    >
                      <div className="w-32 aspect-video bg-black rounded overflow-hidden flex-shrink-0">
                        <img
                          src={relChannel.thumbnail || relChannel.videos?.[0]?.thumbnail || 'https://images.unsplash.com/photo-1576307302704-b6142d572612?w=400'}
                          alt={relChannel.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                          {relChannel.name}
                        </h4>
                        <p className="text-xs text-gray-400">{relChannel.owner_username}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {relChannel.viewers_count?.toLocaleString() || 0} viewers
                        </p>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-gray-400">No related channels</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default Watch;
