import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Progress } from '../components/ui/progress';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { 
  ArrowLeft, Upload, Trash2, Tv, Video, Clock, Film,
  Loader2, Plus, Play, AlertCircle, Globe, Check, Edit, X, Save
} from 'lucide-react';
import api, { uploadAPI } from '../lib/api';

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
  const [isGlobal, setIsGlobal] = useState(true); // Default to all channels
  const [selectedChannelIds, setSelectedChannelIds] = useState([]); // For specific channel selection
  
  // Edit modal state
  const [editingCommercial, setEditingCommercial] = useState(null);
  const [editIsGlobal, setEditIsGlobal] = useState(true);
  const [editChannelIds, setEditChannelIds] = useState([]);
  const [saving, setSaving] = useState(false);

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

    // Validate channel selection
    if (!isGlobal && selectedChannelIds.length === 0) {
      toast.error('Please select at least one channel or choose "All Channels"');
      return;
    }

    setUploading(true);
    setUploadProgress(10);

    try {
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks (same as video uploads)
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const channelIdsStr = isGlobal ? '' : selectedChannelIds.join(',');
      
      // Use the existing video upload API which is more reliable
      // Upload the commercial as a video first, then register it as a commercial
      setUploadProgress(10);
      
      const uploadResponse = await uploadAPI.uploadVideo(file, (percent) => {
        setUploadProgress(Math.round(percent * 0.8) + 10); // 10-90%
      });
      
      setUploadProgress(92);
      
      // Now register this uploaded video as a commercial
      const registerResp = await api.post('/commercials/register', {
        video_id: uploadResponse.data.id,
        video_url: uploadResponse.data.url,
        original_name: file.name,
        duration: uploadResponse.data.duration || 30,
        size: file.size,
        channel_ids: isGlobal ? [] : selectedChannelIds,
        is_global: isGlobal
      });
      
      setUploadProgress(100);
      setCommercials(prev => [registerResp.data, ...prev]);
      toast.success('Commercial uploaded successfully!');
      
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(error.response?.data?.detail || error.message || 'Failed to upload commercial');
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

  const openEditModal = (commercial) => {
    setEditingCommercial(commercial);
    setEditIsGlobal(commercial.is_global || !commercial.channel_ids?.length);
    setEditChannelIds(commercial.channel_ids || []);
  };

  const closeEditModal = () => {
    setEditingCommercial(null);
    setEditIsGlobal(true);
    setEditChannelIds([]);
  };

  const toggleEditChannel = (channelId) => {
    setEditChannelIds(prev => 
      prev.includes(channelId) 
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    );
  };

  const saveChannelAssignment = async () => {
    if (!editingCommercial) return;
    
    setSaving(true);
    try {
      const response = await api.put(`/commercials/${editingCommercial.id}/assign`, {
        channel_ids: editIsGlobal ? [] : editChannelIds,
        is_global: editIsGlobal
      });
      
      // Update the commercial in the list
      setCommercials(prev => prev.map(c => 
        c.id === editingCommercial.id ? response.data : c
      ));
      
      toast.success('Channel assignment updated!');
      closeEditModal();
    } catch (error) {
      console.error('Failed to update assignment:', error);
      toast.error('Failed to update channel assignment');
    } finally {
      setSaving(false);
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

  const getChannelNames = (commercial) => {
    if (commercial.is_global) return 'All Channels';
    if (!commercial.channel_ids || commercial.channel_ids.length === 0) return 'All Channels';
    return commercial.channel_ids.map(id => getChannelName(id)).join(', ');
  };

  const toggleChannelSelection = (channelId) => {
    setSelectedChannelIds(prev => 
      prev.includes(channelId) 
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    );
  };

  const filteredCommercials = selectedChannel === 'all'
    ? commercials
    : selectedChannel === 'global'
    ? commercials.filter(c => c.is_global)
    : commercials.filter(c => c.channel_ids?.includes(selectedChannel));

  // Group commercials by channel (including global)
  const commercialsByChannel = {};
  channels.forEach(ch => {
    commercialsByChannel[ch.id] = commercials.filter(c => 
      c.is_global || c.channel_ids?.includes(ch.id)
    );
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
              Upload and manage commercials for your channels • Plays every 10 minutes
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
          {/* Channel Selection */}
          <div className="mb-4">
            <label className="text-sm text-gray-400 mb-3 block">Assign to Channels</label>
            
            {/* All Channels Toggle */}
            <div 
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer mb-3 transition-colors ${
                isGlobal 
                  ? 'bg-primary/20 border-primary' 
                  : 'bg-black/30 border-white/10 hover:border-white/20'
              }`}
              onClick={() => {
                setIsGlobal(true);
                setSelectedChannelIds([]);
              }}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                isGlobal ? 'border-primary bg-primary' : 'border-white/30'
              }`}>
                {isGlobal && <Check size={12} className="text-white" />}
              </div>
              <Globe size={18} className="text-primary" />
              <span className="font-medium">All Channels</span>
              <span className="text-xs text-gray-500 ml-auto">Commercial plays on every channel</span>
            </div>
            
            {/* Specific Channels Toggle */}
            <div 
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                !isGlobal 
                  ? 'bg-primary/20 border-primary' 
                  : 'bg-black/30 border-white/10 hover:border-white/20'
              }`}
              onClick={() => setIsGlobal(false)}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                !isGlobal ? 'border-primary bg-primary' : 'border-white/30'
              }`}>
                {!isGlobal && <Check size={12} className="text-white" />}
              </div>
              <Tv size={18} className="text-blue-400" />
              <span className="font-medium">Selected Channels</span>
              <span className="text-xs text-gray-500 ml-auto">
                {selectedChannelIds.length > 0 ? `${selectedChannelIds.length} selected` : 'Choose specific channels'}
              </span>
            </div>
            
            {/* Channel Multi-Select Grid */}
            {!isGlobal && (
              <div className="mt-3 p-3 bg-black/20 rounded-lg border border-white/5 max-h-48 overflow-y-auto">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {channels.map(channel => (
                    <div
                      key={channel.id}
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                        selectedChannelIds.includes(channel.id)
                          ? 'bg-primary/30 border border-primary/50'
                          : 'bg-black/30 border border-transparent hover:border-white/20'
                      }`}
                      onClick={() => toggleChannelSelection(channel.id)}
                    >
                      <Checkbox 
                        checked={selectedChannelIds.includes(channel.id)}
                        className="pointer-events-none"
                      />
                      <span className="text-sm truncate">{channel.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Upload Button */}
          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,.mp4"
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || (!isGlobal && selectedChannelIds.length === 0)}
              className="bg-primary hover:bg-primary-hover"
            >
              {uploading ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Plus size={16} className="mr-2" />
                  Upload MP4 Commercial
                </>
              )}
            </Button>
            
            {!isGlobal && selectedChannelIds.length === 0 && (
              <span className="text-sm text-yellow-400">Select at least one channel</span>
            )}
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
                  3 random commercials will play every 10 minutes on each channel.
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
            <SelectItem value="all">All Commercials</SelectItem>
            <SelectItem value="global">Global (All Channels)</SelectItem>
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
                {commercial.is_global && (
                  <div className="absolute top-2 left-2 bg-primary/80 px-2 py-1 rounded text-xs flex items-center gap-1">
                    <Globe size={10} />
                    All Channels
                  </div>
                )}
              </div>
              
              <CardContent className="p-4">
                <h3 className="font-medium text-sm truncate mb-2" title={commercial.original_name}>
                  {commercial.original_name}
                </h3>
                
                <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                  {commercial.is_global ? (
                    <>
                      <Globe size={12} className="text-primary" />
                      <span>All Channels</span>
                    </>
                  ) : (
                    <>
                      <Tv size={12} />
                      <span className="truncate" title={getChannelNames(commercial)}>
                        {commercial.channel_ids?.length || 0} channel{(commercial.channel_ids?.length || 0) !== 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                </div>
                
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{formatFileSize(commercial.size)}</span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-7 px-2"
                      onClick={() => openEditModal(commercial)}
                    >
                      <Edit size={14} className="mr-1" />
                      Edit
                    </Button>
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

      {/* Edit Channel Assignment Modal */}
      <Dialog open={!!editingCommercial} onOpenChange={(open) => !open && closeEditModal()}>
        <DialogContent className="bg-[#12121a] border-white/10 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit size={20} className="text-primary" />
              Edit Channel Assignment
            </DialogTitle>
          </DialogHeader>
          
          {editingCommercial && (
            <div className="py-4">
              {/* Commercial Info */}
              <div className="flex items-center gap-4 mb-6 p-3 bg-black/30 rounded-lg">
                <Film size={24} className="text-primary" />
                <div>
                  <p className="font-medium">{editingCommercial.original_name}</p>
                  <p className="text-sm text-gray-400">
                    {formatDuration(editingCommercial.duration)} • {formatFileSize(editingCommercial.size)}
                  </p>
                </div>
              </div>
              
              {/* All Channels Option */}
              <div 
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer mb-3 transition-colors ${
                  editIsGlobal 
                    ? 'bg-primary/20 border-primary' 
                    : 'bg-black/30 border-white/10 hover:border-white/20'
                }`}
                onClick={() => {
                  setEditIsGlobal(true);
                  setEditChannelIds([]);
                }}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  editIsGlobal ? 'border-primary bg-primary' : 'border-white/30'
                }`}>
                  {editIsGlobal && <Check size={12} className="text-white" />}
                </div>
                <Globe size={18} className="text-primary" />
                <span className="font-medium">All Channels</span>
              </div>
              
              {/* Selected Channels Option */}
              <div 
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  !editIsGlobal 
                    ? 'bg-primary/20 border-primary' 
                    : 'bg-black/30 border-white/10 hover:border-white/20'
                }`}
                onClick={() => setEditIsGlobal(false)}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  !editIsGlobal ? 'border-primary bg-primary' : 'border-white/30'
                }`}>
                  {!editIsGlobal && <Check size={12} className="text-white" />}
                </div>
                <Tv size={18} className="text-blue-400" />
                <span className="font-medium">Selected Channels</span>
                <span className="text-xs text-gray-500 ml-auto">
                  {editChannelIds.length > 0 ? `${editChannelIds.length} selected` : 'Choose channels'}
                </span>
              </div>
              
              {/* Channel Grid */}
              {!editIsGlobal && (
                <div className="mt-3 p-3 bg-black/20 rounded-lg border border-white/5 max-h-64 overflow-y-auto">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {channels.map(channel => (
                      <div
                        key={channel.id}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                          editChannelIds.includes(channel.id)
                            ? 'bg-primary/30 border border-primary/50'
                            : 'bg-black/30 border border-transparent hover:border-white/20'
                        }`}
                        onClick={() => toggleEditChannel(channel.id)}
                      >
                        <Checkbox 
                          checked={editChannelIds.includes(channel.id)}
                          className="pointer-events-none"
                        />
                        <span className="text-sm truncate">{channel.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeEditModal} disabled={saving}>
              <X size={16} className="mr-2" />
              Cancel
            </Button>
            <Button 
              onClick={saveChannelAssignment} 
              disabled={saving || (!editIsGlobal && editChannelIds.length === 0)}
              className="bg-primary hover:bg-primary-hover"
            >
              {saving ? (
                <Loader2 size={16} className="mr-2 animate-spin" />
              ) : (
                <Save size={16} className="mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Commercials;
