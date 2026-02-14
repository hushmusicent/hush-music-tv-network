import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { channelsAPI, uploadAPI, categoriesAPI } from '../lib/api';
import ChannelCard from '../components/ChannelCard';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  Tv, 
  Plus, 
  Radio, 
  TrendingUp, 
  Heart,
  Settings,
  User,
  Code,
  Copy,
  Check,
  Film,
  Trash2,
  FileVideo,
  Upload,
  FolderOpen,
  Edit,
  Eye,
  Clock,
  LayoutGrid,
  List
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

const Dashboard = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const [channels, setChannels] = useState([]);
  const [uploadedVideos, setUploadedVideos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteChannelId, setDeleteChannelId] = useState(null);
  const [deleteVideoId, setDeleteVideoId] = useState(null);
  const [copiedNetworkEmbed, setCopiedNetworkEmbed] = useState(false);
  const [activeTab, setActiveTab] = useState('channels');
  const [viewMode, setViewMode] = useState('grid');

  useEffect(() => {
    if (authLoading) return;
    
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    loadData();
  }, [isAuthenticated, authLoading, navigate]);

  const loadData = async () => {
    try {
      const [channelsRes, videosRes, categoriesRes] = await Promise.all([
        user?.is_admin ? channelsAPI.getAll({}) : channelsAPI.getMy(),
        uploadAPI.listVideos().catch(() => ({ data: [] })),
        categoriesAPI.getAll()
      ]);
      setChannels(channelsRes.data);
      setUploadedVideos(videosRes.data || []);
      setCategories(categoriesRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChannel = async () => {
    if (!deleteChannelId) return;

    try {
      await channelsAPI.delete(deleteChannelId);
      setChannels((prev) => prev.filter((c) => c.id !== deleteChannelId));
      toast.success('Channel deleted successfully');
    } catch (error) {
      toast.error('Failed to delete channel');
    } finally {
      setDeleteChannelId(null);
    }
  };

  const handleDeleteVideo = async () => {
    if (!deleteVideoId) return;

    try {
      await uploadAPI.deleteVideo(deleteVideoId);
      setUploadedVideos((prev) => prev.filter((v) => v.id !== deleteVideoId));
      toast.success('Video deleted successfully');
    } catch (error) {
      toast.error('Failed to delete video');
    } finally {
      setDeleteVideoId(null);
    }
  };

  const totalViewers = channels.reduce((sum, c) => sum + (c.viewers_count || 0), 0);
  const totalFavorites = channels.reduce((sum, c) => sum + (c.favorites_count || 0), 0);
  const totalVideos = channels.reduce((sum, c) => sum + (c.videos?.length || 0), 0);
  const totalUploadedSize = uploadedVideos.reduce((sum, v) => sum + (v.size || 0), 0);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const networkEmbedCode = `<iframe src="${window.location.origin}/embed" width="100%" height="600" frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;

  const copyNetworkEmbed = async () => {
    try {
      await navigator.clipboard.writeText(networkEmbedCode);
      setCopiedNetworkEmbed(true);
      toast.success('Network embed code copied!');
      setTimeout(() => setCopiedNetworkEmbed(false), 2000);
    } catch (error) {
      toast.error('Failed to copy embed code');
    }
  };

  return (
    <div className="min-h-screen overflow-y-auto px-6 md:px-12 lg:px-16 py-8" data-testid="dashboard-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-heading text-4xl md:text-5xl tracking-tight flex items-center gap-3">
            <Settings size={36} className="text-primary" />
            Admin Dashboard
          </h1>
          <p className="text-gray-400 mt-2">
            Manage your TV network, channels, and content
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={() => navigate('/create')}
            className="bg-primary hover:bg-primary-hover font-bold glow-primary-hover"
            data-testid="create-channel-btn"
          >
            <Plus size={18} className="mr-2" />
            Create Channel
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="glass rounded-lg p-4 md:p-6">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-2 md:p-3 bg-primary/20 rounded-lg">
              <Tv size={20} className="text-primary" />
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-bold">{channels.length}</p>
              <p className="text-xs md:text-sm text-gray-400">Channels</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-lg p-4 md:p-6">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-2 md:p-3 bg-accent-lime/20 rounded-lg">
              <Film size={20} className="text-accent-lime" />
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-bold">{totalVideos}</p>
              <p className="text-xs md:text-sm text-gray-400">Total Videos</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-lg p-4 md:p-6">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-2 md:p-3 bg-accent-cyan/20 rounded-lg">
              <TrendingUp size={20} className="text-accent-cyan" />
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-bold">{totalViewers.toLocaleString()}</p>
              <p className="text-xs md:text-sm text-gray-400">Viewers</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-lg p-4 md:p-6">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-2 md:p-3 bg-accent-rose/20 rounded-lg">
              <Heart size={20} className="text-accent-rose" />
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-bold">{totalFavorites.toLocaleString()}</p>
              <p className="text-xs md:text-sm text-gray-400">Favorites</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between mb-6">
          <TabsList className="bg-surface border border-white/10">
            <TabsTrigger value="channels" className="flex items-center gap-2" data-testid="tab-channels">
              <Tv size={16} />
              Channels
            </TabsTrigger>
            <TabsTrigger value="videos" className="flex items-center gap-2" data-testid="tab-videos">
              <Upload size={16} />
              Uploaded Videos
            </TabsTrigger>
            <TabsTrigger value="embed" className="flex items-center gap-2" data-testid="tab-embed">
              <Code size={16} />
              Embed
            </TabsTrigger>
          </TabsList>

          {activeTab === 'channels' && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode('grid')}
                className={viewMode === 'grid' ? 'bg-white/10' : ''}
              >
                <LayoutGrid size={18} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode('list')}
                className={viewMode === 'list' ? 'bg-white/10' : ''}
              >
                <List size={18} />
              </Button>
            </div>
          )}
        </div>

        {/* Channels Tab */}
        <TabsContent value="channels">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array(4).fill(0).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="aspect-video rounded-lg bg-white/10" />
                  <Skeleton className="h-5 w-3/4 bg-white/10" />
                  <Skeleton className="h-4 w-1/2 bg-white/10" />
                </div>
              ))}
            </div>
          ) : channels.length > 0 ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {channels.map((channel, index) => (
                  <div
                    key={channel.id}
                    className="animate-slide-up"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <ChannelCard
                      channel={channel}
                      showMenu={true}
                      onDelete={setDeleteChannelId}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {channels.map((channel) => (
                  <div
                    key={channel.id}
                    className="glass rounded-lg p-4 flex items-center gap-4 hover:bg-white/5 transition-colors"
                  >
                    <div className="w-32 h-20 bg-black rounded-lg overflow-hidden flex-shrink-0">
                      <img
                        src={channel.thumbnail || channel.videos?.[0]?.thumbnail || 'https://images.unsplash.com/photo-1576307302704-b6142d572612?w=400'}
                        alt={channel.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{channel.name}</h3>
                      <p className="text-sm text-gray-400">{channel.category} • {channel.videos?.length || 0} videos</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Eye size={12} /> {channel.viewers_count || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart size={12} /> {channel.favorites_count || 0}
                        </span>
                        {channel.is_24_7 && (
                          <span className="text-red-400">24/7</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/watch/${channel.id}`)}
                        className="text-gray-400 hover:text-white"
                      >
                        <Eye size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/edit/${channel.id}`)}
                        className="text-gray-400 hover:text-primary"
                        data-testid={`edit-channel-${channel.id}`}
                      >
                        <Edit size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteChannelId(channel.id)}
                        className="text-gray-400 hover:text-red-500"
                        data-testid={`delete-channel-${channel.id}`}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="text-center py-16 glass rounded-lg">
              <Radio size={64} className="mx-auto mb-4 text-gray-600" />
              <h3 className="text-xl font-semibold mb-2">No channels yet</h3>
              <p className="text-gray-400 mb-6">
                Create your first channel and start broadcasting!
              </p>
              <Button
                onClick={() => navigate('/create')}
                className="bg-primary hover:bg-primary-hover"
              >
                <Plus size={18} className="mr-2" />
                Create Channel
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Uploaded Videos Tab */}
        <TabsContent value="videos">
          <div className="glass rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <FolderOpen size={20} className="text-primary" />
                  Video Library
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  {uploadedVideos.length} videos • {formatFileSize(totalUploadedSize)} total
                </p>
              </div>
              <Button
                onClick={() => navigate('/create')}
                className="bg-primary hover:bg-primary-hover"
              >
                <Upload size={16} className="mr-2" />
                Upload Video
              </Button>
            </div>
          </div>

          {uploadedVideos.length > 0 ? (
            <div className="space-y-3">
              {uploadedVideos.map((video) => (
                <div
                  key={video.id}
                  className="glass rounded-lg p-4 flex items-center gap-4 hover:bg-white/5 transition-colors"
                >
                  <div className="w-20 h-14 bg-black rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileVideo size={24} className="text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate">{video.original_name}</h4>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span>{formatFileSize(video.size)}</span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> {Math.floor((video.duration || 300) / 60)} min
                      </span>
                      <span>{new Date(video.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteVideoId(video.id)}
                    className="text-gray-400 hover:text-red-500"
                    data-testid={`delete-video-${video.id}`}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 glass rounded-lg">
              <FileVideo size={64} className="mx-auto mb-4 text-gray-600" />
              <h3 className="text-xl font-semibold mb-2">No uploaded videos</h3>
              <p className="text-gray-400 mb-6">
                Upload MP4 videos to use in your channels
              </p>
              <Button
                onClick={() => navigate('/create')}
                className="bg-primary hover:bg-primary-hover"
              >
                <Upload size={18} className="mr-2" />
                Upload Video
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Embed Tab */}
        <TabsContent value="embed">
          <div className="glass rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Code size={20} className="text-primary" />
              Network Embed Code
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Embed your entire TV network on any website. Shows all channels with a sidebar selector.
            </p>
            <div className="flex gap-2 mb-6">
              <Input
                value={networkEmbedCode}
                readOnly
                className="flex-1 bg-black/50 border-white/10 font-mono text-xs"
              />
              <Button
                onClick={copyNetworkEmbed}
                className="bg-primary hover:bg-primary-hover"
              >
                {copiedNetworkEmbed ? <Check size={18} /> : <Copy size={18} />}
              </Button>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-3">URL Options</h4>
                <ul className="text-sm text-gray-400 space-y-2">
                  <li><code className="text-primary">?category=Music</code> - Filter by category</li>
                  <li><code className="text-primary">?sidebar=0</code> - Hide channel sidebar</li>
                  <li><code className="text-primary">?muted=1</code> - Start muted</li>
                  <li><code className="text-primary">?autoplay=0</code> - Disable autoplay</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-3">Single Channel Embed</h4>
                <p className="text-sm text-gray-400 mb-2">
                  To embed a single channel, use:
                </p>
                <code className="text-xs text-primary block bg-black/30 p-2 rounded">
                  {window.location.origin}/embed/[channel-id]
                </code>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              to="/live"
              className="glass rounded-lg p-4 hover:bg-white/5 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <Radio size={20} className="text-red-500" />
                </div>
                <div>
                  <h4 className="font-medium">Live TV</h4>
                  <p className="text-xs text-gray-400">Preview your network</p>
                </div>
              </div>
            </Link>

            <Link
              to="/guide"
              className="glass rounded-lg p-4 hover:bg-white/5 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Tv size={20} className="text-blue-500" />
                </div>
                <div>
                  <h4 className="font-medium">TV Guide</h4>
                  <p className="text-xs text-gray-400">View full schedule</p>
                </div>
              </div>
            </Link>

            <Link
              to="/browse"
              className="glass rounded-lg p-4 hover:bg-white/5 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <Eye size={20} className="text-green-500" />
                </div>
                <div>
                  <h4 className="font-medium">Browse</h4>
                  <p className="text-xs text-gray-400">View as visitor</p>
                </div>
              </div>
            </Link>
          </div>
        </TabsContent>
      </Tabs>

      {/* Delete Channel Dialog */}
      <AlertDialog open={!!deleteChannelId} onOpenChange={() => setDeleteChannelId(null)}>
        <AlertDialogContent className="bg-surface border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Channel</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to delete this channel? This action cannot be undone.
              All videos and schedule data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/20">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChannel}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-delete-channel-btn"
            >
              Delete Channel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Video Dialog */}
      <AlertDialog open={!!deleteVideoId} onOpenChange={() => setDeleteVideoId(null)}>
        <AlertDialogContent className="bg-surface border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Video</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to delete this uploaded video? This action cannot be undone.
              The video file will be permanently removed from the server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/20">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteVideo}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-delete-video-btn"
            >
              Delete Video
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;
