import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { channelsAPI, categoriesAPI, uploadAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { 
  Tv, 
  Plus, 
  Trash2, 
  Youtube,
  ArrowLeft,
  Save,
  Image as ImageIcon,
  Radio,
  Upload,
  Film,
  Clock,
  FileVideo,
  X,
  Check,
  Shuffle,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

const ChannelCreator = () => {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  
  const isEditing = !!channelId;
  const fileInputRef = useRef(null);
  const thumbnailInputRef = useRef(null);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [uploadedVideos, setUploadedVideos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'Entertainment',
    thumbnail: '',
    is_public: true,
    is_24_7: true,
    random_play: false,
  });
  
  const [videos, setVideos] = useState([]);
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [addingVideo, setAddingVideo] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    loadCategories();
    loadUploadedVideos();
    if (isEditing) {
      loadChannel();
    }
  }, [isAuthenticated, authLoading, isEditing, channelId, navigate]);

  const loadCategories = async () => {
    try {
      const response = await categoriesAPI.getAll();
      setCategories(response.data.filter(c => c.name !== 'All'));
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadUploadedVideos = async () => {
    try {
      const response = await uploadAPI.listVideos();
      setUploadedVideos(response.data);
    } catch (error) {
      console.error('Failed to load uploaded videos:', error);
    }
  };

  const loadChannel = async () => {
    setLoading(true);
    try {
      const response = await channelsAPI.getById(channelId);
      const channel = response.data;
      setFormData({
        name: channel.name,
        description: channel.description || '',
        category: channel.category,
        thumbnail: channel.thumbnail || '',
        is_public: channel.is_public,
        is_24_7: channel.is_24_7,
        random_play: channel.random_play || false,
      });
      setVideos(channel.videos || []);
    } catch (error) {
      console.error('Failed to load channel:', error);
      toast.error('Channel not found');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleThumbnailUpload = async (event) => {
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

    setUploadingThumbnail(true);
    try {
      const response = await uploadAPI.uploadImage(file);
      const imageUrl = `${process.env.REACT_APP_BACKEND_URL}${response.data.url}`;
      
      // Update the form data with the new thumbnail
      setFormData(prev => ({ ...prev, thumbnail: imageUrl }));
      toast.success('Thumbnail uploaded successfully');
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(error.response?.data?.detail || 'Failed to upload image');
    } finally {
      setUploadingThumbnail(false);
      if (thumbnailInputRef.current) {
        thumbnailInputRef.current.value = '';
      }
    }
  };

  const extractYouTubeId = (url) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const handleAddYouTubeVideo = async () => {
    const youtubeId = extractYouTubeId(newVideoUrl.trim());
    
    if (!youtubeId) {
      toast.error('Invalid YouTube URL or video ID');
      return;
    }
    
    // Check for duplicates
    if (videos.some(v => v.youtube_id === youtubeId)) {
      toast.error('This video is already in the playlist');
      return;
    }

    setAddingVideo(true);
    
    const newVideo = {
      id: `temp-${Date.now()}`,
      youtube_id: youtubeId,
      title: `Video ${videos.length + 1}`,
      thumbnail: `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`,
      duration: 300,
      order: videos.length,
      type: 'youtube'
    };

    // If editing, add to server
    if (isEditing) {
      try {
        await channelsAPI.addVideo(channelId, {
          youtube_id: youtubeId,
          title: newVideo.title,
          thumbnail: newVideo.thumbnail,
          duration: newVideo.duration,
        });
        toast.success('Video added');
      } catch (error) {
        toast.error('Failed to add video');
        setAddingVideo(false);
        return;
      }
    }

    setVideos((prev) => [...prev, newVideo]);
    setNewVideoUrl('');
    setAddingVideo(false);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type (MP4 only per user requirement)
    if (file.type !== 'video/mp4') {
      toast.error('Only MP4 files are allowed');
      return;
    }

    // Validate file size (max 2GB)
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > maxSize) {
      toast.error('File too large. Maximum size is 2GB');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const response = await uploadAPI.uploadVideo(file, (progress) => {
        setUploadProgress(progress);
      });

      const uploadedVideo = response.data;
      
      // Add to uploaded videos list
      setUploadedVideos(prev => [uploadedVideo, ...prev]);
      
      toast.success('Video uploaded successfully!');
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(error.response?.data?.detail || 'Failed to upload video');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAddUploadedVideo = (uploadedVideo) => {
    // Check for duplicates
    if (videos.some(v => v.uploaded_id === uploadedVideo.id)) {
      toast.error('This video is already in the playlist');
      return;
    }

    const newVideo = {
      id: `uploaded-${uploadedVideo.id}`,
      uploaded_id: uploadedVideo.id,
      youtube_id: null,
      video_url: uploadedVideo.url,
      title: uploadedVideo.original_name.replace(/\.[^/.]+$/, ''),
      thumbnail: uploadedVideo.thumbnail || '/video-placeholder.png',
      duration: uploadedVideo.duration || 300,
      order: videos.length,
      type: 'uploaded'
    };

    setVideos((prev) => [...prev, newVideo]);
    toast.success('Video added to playlist');
  };

  const handleRemoveVideo = async (videoId) => {
    if (isEditing) {
      try {
        await channelsAPI.removeVideo(channelId, videoId);
      } catch (error) {
        toast.error('Failed to remove video');
        return;
      }
    }
    
    setVideos((prev) => prev.filter((v) => v.id !== videoId));
    toast.success('Video removed');
  };

  const handleDeleteUploadedVideo = async (videoId) => {
    try {
      await uploadAPI.deleteVideo(videoId);
      setUploadedVideos(prev => prev.filter(v => v.id !== videoId));
      toast.success('Video deleted');
    } catch (error) {
      toast.error('Failed to delete video');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Channel name is required');
      return;
    }
    
    if (!isEditing && videos.length === 0) {
      toast.error('Add at least one video to your channel');
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await channelsAPI.update(channelId, formData);
        toast.success('Channel updated successfully');
      } else {
        const response = await channelsAPI.create(formData);
        const newChannelId = response.data.id;
        
        // Add videos to the new channel
        for (const video of videos) {
          await channelsAPI.addVideo(newChannelId, {
            youtube_id: video.youtube_id || '',
            title: video.title,
            thumbnail: video.thumbnail,
            duration: video.duration,
            video_url: video.video_url || null,
          });
        }
        
        toast.success('Channel created successfully');
      }
      navigate('/dashboard');
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to save channel';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Radio size={48} className="mx-auto mb-4 text-primary animate-pulse" />
          <p className="text-gray-400">Loading channel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-y-auto px-6 md:px-12 lg:px-16 py-8" data-testid="channel-creator-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            data-testid="back-btn"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="font-heading text-4xl tracking-tight flex items-center gap-3">
              <Tv size={32} className="text-primary" />
              {isEditing ? 'Edit Channel' : 'Create Channel'}
            </h1>
            <p className="text-gray-400 mt-1">
              {isEditing ? 'Update your channel settings' : 'Set up your new TV channel'}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info Card */}
          <div className="glass rounded-lg p-6">
            <h2 className="font-semibold text-lg mb-4">Basic Information</h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Channel Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Awesome Channel"
                  className="mt-2 bg-black/50 border-white/10"
                  data-testid="channel-name-input"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Tell viewers what your channel is about..."
                  rows={3}
                  className="mt-2 bg-black/50 border-white/10 resize-none"
                  data-testid="channel-description-input"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger className="mt-2 bg-black/50 border-white/10" data-testid="category-select">
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
                  <Label htmlFor="thumbnail">Channel Thumbnail</Label>
                  <div className="flex gap-2 mt-2">
                    <div className="relative flex-1">
                      <ImageIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      <Input
                        id="thumbnail"
                        value={formData.thumbnail}
                        onChange={(e) => setFormData({ ...formData, thumbnail: e.target.value })}
                        placeholder="https://... or upload image"
                        className="pl-10 bg-black/50 border-white/10"
                        data-testid="thumbnail-input"
                      />
                    </div>
                    <input
                      ref={thumbnailInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleThumbnailUpload}
                      className="hidden"
                      id="thumbnail-upload"
                      data-testid="thumbnail-upload-input"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => thumbnailInputRef.current?.click()}
                      disabled={uploadingThumbnail}
                      className="border-white/20 px-3"
                      data-testid="upload-thumbnail-btn"
                    >
                      {uploadingThumbnail ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Upload size={18} />
                      )}
                    </Button>
                  </div>
                  {formData.thumbnail && (
                    <div className="mt-2 relative w-32 h-20 rounded-lg overflow-hidden group">
                      <img
                        src={formData.thumbnail}
                        alt="Thumbnail preview"
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, thumbnail: '' })}
                        className="absolute top-1 right-1 p-1 bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Upload JPEG, PNG, WebP, or GIF (max 10MB)
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <div>
                  <Label htmlFor="is_public">Public Channel</Label>
                  <p className="text-sm text-gray-400">Allow anyone to watch</p>
                </div>
                <Switch
                  id="is_public"
                  checked={formData.is_public}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_public: checked })}
                  data-testid="public-switch"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="is_24_7">24/7 Continuous Playback</Label>
                  <p className="text-sm text-gray-400">Loop videos continuously</p>
                </div>
                <Switch
                  id="is_24_7"
                  checked={formData.is_24_7}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_24_7: checked })}
                  data-testid="24-7-switch"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="random_play" className="flex items-center gap-2">
                    <Shuffle size={16} className="text-purple-400" />
                    Random Play
                  </Label>
                  <p className="text-sm text-gray-400">Shuffle video order daily</p>
                </div>
                <Switch
                  id="random_play"
                  checked={formData.random_play}
                  onCheckedChange={(checked) => setFormData({ ...formData, random_play: checked })}
                  data-testid="random-play-switch"
                />
              </div>
            </div>
          </div>

          {/* Videos Card with Tabs */}
          <div className="glass rounded-lg p-6">
            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Film size={20} className="text-primary" />
              Video Playlist
            </h2>

            <Tabs defaultValue="youtube" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="youtube" className="flex items-center gap-2">
                  <Youtube size={16} />
                  YouTube
                </TabsTrigger>
                <TabsTrigger value="upload" className="flex items-center gap-2">
                  <Upload size={16} />
                  Upload
                </TabsTrigger>
              </TabsList>

              {/* YouTube Tab */}
              <TabsContent value="youtube" className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    placeholder="Paste YouTube URL or video ID..."
                    className="flex-1 bg-black/50 border-white/10"
                    data-testid="video-url-input"
                  />
                  <Button
                    type="button"
                    onClick={handleAddYouTubeVideo}
                    disabled={!newVideoUrl.trim() || addingVideo}
                    className="bg-red-600 hover:bg-red-700"
                    data-testid="add-video-btn"
                  >
                    <Plus size={18} className="mr-1" />
                    Add
                  </Button>
                </div>
              </TabsContent>

              {/* Upload Tab */}
              <TabsContent value="upload" className="space-y-4">
                {/* Upload Button */}
                <div className="border-2 border-dashed border-white/20 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="video-upload"
                    disabled={uploading}
                    data-testid="video-upload-input"
                  />
                  <label htmlFor="video-upload" className="cursor-pointer">
                    <Upload size={32} className="mx-auto mb-2 text-gray-400" />
                    <p className="text-sm text-gray-300 mb-1">
                      Click to upload video
                    </p>
                    <p className="text-xs text-gray-500">
                      MP4 only (max 2GB)
                    </p>
                  </label>
                </div>

                {/* Upload Progress */}
                {uploading && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Uploading...</span>
                      <span className="text-primary">{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="h-2" />
                  </div>
                )}

                {/* Uploaded Videos Library */}
                {uploadedVideos.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Your Uploaded Videos</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {uploadedVideos.map((video) => (
                        <div
                          key={video.id}
                          className="flex items-center gap-3 p-2 bg-black/30 rounded-lg group"
                        >
                          <div className="w-16 h-10 bg-black rounded flex items-center justify-center flex-shrink-0">
                            <FileVideo size={20} className="text-gray-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{video.original_name}</p>
                            <p className="text-xs text-gray-500">
                              {formatFileSize(video.size)} • {Math.floor(video.duration / 60)}min
                            </p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleAddUploadedVideo(video)}
                              className="h-8 px-2 text-green-400 hover:text-green-300 hover:bg-green-400/10"
                            >
                              <Plus size={16} />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteUploadedVideo(video.id)}
                              className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Current Playlist */}
            <div className="mt-6 pt-4 border-t border-white/10">
              <h4 className="text-sm font-medium text-gray-400 mb-3">
                Current Playlist ({videos.length} videos)
              </h4>
              
              {videos.length > 0 ? (
                <div className="space-y-2">
                  {videos.map((video, index) => (
                    <div
                      key={video.id}
                      className="flex items-center gap-3 p-3 bg-black/30 rounded-lg group"
                    >
                      <span className="w-6 text-center text-gray-500 font-mono text-sm">
                        {index + 1}
                      </span>
                      <div className="w-20 h-12 bg-black rounded overflow-hidden flex-shrink-0">
                        {video.youtube_id ? (
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.src = `https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`;
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <FileVideo size={20} className="text-gray-500" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Input
                          value={video.title}
                          onChange={(e) => {
                            const newVideos = [...videos];
                            newVideos[index].title = e.target.value;
                            setVideos(newVideos);
                          }}
                          className="bg-transparent border-transparent hover:border-white/10 focus:border-primary h-8 text-sm"
                          placeholder="Video title"
                        />
                        <div className="flex items-center gap-2 mt-1">
                          {video.youtube_id ? (
                            <span className="text-xs text-red-400 flex items-center gap-1">
                              <Youtube size={10} /> YouTube
                            </span>
                          ) : (
                            <span className="text-xs text-primary flex items-center gap-1">
                              <Upload size={10} /> Uploaded
                            </span>
                          )}
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock size={10} /> {Math.floor(video.duration / 60)}min
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveVideo(video.id)}
                        className="p-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        data-testid={`remove-video-${video.id}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <Film size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No videos added yet</p>
                  <p className="text-sm">Add YouTube videos or upload your own</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Preview Card */}
          <div className="glass rounded-lg p-6 sticky top-24">
            <h3 className="font-semibold mb-4">Preview</h3>
            
            <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4">
              {formData.thumbnail || videos[0]?.thumbnail ? (
                <img
                  src={formData.thumbnail || videos[0]?.thumbnail}
                  alt="Channel preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500">
                  <Tv size={48} />
                </div>
              )}
            </div>

            <h4 className="font-medium text-lg truncate">
              {formData.name || 'Channel Name'}
            </h4>
            <p className="text-sm text-gray-400 mt-1">
              {formData.category} • {videos.length} videos
            </p>
            
            <div className="flex items-center gap-2 mt-3 text-xs">
              {formData.is_public ? (
                <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded">Public</span>
              ) : (
                <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded">Private</span>
              )}
              {formData.is_24_7 && (
                <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded">24/7</span>
              )}
              {formData.random_play && (
                <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded flex items-center gap-1">
                  <Shuffle size={10} /> Shuffle
                </span>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-white/10">
              <Button
                type="submit"
                disabled={saving}
                className="w-full bg-primary hover:bg-primary-hover font-bold"
                data-testid="save-channel-btn"
              >
                <Save size={18} className="mr-2" />
                {saving ? 'Saving...' : isEditing ? 'Update Channel' : 'Create Channel'}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ChannelCreator;
