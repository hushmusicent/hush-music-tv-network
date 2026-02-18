import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { channelsAPI, uploadAPI, categoriesAPI, videoCleanupAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../components/ui/collapsible';
import { 
  Tv, 
  Plus, 
  Radio, 
  TrendingUp, 
  Heart,
  Settings,
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
  ChevronDown,
  ChevronRight,
  Save,
  X,
  Youtube,
  ExternalLink,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  BarChart3,
  Calendar,
  AlertTriangle,
  RefreshCw,
  ArrowUpDown
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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const Dashboard = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const imageInputRef = useRef(null);
  
  const [channels, setChannels] = useState([]);
  const [uploadedVideos, setUploadedVideos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteChannelId, setDeleteChannelId] = useState(null);
  const [deleteVideoId, setDeleteVideoId] = useState(null);
  const [deleteChannelVideoInfo, setDeleteChannelVideoInfo] = useState(null);
  const [copiedNetworkEmbed, setCopiedNetworkEmbed] = useState(false);
  const [activeTab, setActiveTab] = useState('channels');
  const [expandedChannels, setExpandedChannels] = useState({});
  const [editingChannel, setEditingChannel] = useState(null);
  const [savingChannel, setSavingChannel] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingVideoDuration, setEditingVideoDuration] = useState({ channelId: null, videoId: null, value: '' });
  const [reorderMode, setReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  
  // Video cleanup states
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupStatus, setCleanupStatus] = useState(null);
  const [deletedVideos, setDeletedVideos] = useState([]);
  const [showDeletedVideos, setShowDeletedVideos] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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
      setCategories(categoriesRes.data.filter(c => c.name !== 'All'));
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Video cleanup functions
  const checkVideoStatus = async () => {
    setCleanupLoading(true);
    try {
      const response = await videoCleanupAPI.checkStatus();
      setCleanupStatus(response.data);
      toast.success(`Checked ${response.data.total} videos: ${response.data.unplayable} unplayable found`);
    } catch (error) {
      toast.error('Failed to check video status');
    } finally {
      setCleanupLoading(false);
    }
  };

  const runCleanup = async () => {
    if (!window.confirm('This will permanently delete all unplayable videos from the database. Continue?')) {
      return;
    }
    
    setCleanupLoading(true);
    try {
      const response = await videoCleanupAPI.runCleanup();
      const { total_checked, deleted_count, deleted_videos } = response.data;
      toast.success(`Cleaned up ${deleted_count} unplayable videos out of ${total_checked} checked`);
      setCleanupStatus(null);
      // Reload data to reflect changes
      loadData();
    } catch (error) {
      toast.error('Failed to run cleanup');
    } finally {
      setCleanupLoading(false);
    }
  };

  const loadDeletedVideos = async () => {
    try {
      const response = await videoCleanupAPI.getDeletedVideos();
      setDeletedVideos(response.data);
      setShowDeletedVideos(true);
    } catch (error) {
      toast.error('Failed to load deleted videos');
    }
  };

  const clearDeletedLog = async () => {
    try {
      await videoCleanupAPI.clearDeletedLog();
      setDeletedVideos([]);
      toast.success('Deleted videos log cleared');
    } catch (error) {
      toast.error('Failed to clear log');
    }
  };

  const updateVideoDurations = async () => {
    if (!window.confirm('This will fetch actual video durations from YouTube. Videos are processed in batches of 50. You may need to click multiple times to update all videos. Continue?')) {
      return;
    }
    
    setCleanupLoading(true);
    toast.info('Fetching video durations from YouTube...');
    try {
      const response = await videoCleanupAPI.updateDurations();
      const { updated, failed, remaining } = response.data;
      if (remaining > 0) {
        toast.success(`Updated ${updated} videos. ${remaining} remaining. Click again to continue.`);
      } else {
        toast.success(`Updated ${updated} video durations. All done!`);
      }
      // Reload data to reflect changes
      loadData();
    } catch (error) {
      toast.error('Failed to update durations');
    } finally {
      setCleanupLoading(false);
    }
  };

  const regenerateSchedules = async () => {
    if (!window.confirm('This will regenerate schedules for all channels using current video durations. Continue?')) {
      return;
    }
    
    setCleanupLoading(true);
    try {
      const response = await videoCleanupAPI.regenerateSchedules();
      toast.success(`Regenerated schedules for ${response.data.regenerated} channels`);
    } catch (error) {
      toast.error('Failed to regenerate schedules');
    } finally {
      setCleanupLoading(false);
    }
  };

  const toggleChannelExpanded = (channelId) => {
    setExpandedChannels(prev => ({
      ...prev,
      [channelId]: !prev[channelId]
    }));
  };

  const startEditingChannel = (channel) => {
    setEditingChannel({
      id: channel.id,
      name: channel.name,
      description: channel.description || '',
      category: channel.category,
      thumbnail: channel.thumbnail || '',
      is_public: channel.is_public,
      is_24_7: channel.is_24_7,
      random_play: channel.random_play || false
    });
  };

  const cancelEditingChannel = () => {
    setEditingChannel(null);
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only JPEG, PNG, WebP, and GIF images are allowed');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large. Maximum size is 10MB');
      return;
    }

    setUploadingImage(true);
    try {
      const response = await uploadAPI.uploadImage(file);
      const imageUrl = `${process.env.REACT_APP_BACKEND_URL}${response.data.url}`;
      
      // Update the editing channel with the new thumbnail
      setEditingChannel(prev => ({ ...prev, thumbnail: imageUrl }));
      toast.success('Image uploaded successfully');
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(error.response?.data?.detail || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
    }
  };

  const saveChannelChanges = async () => {
    if (!editingChannel) return;
    
    setSavingChannel(editingChannel.id);
    try {
      await channelsAPI.update(editingChannel.id, {
        name: editingChannel.name,
        description: editingChannel.description,
        category: editingChannel.category,
        thumbnail: editingChannel.thumbnail,
        is_public: editingChannel.is_public,
        is_24_7: editingChannel.is_24_7,
        random_play: editingChannel.random_play
      });
      
      setChannels(prev => prev.map(ch => 
        ch.id === editingChannel.id 
          ? { ...ch, ...editingChannel }
          : ch
      ));
      
      toast.success('Channel updated successfully');
      setEditingChannel(null);
    } catch (error) {
      toast.error('Failed to update channel');
    } finally {
      setSavingChannel(null);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const parseDuration = (str) => {
    const durationStr = str.trim();
    if (durationStr.includes(':')) {
      const parts = durationStr.split(':').map(Number);
      if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
      } else if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
    }
    return parseInt(durationStr, 10) || 300;
  };

  const handleUpdateVideoDuration = async (channelId, videoId, newDuration) => {
    const durationSeconds = parseDuration(newDuration);
    
    try {
      await channelsAPI.updateVideo(channelId, videoId, { duration: durationSeconds });
      
      // Update local state
      setChannels(prev => prev.map(ch => {
        if (ch.id === channelId) {
          return {
            ...ch,
            videos: ch.videos.map(v => 
              v.id === videoId ? { ...v, duration: durationSeconds } : v
            )
          };
        }
        return ch;
      }));
      
      toast.success('Duration updated');
    } catch (error) {
      toast.error('Failed to update duration');
    } finally {
      setEditingVideoDuration({ channelId: null, videoId: null, value: '' });
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

  const handleDeleteUploadedVideo = async () => {
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

  const handleRemoveVideoFromChannel = async () => {
    if (!deleteChannelVideoInfo) return;
    
    const { channelId, videoId } = deleteChannelVideoInfo;
    
    try {
      await channelsAPI.removeVideo(channelId, videoId);
      setChannels(prev => prev.map(ch => 
        ch.id === channelId 
          ? { ...ch, videos: ch.videos.filter(v => v.id !== videoId) }
          : ch
      ));
      toast.success('Video removed from channel');
    } catch (error) {
      toast.error('Failed to remove video');
    } finally {
      setDeleteChannelVideoInfo(null);
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

  const copyChannelEmbed = async (channelId) => {
    const code = `<iframe src="${window.location.origin}/embed/${channelId}" width="640" height="360" frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Channel embed code copied!');
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
            onClick={() => navigate('/schedule')}
            variant="outline"
            className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10"
            data-testid="schedule-btn"
          >
            <Calendar size={18} className="mr-2" />
            TV Guide
          </Button>
          <Button
            onClick={() => navigate('/analytics')}
            variant="outline"
            className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
            data-testid="analytics-btn"
          >
            <BarChart3 size={18} className="mr-2" />
            Analytics
          </Button>
          <Button
            onClick={() => navigate('/bulk-thumbnails')}
            variant="outline"
            className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
            data-testid="bulk-thumbnails-btn"
          >
            <ImageIcon size={18} className="mr-2" />
            Thumbnails
          </Button>
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
        <TabsList className="bg-surface border border-white/10 mb-6">
          <TabsTrigger value="channels" className="flex items-center gap-2" data-testid="tab-channels">
            <Tv size={16} />
            Channels & Videos
          </TabsTrigger>
          <TabsTrigger value="uploads" className="flex items-center gap-2" data-testid="tab-videos">
            <Upload size={16} />
            Uploaded Videos
          </TabsTrigger>
          <TabsTrigger value="embed" className="flex items-center gap-2" data-testid="tab-embed">
            <Code size={16} />
            Embed
          </TabsTrigger>
        </TabsList>

        {/* Channels & Videos Tab */}
        <TabsContent value="channels">
          {loading ? (
            <div className="space-y-4">
              {Array(3).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full bg-white/10 rounded-lg" />
              ))}
            </div>
          ) : channels.length > 0 ? (
            <div className="space-y-4">
              {channels.map((channel) => {
                const isExpanded = expandedChannels[channel.id];
                const isEditing = editingChannel?.id === channel.id;
                const isSaving = savingChannel === channel.id;
                
                return (
                  <div
                    key={channel.id}
                    className="glass rounded-lg overflow-hidden"
                    data-testid={`channel-item-${channel.id}`}
                  >
                    {/* Channel Header */}
                    <div className="p-4 flex items-center gap-4">
                      <button
                        onClick={() => toggleChannelExpanded(channel.id)}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                        data-testid={`expand-channel-${channel.id}`}
                      >
                        {isExpanded ? (
                          <ChevronDown size={20} className="text-gray-400" />
                        ) : (
                          <ChevronRight size={20} className="text-gray-400" />
                        )}
                      </button>
                      
                      <div className="w-24 h-16 bg-black rounded-lg overflow-hidden flex-shrink-0">
                        <img
                          src={channel.thumbnail || channel.videos?.[0]?.thumbnail || 'https://images.unsplash.com/photo-1576307302704-b6142d572612?w=400'}
                          alt={channel.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <Input
                            value={editingChannel.name}
                            onChange={(e) => setEditingChannel({...editingChannel, name: e.target.value})}
                            className="bg-black/50 border-white/20 h-8 text-lg font-semibold"
                            data-testid="edit-channel-name"
                          />
                        ) : (
                          <h3 className="font-semibold text-lg truncate">{channel.name}</h3>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                          <span className="flex items-center gap-1">
                            <Film size={14} /> {channel.videos?.length || 0} videos
                          </span>
                          <span>{channel.category}</span>
                          {channel.is_24_7 && (
                            <span className="text-red-400 text-xs font-bold">24/7</span>
                          )}
                          {channel.random_play && (
                            <span className="text-purple-400 text-xs font-bold">SHUFFLE</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={cancelEditingChannel}
                              className="text-gray-400 hover:text-white"
                            >
                              <X size={16} />
                            </Button>
                            <Button
                              size="sm"
                              onClick={saveChannelChanges}
                              disabled={isSaving}
                              className="bg-green-600 hover:bg-green-700"
                              data-testid="save-channel-btn"
                            >
                              <Save size={16} className="mr-1" />
                              {isSaving ? 'Saving...' : 'Save'}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => navigate(`/watch/${channel.id}`)}
                              className="text-gray-400 hover:text-white"
                              title="Watch"
                            >
                              <Eye size={16} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyChannelEmbed(channel.id)}
                              className="text-gray-400 hover:text-primary"
                              title="Copy Embed"
                            >
                              <Code size={16} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startEditingChannel(channel)}
                              className="text-gray-400 hover:text-primary"
                              title="Edit"
                              data-testid={`edit-channel-${channel.id}`}
                            >
                              <Edit size={16} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => navigate(`/edit/${channel.id}`)}
                              className="text-gray-400 hover:text-blue-400"
                              title="Full Editor"
                            >
                              <ExternalLink size={16} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteChannelId(channel.id)}
                              className="text-gray-400 hover:text-red-500"
                              title="Delete"
                              data-testid={`delete-channel-${channel.id}`}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="border-t border-white/10 p-4 bg-black/20">
                        {/* Edit Form */}
                        {isEditing && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 bg-black/30 rounded-lg">
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">Description</label>
                              <Textarea
                                value={editingChannel.description}
                                onChange={(e) => setEditingChannel({...editingChannel, description: e.target.value})}
                                className="bg-black/50 border-white/20 h-20 resize-none"
                                placeholder="Channel description..."
                              />
                            </div>
                            <div className="space-y-3">
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">Category</label>
                                <Select
                                  value={editingChannel.category}
                                  onValueChange={(value) => setEditingChannel({...editingChannel, category: value})}
                                >
                                  <SelectTrigger className="bg-black/50 border-white/20">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-surface border-white/10">
                                    {categories.map((cat) => (
                                      <SelectItem key={cat.name} value={cat.name}>
                                        {cat.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">Channel Thumbnail</label>
                                <div className="flex gap-2">
                                  <Input
                                    value={editingChannel.thumbnail}
                                    onChange={(e) => setEditingChannel({...editingChannel, thumbnail: e.target.value})}
                                    className="bg-black/50 border-white/20 flex-1"
                                    placeholder="https://... or upload"
                                  />
                                  <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    onChange={handleImageUpload}
                                    className="hidden"
                                    id="thumbnail-upload"
                                    data-testid="thumbnail-upload-input"
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => imageInputRef.current?.click()}
                                    disabled={uploadingImage}
                                    className="border-white/20 px-3"
                                    data-testid="upload-thumbnail-btn"
                                  >
                                    {uploadingImage ? (
                                      <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                      <Upload size={16} />
                                    )}
                                  </Button>
                                </div>
                                {editingChannel.thumbnail && (
                                  <div className="mt-2 relative w-24 h-16 rounded overflow-hidden group">
                                    <img
                                      src={editingChannel.thumbnail}
                                      alt="Thumbnail preview"
                                      className="w-full h-full object-cover"
                                      onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setEditingChannel({...editingChannel, thumbnail: ''})}
                                      className="absolute top-1 right-1 p-1 bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-6">
                                <label className="flex items-center gap-2 text-sm">
                                  <Switch
                                    checked={editingChannel.is_public}
                                    onCheckedChange={(checked) => setEditingChannel({...editingChannel, is_public: checked})}
                                  />
                                  Public
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                  <Switch
                                    checked={editingChannel.is_24_7}
                                    onCheckedChange={(checked) => setEditingChannel({...editingChannel, is_24_7: checked})}
                                  />
                                  24/7
                                </label>
                                <label className="flex items-center gap-2 text-sm" data-testid="random-play-toggle">
                                  <Switch
                                    checked={editingChannel.random_play}
                                    onCheckedChange={(checked) => setEditingChannel({...editingChannel, random_play: checked})}
                                  />
                                  <span className="text-purple-400">Random Play</span>
                                </label>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Videos List */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-medium text-gray-400">
                              Videos ({channel.videos?.length || 0})
                            </h4>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/edit/${channel.id}`)}
                              className="border-white/20 text-xs"
                            >
                              <Plus size={14} className="mr-1" />
                              Add Video
                            </Button>
                          </div>
                          
                          {channel.videos && channel.videos.length > 0 ? (
                            <div className="space-y-2">
                              {channel.videos.map((video, index) => (
                                <div
                                  key={video.id}
                                  className="flex items-center gap-3 p-2 bg-black/30 rounded-lg group hover:bg-black/40 transition-colors"
                                  data-testid={`video-item-${video.id}`}
                                >
                                  <span className="w-6 text-center text-gray-500 text-sm font-mono">
                                    {index + 1}
                                  </span>
                                  <div className="w-20 h-12 bg-black rounded overflow-hidden flex-shrink-0">
                                    {video.youtube_id ? (
                                      <img
                                        src={video.thumbnail || `https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`}
                                        alt={video.title}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <FileVideo size={20} className="text-gray-500" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{video.title}</p>
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                      {video.youtube_id ? (
                                        <span className="flex items-center gap-1 text-red-400">
                                          <Youtube size={10} /> YouTube
                                        </span>
                                      ) : (
                                        <span className="flex items-center gap-1 text-primary">
                                          <Upload size={10} /> Uploaded
                                        </span>
                                      )}
                                      <span className="flex items-center gap-1">
                                        <Clock size={10} />
                                        {editingVideoDuration.channelId === channel.id && editingVideoDuration.videoId === video.id ? (
                                          <Input
                                            value={editingVideoDuration.value}
                                            onChange={(e) => setEditingVideoDuration(prev => ({ ...prev, value: e.target.value }))}
                                            onBlur={() => {
                                              if (editingVideoDuration.value.trim()) {
                                                handleUpdateVideoDuration(channel.id, video.id, editingVideoDuration.value);
                                              } else {
                                                setEditingVideoDuration({ channelId: null, videoId: null, value: '' });
                                              }
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                handleUpdateVideoDuration(channel.id, video.id, editingVideoDuration.value);
                                              } else if (e.key === 'Escape') {
                                                setEditingVideoDuration({ channelId: null, videoId: null, value: '' });
                                              }
                                            }}
                                            className="w-16 h-5 text-xs bg-black/50 border-white/20 px-1"
                                            placeholder="3:45"
                                            autoFocus
                                          />
                                        ) : (
                                          <button
                                            onClick={() => setEditingVideoDuration({
                                              channelId: channel.id,
                                              videoId: video.id,
                                              value: formatDuration(video.duration || 300)
                                            })}
                                            className="hover:text-primary transition-colors"
                                            title="Click to edit duration"
                                          >
                                            {formatDuration(video.duration || 300)}
                                          </button>
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {video.youtube_id && (
                                      <a
                                        href={`https://youtube.com/watch?v=${video.youtube_id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1.5 text-gray-400 hover:text-white rounded transition-colors"
                                      >
                                        <ExternalLink size={14} />
                                      </a>
                                    )}
                                    <button
                                      onClick={() => setDeleteChannelVideoInfo({ channelId: channel.id, videoId: video.id })}
                                      className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
                                      data-testid={`remove-video-${video.id}`}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-6 text-gray-500 text-sm">
                              <Film size={24} className="mx-auto mb-2 opacity-50" />
                              <p>No videos in this channel</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
        <TabsContent value="uploads">
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

          {/* Video Cleanup Section */}
          <div className="mt-6 glass rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <AlertTriangle size={20} className="text-yellow-500" />
              Video Cleanup
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Check and remove videos that are no longer playable (age-restricted, deleted, or unavailable).
              Videos are also automatically deleted when they fail to play.
            </p>
            
            <div className="flex flex-wrap gap-3 mb-4">
              <Button
                onClick={checkVideoStatus}
                disabled={cleanupLoading}
                variant="outline"
                className="border-white/20"
                data-testid="check-video-status-btn"
              >
                {cleanupLoading ? (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                ) : (
                  <Eye size={16} className="mr-2" />
                )}
                Check Video Status
              </Button>
              
              <Button
                onClick={runCleanup}
                disabled={cleanupLoading}
                className="bg-yellow-600 hover:bg-yellow-700"
                data-testid="run-cleanup-btn"
              >
                {cleanupLoading ? (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                ) : (
                  <RefreshCw size={16} className="mr-2" />
                )}
                Run Cleanup
              </Button>
              
              <Button
                onClick={updateVideoDurations}
                disabled={cleanupLoading}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="update-durations-btn"
              >
                {cleanupLoading ? (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                ) : (
                  <Clock size={16} className="mr-2" />
                )}
                Fetch Durations
              </Button>
              
              <Button
                onClick={regenerateSchedules}
                disabled={cleanupLoading}
                className="bg-purple-600 hover:bg-purple-700"
                data-testid="regenerate-schedules-btn"
              >
                {cleanupLoading ? (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                ) : (
                  <Calendar size={16} className="mr-2" />
                )}
                Regenerate Schedules
              </Button>
              
              <Button
                onClick={loadDeletedVideos}
                variant="outline"
                className="border-white/20"
                data-testid="view-deleted-btn"
              >
                <Trash2 size={16} className="mr-2" />
                View Deleted Log
              </Button>
            </div>
            
            {/* Cleanup Status Results */}
            {cleanupStatus && (
              <div className="bg-black/30 rounded-lg p-4 mb-4">
                <h4 className="font-medium mb-2">Check Results</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Total:</span>
                    <span className="ml-2 font-medium">{cleanupStatus.total}</span>
                  </div>
                  <div>
                    <span className="text-green-400">Playable:</span>
                    <span className="ml-2 font-medium">{cleanupStatus.playable}</span>
                  </div>
                  <div>
                    <span className="text-red-400">Unplayable:</span>
                    <span className="ml-2 font-medium">{cleanupStatus.unplayable}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Unknown:</span>
                    <span className="ml-2 font-medium">{cleanupStatus.unknown}</span>
                  </div>
                </div>
                
                {cleanupStatus.unplayable_videos?.length > 0 && (
                  <div className="mt-4">
                    <h5 className="text-sm font-medium mb-2 text-red-400">Unplayable Videos:</h5>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {cleanupStatus.unplayable_videos.map((video, idx) => (
                        <div key={idx} className="text-xs text-gray-400 flex items-center gap-2">
                          <span className="text-white">{video.title}</span>
                          <span className="text-gray-500">({video.channel})</span>
                          <span className="text-red-400">{video.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Deleted Videos Log */}
            {showDeletedVideos && (
              <div className="bg-black/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Auto-Deleted Videos Log</h4>
                  <div className="flex gap-2">
                    <Button
                      onClick={clearDeletedLog}
                      variant="outline"
                      size="sm"
                      className="border-white/20 text-xs"
                    >
                      Clear Log
                    </Button>
                    <Button
                      onClick={() => setShowDeletedVideos(false)}
                      variant="ghost"
                      size="sm"
                    >
                      <X size={14} />
                    </Button>
                  </div>
                </div>
                
                {deletedVideos.length > 0 ? (
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {deletedVideos.map((video, idx) => (
                      <div key={idx} className="text-xs bg-black/20 p-2 rounded flex items-center justify-between">
                        <div>
                          <span className="text-white">{video.title}</span>
                          <span className="text-gray-500 ml-2">({video.reason})</span>
                        </div>
                        <span className="text-gray-500">
                          {new Date(video.deleted_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No videos have been auto-deleted yet.</p>
                )}
              </div>
            )}
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

      {/* Delete Uploaded Video Dialog */}
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
              onClick={handleDeleteUploadedVideo}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-delete-video-btn"
            >
              Delete Video
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Video from Channel Dialog */}
      <AlertDialog open={!!deleteChannelVideoInfo} onOpenChange={() => setDeleteChannelVideoInfo(null)}>
        <AlertDialogContent className="bg-surface border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Video from Channel</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to remove this video from the channel?
              The video will be removed from the playlist but not deleted from the server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/20">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveVideoFromChannel}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-remove-video-btn"
            >
              Remove Video
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;
