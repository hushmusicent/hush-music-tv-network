import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { channelsAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { 
  ArrowLeft, 
  Upload, 
  Image, 
  Check, 
  X, 
  Loader2,
  Tv,
  Save
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const BulkThumbnails = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState({});
  const [pendingUploads, setPendingUploads] = useState({});
  const fileInputRefs = useRef({});

  useEffect(() => {
    if (!isAuthenticated || !user?.is_admin) {
      navigate('/login');
      return;
    }
    loadChannels();
  }, [isAuthenticated, user, navigate]);

  const loadChannels = async () => {
    try {
      setLoading(true);
      const response = await channelsAPI.getAll();
      setChannels(response.data);
    } catch (error) {
      toast.error('Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (channelId, event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPendingUploads(prev => ({
        ...prev,
        [channelId]: {
          file,
          preview: e.target.result
        }
      }));
    };
    reader.readAsDataURL(file);
  };

  const uploadThumbnail = async (channelId) => {
    const pending = pendingUploads[channelId];
    if (!pending) return;

    setUploading(prev => ({ ...prev, [channelId]: true }));

    try {
      const formData = new FormData();
      formData.append('file', pending.file);

      // Upload the image
      const uploadResponse = await axios.post(
        `${BACKEND_URL}/api/upload/image`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      const imageUrl = uploadResponse.data.url;

      // Update channel thumbnail
      await channelsAPI.update(channelId, { thumbnail: imageUrl });

      // Update local state
      setChannels(prev => prev.map(ch => 
        ch.id === channelId ? { ...ch, thumbnail: imageUrl } : ch
      ));

      // Clear pending
      setPendingUploads(prev => {
        const updated = { ...prev };
        delete updated[channelId];
        return updated;
      });

      toast.success('Thumbnail updated!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload thumbnail');
    } finally {
      setUploading(prev => ({ ...prev, [channelId]: false }));
    }
  };

  const uploadAllPending = async () => {
    const channelIds = Object.keys(pendingUploads);
    if (channelIds.length === 0) {
      toast.info('No thumbnails to upload');
      return;
    }

    toast.info(`Uploading ${channelIds.length} thumbnails...`);

    for (const channelId of channelIds) {
      await uploadThumbnail(channelId);
    }

    toast.success('All thumbnails uploaded!');
  };

  const cancelPending = (channelId) => {
    setPendingUploads(prev => {
      const updated = { ...prev };
      delete updated[channelId];
      return updated;
    });
  };

  const triggerFileInput = (channelId) => {
    fileInputRefs.current[channelId]?.click();
  };

  const getThumbnailSrc = (channel) => {
    // Check for pending upload preview first
    if (pendingUploads[channel.id]?.preview) {
      return pendingUploads[channel.id].preview;
    }
    
    // Then check existing thumbnail
    if (channel.thumbnail) {
      if (channel.thumbnail.startsWith('/api')) {
        return `${BACKEND_URL}${channel.thumbnail}`;
      }
      return channel.thumbnail;
    }
    
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const pendingCount = Object.keys(pendingUploads).length;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0a0a0f]/95 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard')}
              >
                <ArrowLeft size={20} />
              </Button>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <Image className="text-primary" size={24} />
                  Bulk Thumbnail Upload
                </h1>
                <p className="text-sm text-gray-400">
                  Click on any channel to upload a new thumbnail
                </p>
              </div>
            </div>
            
            {pendingCount > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-yellow-400">
                  {pendingCount} pending upload{pendingCount > 1 ? 's' : ''}
                </span>
                <Button
                  onClick={uploadAllPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Save size={16} className="mr-2" />
                  Upload All
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Channel Grid */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {channels.map((channel) => {
            const thumbnailSrc = getThumbnailSrc(channel);
            const isPending = !!pendingUploads[channel.id];
            const isUploading = uploading[channel.id];

            return (
              <div
                key={channel.id}
                className={`relative group rounded-xl overflow-hidden border-2 transition-all ${
                  isPending 
                    ? 'border-yellow-500 bg-yellow-500/10' 
                    : 'border-white/10 hover:border-primary/50 bg-white/5'
                }`}
              >
                {/* Hidden file input */}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={el => fileInputRefs.current[channel.id] = el}
                  onChange={(e) => handleFileSelect(channel.id, e)}
                />

                {/* Thumbnail area */}
                <div 
                  className="aspect-video relative cursor-pointer"
                  onClick={() => !isUploading && triggerFileInput(channel.id)}
                >
                  {thumbnailSrc ? (
                    <img
                      src={thumbnailSrc}
                      alt={channel.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                      <Tv size={32} className="text-primary/50" />
                    </div>
                  )}

                  {/* Hover overlay */}
                  {!isUploading && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="text-center">
                        <Upload size={24} className="mx-auto mb-1" />
                        <span className="text-xs">Click to upload</span>
                      </div>
                    </div>
                  )}

                  {/* Uploading overlay */}
                  {isUploading && (
                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                      <Loader2 size={32} className="animate-spin text-primary" />
                    </div>
                  )}

                  {/* Pending indicator */}
                  {isPending && !isUploading && (
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          uploadThumbnail(channel.id);
                        }}
                        className="p-1.5 bg-green-600 rounded-full hover:bg-green-700"
                        title="Upload now"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelPending(channel.id);
                        }}
                        className="p-1.5 bg-red-600 rounded-full hover:bg-red-700"
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Channel info */}
                <div className="p-3">
                  <p className="font-medium text-sm truncate">{channel.name}</p>
                  <p className="text-xs text-gray-500">{channel.videos?.length || 0} videos</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Instructions */}
      <div className="max-w-6xl mx-auto px-4 py-6 border-t border-white/10">
        <div className="bg-white/5 rounded-lg p-4">
          <h3 className="font-medium mb-2">How to use:</h3>
          <ol className="text-sm text-gray-400 space-y-1 list-decimal list-inside">
            <li>Click on any channel thumbnail to select a new image</li>
            <li>Selected images will show a yellow border (pending)</li>
            <li>Click the green checkmark to upload individually, or use "Upload All" to upload all at once</li>
            <li>Supported formats: JPEG, PNG, WebP, GIF (max 5MB)</li>
            <li>Recommended size: 400x225 pixels (16:9 aspect ratio)</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default BulkThumbnails;
