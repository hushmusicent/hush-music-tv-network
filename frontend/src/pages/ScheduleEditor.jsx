import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft,
  Calendar,
  Clock,
  RefreshCw,
  Save,
  Trash2,
  Plus,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  GripVertical,
  X,
  Loader2,
  Tv,
  Film,
  AlertCircle,
  Check,
  Copy
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import axios from 'axios';
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
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const api = axios.create({
  baseURL: process.env.REACT_APP_BACKEND_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Get current date in Eastern timezone (YYYY-MM-DD format)
const getEasternDate = () => {
  try {
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    // Validate format YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
  } catch (e) {
    console.error('Error getting Eastern date:', e);
  }
  // Fallback: manually construct date
  const now = new Date();
  const eastern = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const year = eastern.getFullYear();
  const month = String(eastern.getMonth() + 1).padStart(2, '0');
  const day = String(eastern.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Get current time in Eastern timezone
const getEasternTime = () => {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
};

// Format seconds to HH:MM:SS
const formatTimeFromSeconds = (totalSeconds) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// Parse HH:MM:SS to seconds
const parseTimeToSeconds = (timeStr) => {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 3600 + parts[1] * 60;
  }
  return 0;
};

// Format duration
const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Sortable Schedule Item
const SortableScheduleItem = ({ item, index, onRemove, onEditTime, isEditing, editValue, onEditChange, onEditSave, onEditCancel }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-black/40 rounded-lg group hover:bg-black/50 transition-colors ${isDragging ? 'ring-2 ring-primary z-50' : ''}`}
      data-testid={`schedule-item-${item.id}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-white/10 rounded"
      >
        <GripVertical size={16} className="text-gray-500" />
      </div>
      
      <span className="w-8 text-center text-gray-500 text-sm font-mono">
        {index + 1}
      </span>
      
      <div className="w-16 h-10 bg-black rounded overflow-hidden flex-shrink-0">
        {item.youtube_id ? (
          <img
            src={`https://img.youtube.com/vi/${item.youtube_id}/mqdefault.jpg`}
            alt={item.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film size={16} className="text-gray-500" />
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.title}</p>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {formatDuration(item.duration)}
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {isEditing ? (
          <div className="flex items-center gap-1">
            <Input
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              className="w-24 h-7 text-xs bg-black/50 border-white/20"
              placeholder="HH:MM"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onEditSave();
                if (e.key === 'Escape') onEditCancel();
              }}
            />
            <Button size="icon" variant="ghost" onClick={onEditSave} className="h-7 w-7">
              <Check size={12} />
            </Button>
            <Button size="icon" variant="ghost" onClick={onEditCancel} className="h-7 w-7">
              <X size={12} />
            </Button>
          </div>
        ) : (
          <button
            onClick={() => onEditTime(item)}
            className="text-sm font-mono text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded bg-primary/10"
          >
            {item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)}
          </button>
        )}
        
        <button
          onClick={() => onRemove(item.id)}
          className="p-1.5 text-gray-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

// Available Video Item (for adding to schedule)
const AvailableVideoItem = ({ video, onAdd, isInSchedule }) => {
  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
        isInSchedule 
          ? 'bg-green-500/10 border border-green-500/30' 
          : 'bg-black/30 hover:bg-black/40 cursor-pointer'
      }`}
      onClick={() => !isInSchedule && onAdd(video)}
      data-testid={`available-video-${video.id}`}
    >
      <div className="w-12 h-8 bg-black rounded overflow-hidden flex-shrink-0">
        {video.youtube_id ? (
          <img
            src={`https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`}
            alt={video.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film size={12} className="text-gray-500" />
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{video.title}</p>
        <p className="text-xs text-gray-500">{formatDuration(video.duration || 300)}</p>
      </div>
      
      {isInSchedule ? (
        <Check size={14} className="text-green-400" />
      ) : (
        <Plus size={14} className="text-gray-400" />
      )}
    </div>
  );
};

const ScheduleEditor = () => {
  const navigate = useNavigate();
  const { channelId } = useParams();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  
  const [channel, setChannel] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [availableVideos, setAvailableVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [currentDate, setCurrentDate] = useState(getEasternDate());
  
  // Edit time slot state
  const [editingTimeSlot, setEditingTimeSlot] = useState(null);
  const [editTimeValue, setEditTimeValue] = useState('');
  
  // Search filter
  const [searchQuery, setSearchQuery] = useState('');
  
  // Import/Export
  const [showImportExport, setShowImportExport] = useState(false);
  const [importData, setImportData] = useState('');
  const fileInputRef = useRef(null);

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
    
    if (user && user.is_admin === false) {
      navigate('/');
      return;
    }
    
    if (user?.is_admin && channelId) {
      loadData();
    }
  }, [isAuthenticated, user, authLoading, navigate, channelId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load channel data
      const channelRes = await api.get(`/api/channels/${channelId}`);
      setChannel(channelRes.data);
      setAvailableVideos(channelRes.data.videos || []);
      
      // Load existing schedule
      const scheduleRes = await api.get(`/api/schedule/channel/${channelId}`);
      if (scheduleRes.data && scheduleRes.data.videos) {
        // Map schedule videos with unique IDs
        const scheduleVideos = scheduleRes.data.videos.map((v, idx) => ({
          ...v,
          id: `schedule-${v.video_id}-${idx}`,
        }));
        setSchedule(scheduleVideos);
        setCurrentDate(scheduleRes.data.date);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load schedule data');
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate schedule from available videos
  const autoGenerateSchedule = () => {
    if (!availableVideos.length) {
      toast.error('No videos available to schedule');
      return;
    }
    
    let currentSeconds = 0;
    const newSchedule = [];
    const videosToUse = channel?.random_play 
      ? [...availableVideos].sort(() => Math.random() - 0.5)
      : availableVideos;
    
    // Calculate total duration to fill 24 hours
    const daySeconds = 24 * 60 * 60;
    let idx = 0;
    
    while (currentSeconds < daySeconds) {
      const video = videosToUse[idx % videosToUse.length];
      const duration = video.duration || 300;
      
      const startTime = formatTimeFromSeconds(currentSeconds);
      const endSeconds = Math.min(currentSeconds + duration, daySeconds);
      const endTime = formatTimeFromSeconds(endSeconds);
      
      newSchedule.push({
        id: `schedule-${video.id}-${newSchedule.length}`,
        video_id: video.id,
        youtube_id: video.youtube_id,
        title: video.title,
        duration: duration,
        start_time: startTime,
        end_time: endTime,
        video_url: video.video_url,
      });
      
      currentSeconds = endSeconds;
      idx++;
      
      // Safety limit
      if (newSchedule.length > 500) break;
    }
    
    setSchedule(newSchedule);
    setHasChanges(true);
    toast.success(`Generated schedule with ${newSchedule.length} slots`);
  };

  // Add video to schedule
  const addToSchedule = (video) => {
    const lastItem = schedule[schedule.length - 1];
    const startSeconds = lastItem 
      ? parseTimeToSeconds(lastItem.end_time) 
      : 0;
    
    // Check if we're past 24 hours
    if (startSeconds >= 24 * 60 * 60) {
      toast.error('Schedule is full (24 hours)');
      return;
    }
    
    const duration = video.duration || 300;
    const endSeconds = Math.min(startSeconds + duration, 24 * 60 * 60);
    
    const newItem = {
      id: `schedule-${video.id}-${Date.now()}`,
      video_id: video.id,
      youtube_id: video.youtube_id,
      title: video.title,
      duration: duration,
      start_time: formatTimeFromSeconds(startSeconds),
      end_time: formatTimeFromSeconds(endSeconds),
      video_url: video.video_url,
    };
    
    setSchedule([...schedule, newItem]);
    setHasChanges(true);
  };

  // Remove from schedule
  const removeFromSchedule = (itemId) => {
    const newSchedule = schedule.filter(s => s.id !== itemId);
    // Recalculate times
    recalculateTimes(newSchedule);
    setHasChanges(true);
  };

  // Recalculate times after reorder or remove
  const recalculateTimes = (items) => {
    let currentSeconds = 0;
    const updated = items.map(item => {
      const startTime = formatTimeFromSeconds(currentSeconds);
      const endSeconds = currentSeconds + item.duration;
      const endTime = formatTimeFromSeconds(endSeconds);
      currentSeconds = endSeconds;
      return { ...item, start_time: startTime, end_time: endTime };
    });
    setSchedule(updated);
  };

  // Handle drag end
  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    if (active.id !== over?.id) {
      setSchedule((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const reordered = arrayMove(items, oldIndex, newIndex);
        
        // Recalculate times
        let currentSeconds = 0;
        return reordered.map(item => {
          const startTime = formatTimeFromSeconds(currentSeconds);
          const endSeconds = currentSeconds + item.duration;
          const endTime = formatTimeFromSeconds(endSeconds);
          currentSeconds = endSeconds;
          return { ...item, start_time: startTime, end_time: endTime };
        });
      });
      setHasChanges(true);
    }
  };

  // Edit time slot (manual override)
  const startEditingTime = (item) => {
    setEditingTimeSlot(item.id);
    setEditTimeValue(item.start_time.slice(0, 5));
  };

  const saveTimeEdit = () => {
    if (!editTimeValue) {
      setEditingTimeSlot(null);
      return;
    }
    
    // Parse the new start time
    const parts = editTimeValue.split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
      toast.error('Invalid time format. Use HH:MM');
      return;
    }
    
    const newStartSeconds = parts[0] * 3600 + parts[1] * 60;
    
    // Find the item and update its time
    const itemIndex = schedule.findIndex(s => s.id === editingTimeSlot);
    if (itemIndex === -1) return;
    
    const item = schedule[itemIndex];
    const endSeconds = newStartSeconds + item.duration;
    
    const updated = [...schedule];
    updated[itemIndex] = {
      ...item,
      start_time: formatTimeFromSeconds(newStartSeconds),
      end_time: formatTimeFromSeconds(endSeconds),
    };
    
    // Sort by start time
    updated.sort((a, b) => parseTimeToSeconds(a.start_time) - parseTimeToSeconds(b.start_time));
    
    setSchedule(updated);
    setEditingTimeSlot(null);
    setEditTimeValue('');
    setHasChanges(true);
    toast.success('Time slot updated');
  };

  // Save schedule to backend
  const saveSchedule = async () => {
    if (!schedule.length) {
      toast.error('No videos in schedule');
      return;
    }
    
    // Ensure we have a valid date
    const scheduleDate = currentDate || getEasternDate();
    if (!scheduleDate) {
      toast.error('Invalid date');
      return;
    }
    
    setSaving(true);
    try {
      // Convert schedule to backend format
      const scheduleData = {
        channel_id: channelId,
        date: scheduleDate,
        videos: schedule.map(s => ({
          video_id: s.video_id,
          youtube_id: s.youtube_id,
          title: s.title,
          duration: s.duration,
          start_time: s.start_time,
          end_time: s.end_time,
          video_url: s.video_url || null,
          thumbnail: s.thumbnail || null,
        })),
      };
      
      console.log('Saving schedule:', scheduleData);
      await api.post('/api/schedule/save', scheduleData);
      setHasChanges(false);
      toast.success('Schedule saved successfully!');
    } catch (error) {
      console.error('Failed to save schedule:', error);
      toast.error('Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  // Export schedule as JSON
  const exportSchedule = () => {
    const exportData = {
      channel_id: channelId,
      channel_name: channel?.name,
      date: currentDate,
      exported_at: new Date().toISOString(),
      schedule: schedule.map(s => ({
        video_id: s.video_id,
        youtube_id: s.youtube_id,
        title: s.title,
        duration: s.duration,
        start_time: s.start_time,
        end_time: s.end_time,
      })),
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule-${channel?.name || channelId}-${currentDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Schedule exported!');
  };

  // Import schedule from JSON
  const importSchedule = () => {
    try {
      const data = JSON.parse(importData);
      if (!data.schedule || !Array.isArray(data.schedule)) {
        throw new Error('Invalid schedule format');
      }
      
      // Map imported schedule to our format
      const imported = data.schedule.map((s, idx) => ({
        id: `schedule-${s.video_id}-${idx}`,
        video_id: s.video_id,
        youtube_id: s.youtube_id,
        title: s.title,
        duration: s.duration,
        start_time: s.start_time,
        end_time: s.end_time,
        video_url: s.video_url,
      }));
      
      setSchedule(imported);
      setHasChanges(true);
      setShowImportExport(false);
      setImportData('');
      toast.success(`Imported ${imported.length} schedule items`);
    } catch (error) {
      toast.error('Failed to import: Invalid JSON format');
    }
  };

  // Handle file upload for import
  const handleFileImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      setImportData(e.target.result);
    };
    reader.readAsText(file);
  };

  // Copy schedule template to clipboard
  const copyTemplate = () => {
    const template = {
      channel_id: channelId,
      channel_name: channel?.name,
      date: "YYYY-MM-DD",
      schedule: [
        {
          video_id: "video-uuid",
          youtube_id: "youtube-video-id",
          title: "Video Title",
          duration: 300,
          start_time: "00:00:00",
          end_time: "00:05:00",
        }
      ]
    };
    navigator.clipboard.writeText(JSON.stringify(template, null, 2));
    toast.success('Template copied to clipboard!');
  };

  // Filter available videos
  const filteredVideos = availableVideos.filter(v => 
    v.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Check which videos are in schedule
  const scheduledVideoIds = new Set(schedule.map(s => s.video_id));

  // Calculate total scheduled duration
  const totalDuration = schedule.reduce((acc, s) => acc + (s.duration || 0), 0);
  const totalHours = Math.floor(totalDuration / 3600);
  const totalMinutes = Math.floor((totalDuration % 3600) / 60);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <Calendar size={48} className="mx-auto mb-4 text-primary animate-pulse" />
          <p className="text-muted-foreground">Loading Schedule Editor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white" data-testid="schedule-editor-page">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0f]/95 backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate('/dashboard')}
              className="hover:bg-white/10"
              data-testid="back-to-dashboard"
            >
              <ArrowLeft size={20} />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <Calendar className="text-primary" size={28} />
                Schedule Editor
              </h1>
              <p className="text-sm text-gray-400 mt-0.5 flex items-center gap-2">
                {channel?.name} • {currentDate}
                {hasChanges && (
                  <span className="text-yellow-400 flex items-center gap-1">
                    <AlertCircle size={12} />
                    Unsaved changes
                  </span>
                )}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImportExport(true)}
              className="border-white/20"
              data-testid="import-export-btn"
            >
              <Download size={14} className="mr-1" />
              Import/Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={autoGenerateSchedule}
              className="border-primary/50 text-primary"
              data-testid="auto-generate-btn"
            >
              <RefreshCw size={14} className="mr-1" />
              Auto-Generate
            </Button>
            <Button
              size="sm"
              onClick={saveSchedule}
              disabled={saving || !hasChanges}
              className="bg-green-600 hover:bg-green-700"
              data-testid="save-schedule-btn"
            >
              {saving ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <Save size={14} className="mr-1" />
              )}
              Save Schedule
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-80px)]">
        {/* Schedule Timeline (Left) */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Schedule Timeline</h2>
              <p className="text-sm text-gray-400">
                {schedule.length} items • {totalHours}h {totalMinutes}m total
              </p>
            </div>
            {schedule.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (window.confirm('Clear all scheduled items?')) {
                    setSchedule([]);
                    setHasChanges(true);
                  }
                }}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                <Trash2 size={14} className="mr-1" />
                Clear All
              </Button>
            )}
          </div>

          {schedule.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={schedule.map(s => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {schedule.map((item, index) => (
                    <SortableScheduleItem
                      key={item.id}
                      item={item}
                      index={index}
                      onRemove={removeFromSchedule}
                      onEditTime={startEditingTime}
                      isEditing={editingTimeSlot === item.id}
                      editValue={editTimeValue}
                      onEditChange={setEditTimeValue}
                      onEditSave={saveTimeEdit}
                      onEditCancel={() => setEditingTimeSlot(null)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="text-center py-16 glass rounded-lg">
              <Calendar size={48} className="mx-auto mb-4 text-gray-600" />
              <h3 className="text-lg font-semibold mb-2">No Schedule Created</h3>
              <p className="text-gray-500 mb-4">
                Add videos from the right panel or auto-generate a schedule
              </p>
              <Button onClick={autoGenerateSchedule} className="bg-primary">
                <RefreshCw size={14} className="mr-2" />
                Auto-Generate Schedule
              </Button>
            </div>
          )}
        </div>

        {/* Available Videos (Right) */}
        <div className="w-80 border-l border-white/10 bg-[#0d0d12] p-4 overflow-y-auto">
          <div className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Available Videos</h2>
            <Input
              placeholder="Search videos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-black/50 border-white/20"
              data-testid="search-videos-input"
            />
          </div>

          <p className="text-xs text-gray-500 mb-3">
            Click to add to schedule • {filteredVideos.length} videos
          </p>

          <div className="space-y-2">
            {filteredVideos.map((video) => (
              <AvailableVideoItem
                key={video.id}
                video={video}
                onAdd={addToSchedule}
                isInSchedule={scheduledVideoIds.has(video.id)}
              />
            ))}
          </div>

          {filteredVideos.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Film size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No videos found</p>
            </div>
          )}
        </div>
      </div>

      {/* Import/Export Modal */}
      {showImportExport && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#12121a] rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-lg font-semibold">Import/Export Schedule</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowImportExport(false)}
              >
                <X size={20} />
              </Button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Export Section */}
              <div className="glass rounded-lg p-4">
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Download size={16} className="text-primary" />
                  Export Current Schedule
                </h3>
                <p className="text-sm text-gray-400 mb-3">
                  Download the current schedule as a JSON file
                </p>
                <Button onClick={exportSchedule} disabled={schedule.length === 0}>
                  <Download size={14} className="mr-2" />
                  Export as JSON
                </Button>
              </div>

              {/* Import Section */}
              <div className="glass rounded-lg p-4">
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Upload size={16} className="text-green-400" />
                  Import Schedule
                </h3>
                <p className="text-sm text-gray-400 mb-3">
                  Upload a JSON file or paste schedule data
                </p>
                
                <div className="flex gap-2 mb-3">
                  <input
                    type="file"
                    accept=".json"
                    ref={fileInputRef}
                    onChange={handleFileImport}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="border-white/20"
                  >
                    <Upload size={14} className="mr-2" />
                    Choose File
                  </Button>
                  <Button
                    variant="outline"
                    onClick={copyTemplate}
                    className="border-white/20"
                  >
                    <Copy size={14} className="mr-2" />
                    Copy Template
                  </Button>
                </div>
                
                <textarea
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  placeholder="Paste JSON schedule data here..."
                  className="w-full h-32 bg-black/50 border border-white/20 rounded-lg p-3 text-sm font-mono resize-none"
                />
                
                <Button
                  onClick={importSchedule}
                  disabled={!importData}
                  className="mt-2 bg-green-600 hover:bg-green-700"
                >
                  <Upload size={14} className="mr-2" />
                  Import Schedule
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Legend */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#12121a] border border-white/10 rounded-full px-4 py-2 flex items-center gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <GripVertical size={12} />
          <span>Drag to reorder</span>
        </div>
        <div className="w-px h-4 bg-white/20" />
        <div className="flex items-center gap-1.5">
          <Clock size={12} className="text-primary" />
          <span>Click time to edit</span>
        </div>
        <div className="w-px h-4 bg-white/20" />
        <div className="flex items-center gap-1.5">
          <Plus size={12} className="text-green-400" />
          <span>Click video to add</span>
        </div>
      </div>
    </div>
  );
};

export default ScheduleEditor;
