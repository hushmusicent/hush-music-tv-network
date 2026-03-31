import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Progress } from '../components/ui/progress';
import { toast } from 'sonner';
import { 
  ArrowLeft, Upload, Trash2, Tv, Video, Clock, Film,
  Loader2, Plus, Play, AlertCircle
} from 'lucide-react';
import api from '../lib/api';

const Commercials = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  
  const [commercials, setCommercials] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadChannelId, setUploadChannelId] = useState('');

  useEffect(() => {
    if (!user?.is_admin) {
      navigate('/');
      return;
    }
    fetchData();
  }, [user, navigate]);

  const fetchData = async () => {
    try {
      const [commercialsRes, channelsRes] = await Promise.all([
        api.get('/commercials'),
        api.get('/channels')
      ]);
      setCommercials(commercialsRes.data);
      setChannels(channelsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load commercials');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.mp4')) {
      toast.error('Only MP4 files are allowed');
      return;
    }

    if (!uploadChannelId) {
      toast.error('Please select a channel first');
      return;
    }

    setUploading(true);
    setUploadProgress(10);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('channel_id', uploadChannelId);

      setUploadProgress(30);

      const response = await api.post('/commercials/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000, // 10 minutes for conversion
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded / progressEvent.total) * 60) + 30;
          setUploadProgress(Math.min(percent, 90));
        }
      });

      setUploadProgress(100);
      setCommercials(prev => [response.data, ...prev]);
      toast.success('Commercial uploaded successfully!');
      
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(error.response?.data?.detail || 'Failed to upload commercial');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (commercialId) => {
    if (!confirm('Are you sure you want to delete this commercial?')) return;

    try {
      await api.delete(`/commercials/${commercialId}`);
      setCommercials(prev => prev.filter(c => c.id !== commercialId));
      toast.success('Commercial deleted');
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error('Failed to delete commercial');
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const getChannelName = (channelId) => {
    const channel = channels.find(c => c.id === channelId);
    return channel?.name || 'Unknown Channel';
  };

  const filteredCommercials = selectedChannel === 'all'
    ? commercials
    : commercials.filter(c => c.channel_id === selectedChannel);

  // Group commercials by channel
  const commercialsByChannel = {};
  channels.forEach(ch => {
    commercialsByChannel[ch.id] = commercials.filter(c => c.channel_id === ch.id);
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 md:px-12 lg:px-16 py-4 md:py-8" data-testid="commercials-page">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 md:mb-8">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard')}
            className="shrink-0"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="font-heading text-2xl md:text-4xl tracking-tight flex items-center gap-2 md:gap-3">
              <Film size={28} className="text-primary md:hidden" />
              <Film size={36} className="text-primary hidden md:block" />
              Commercial Manager
            </h1>
            <p className="text-gray-400 mt-1 text-sm md:text-base">
              Upload and manage commercials for your channels • Plays every 15 minutes
            </p>
          </div>
        </div>
      </div>

      {/* Upload Section */}
      <Card className="bg-[#12121a] border-white/10 mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload size={20} className="text-primary" />
            Upload Commercial
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="text-sm text-gray-400 mb-2 block">Select Channel</label>
              <Select value={uploadChannelId} onValueChange={setUploadChannelId}>
                <SelectTrigger className="bg-black/50 border-white/10">
                  <SelectValue placeholder="Choose a channel for this commercial" />
                </SelectTrigger>
                <SelectContent>
                  {channels.map(channel => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,.mp4"
                onChange={handleFileSelect}
                className="hidden"
                disabled={uploading || !uploadChannelId}
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !uploadChannelId}
                className="bg-primary hover:bg-primary-hover w-full md:w-auto"
              >
                {uploading ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Plus size={16} className="mr-2" />
                    Upload MP4
                  </>
                )}
              </Button>
            </div>
          </div>
          
          {uploading && (
            <div className="mt-4">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-gray-400 mt-1">
                {uploadProgress < 90 ? 'Uploading...' : 'Processing video...'}
              </p>
            </div>
          )}

          <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-yellow-500 mt-0.5 shrink-0" />
              <div className="text-sm text-yellow-200">
                <p className="font-medium">Commercial Break Info:</p>
                <p className="text-yellow-200/70">
                  3 random commercials will play every 15 minutes on each channel.
                  Regular video pauses during commercials and resumes after.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filter */}
      <div className="flex items-center gap-4 mb-6">
        <label className="text-sm text-gray-400">Filter by channel:</label>
        <Select value={selectedChannel} onValueChange={setSelectedChannel}>
          <SelectTrigger className="w-[200px] bg-black/50 border-white/10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            {channels.map(channel => (
              <SelectItem key={channel.id} value={channel.id}>
                {channel.name} ({commercialsByChannel[channel.id]?.length || 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <span className="text-sm text-gray-500 ml-auto">
          {filteredCommercials.length} commercial{filteredCommercials.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Commercials Grid */}
      {filteredCommercials.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Film size={48} className="mx-auto mb-4 opacity-50" />
          <p>No commercials uploaded yet</p>
          <p className="text-sm mt-1">Upload commercials above to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCommercials.map(commercial => (
            <Card key={commercial.id} className="bg-[#12121a] border-white/10 overflow-hidden">
              <div className="aspect-video bg-black relative group">
                <video
                  src={commercial.url}
                  className="w-full h-full object-cover"
                  preload="metadata"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="bg-white/20 hover:bg-white/30"
                    onClick={() => window.open(commercial.url, '_blank')}
                  >
                    <Play size={24} />
                  </Button>
                </div>
                <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded text-xs">
                  {formatDuration(commercial.duration)}
                </div>
              </div>
              
              <CardContent className="p-4">
                <h3 className="font-medium text-sm truncate mb-2" title={commercial.original_name}>
                  {commercial.original_name}
                </h3>
                
                <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                  <Tv size={12} />
                  <span className="truncate">{getChannelName(commercial.channel_id)}</span>
                </div>
                
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{formatFileSize(commercial.size)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 px-2"
                    onClick={() => handleDelete(commercial.id)}
                  >
                    <Trash2 size={14} className="mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Channel Summary */}
      <div className="mt-12">
        <h2 className="text-xl font-bold mb-4">Commercials by Channel</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map(channel => {
            const channelCommercials = commercialsByChannel[channel.id] || [];
            return (
              <Card key={channel.id} className="bg-[#12121a] border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tv size={16} className="text-primary" />
                      <span className="font-medium truncate">{channel.name}</span>
                    </div>
                    <span className={`text-sm ${channelCommercials.length >= 3 ? 'text-green-400' : 'text-yellow-400'}`}>
                      {channelCommercials.length} commercial{channelCommercials.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {channelCommercials.length < 3 && (
                    <p className="text-xs text-yellow-400/70 mt-2">
                      Add {3 - channelCommercials.length} more for full commercial breaks
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Commercials;
