import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { channelsAPI, analyticsAPI, videoCleanupAPI, youtubeProxyAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { 
  ChevronUp, 
  ChevronDown, 
  Radio, 
  Clock, 
  Tv,
  Volume2,
  VolumeX,
  Maximize,
  List,
  Settings,
  Edit,
  Plus,
  X,
  Calendar,
  Play,
  Pause
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Get or create anonymous viewer ID
const getViewerId = () => {
  let viewerId = localStorage.getItem('viewer_id');
  if (!viewerId) {
    viewerId = 'v_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('viewer_id', viewerId);
  }
  return viewerId;
};

// Fisher-Yates shuffle algorithm - creates a new random order each time
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Generate a 24-hour schedule from videos
// Videos play in random order, NO repeats until ALL videos have played
const generate24HourSchedule = (videos) => {
  if (!videos || videos.length === 0) return [];
  
  const schedule = [];
  const totalSeconds = 24 * 60 * 60; // 24 hours in seconds
  let currentTime = 0;
  let currentBatch = []; // Current shuffled batch of videos
  let batchIndex = 0;
  
  while (currentTime < totalSeconds) {
    // If we've played all videos in current batch, create a new shuffled batch
    if (batchIndex >= currentBatch.length) {
      currentBatch = shuffleArray(videos);
      batchIndex = 0;
    }
    
    const video = currentBatch[batchIndex];
    const duration = video.duration || 300;
    
    schedule.push({
      ...video,
      start_time: currentTime,
      end_time: currentTime + duration
    });
    
    currentTime += duration;
    batchIndex++;
  }
  
  console.log(`Schedule: ${videos.length} unique videos, ${schedule.length} slots (plays all before repeating)`);
  return schedule;
};

// Get current Eastern time in seconds since midnight
const getEasternTimeSeconds = () => {
  const now = new Date();
  const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return eastern.getHours() * 3600 + eastern.getMinutes() * 60 + eastern.getSeconds();
};

// Parse HH:MM:SS time string to seconds
const parseTimeToSeconds = (timeStr) => {
  if (typeof timeStr === 'number') return timeStr;
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(timeStr) || 0;
};

// Get current video from 24-hour schedule based on ACTUAL Eastern time (synchronized for all viewers)
const getVideoFromSchedule = (schedule, failedVideoIds = new Set()) => {
  if (!schedule || schedule.length === 0) {
    return { video: null, seekTime: 0, videoIndex: -1 };
  }
  
  // Use actual Eastern time for synchronized playback
  const currentSeconds = getEasternTimeSeconds();
  
  // Find the video that should be playing at this time
  for (let i = 0; i < schedule.length; i++) {
    const slot = schedule[i];
    if (failedVideoIds.has(slot.youtube_id)) continue;
    
    const slotStart = parseTimeToSeconds(slot.start_time);
    const slotEnd = parseTimeToSeconds(slot.end_time);
    
    if (currentSeconds >= slotStart && currentSeconds < slotEnd) {
      const seekTime = currentSeconds - slotStart;
      return { video: slot, seekTime, videoIndex: i };
    }
  }
  
  // Fallback to first playable video
  for (let i = 0; i < schedule.length; i++) {
    if (!failedVideoIds.has(schedule[i].youtube_id)) {
      return { video: schedule[i], seekTime: 0, videoIndex: i };
    }
  }
  
  return { video: null, seekTime: 0, videoIndex: -1 };
};

// Calculate current video from playlist (for non-scheduled channels)
const getVideoFromPlaylist = (playlist, elapsedSeconds, failedVideoIds = new Set()) => {
  if (!playlist || playlist.length === 0) {
    return { video: null, seekTime: 0, videoIndex: -1 };
  }
  
  // Filter out failed videos
  const playableVideos = playlist.filter(v => !failedVideoIds.has(v.youtube_id));
  if (playableVideos.length === 0) {
    return { video: null, seekTime: 0, videoIndex: -1 };
  }
  
  // Calculate total playlist duration
  let totalDuration = 0;
  for (const video of playableVideos) {
    totalDuration += video.duration || 300;
  }
  
  // Wrap elapsed time within playlist duration (loop the playlist)
  const wrappedTime = elapsedSeconds % totalDuration;
  
  // Find current video
  let accumulatedTime = 0;
  for (let i = 0; i < playableVideos.length; i++) {
    const video = playableVideos[i];
    const duration = video.duration || 300;
    
    if (wrappedTime < accumulatedTime + duration) {
      const seekTime = wrappedTime - accumulatedTime;
      // Find actual index in original playlist
      const actualIndex = playlist.findIndex(v => v.video_id === video.video_id);
      return { video, seekTime, videoIndex: actualIndex };
    }
    accumulatedTime += duration;
  }
  
  // Fallback to first video
  return { video: playableVideos[0], seekTime: 0, videoIndex: 0 };
};

// Check if a channel should use synchronized schedule
const isScheduledChannel = (channel) => {
  return channel?.use_schedule === true;
};

const LiveTV = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const isAdmin = user?.is_admin;
  
  const [channels, setChannels] = useState([]);
  const [playlists, setPlaylists] = useState({}); // channel_id -> playlist (array of videos)
  const [schedules, setSchedules] = useState({}); // channel_id -> 24-hour schedule (only for scheduled channels)
  const [currentChannel, setCurrentChannel] = useState(null);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [seekTime, setSeekTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [showChannelList, setShowChannelList] = useState(true);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [scheduleDate, setScheduleDate] = useState('');
  const [showChannelChanger, setShowChannelChanger] = useState(true);
  const [channelInput, setChannelInput] = useState('');
  const [showChannelOSD, setShowChannelOSD] = useState(false);
  const [showPlayPauseOSD, setShowPlayPauseOSD] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [failedVideoIds, setFailedVideoIds] = useState(new Set());
  const [sessionStartTime, setSessionStartTime] = useState(null); // When user started watching
  const [useProxyPlayer, setUseProxyPlayer] = useState(false); // Whether to use proxy for current video
  const [proxyVideoUrl, setProxyVideoUrl] = useState(null); // Direct video URL from proxy
  
  const playerRef = useRef(null);
  const videoRef = useRef(null);
  const youtubePlayerRef = useRef(null);
  const proxyVideoRef = useRef(null); // For proxy video player
  const channelInputTimeoutRef = useRef(null);
  const osdTimeoutRef = useRef(null);
  const playPauseOsdTimeoutRef = useRef(null);

  // Auto-hide controls after inactivity
  const CONTROLS_HIDE_DELAY = 3000;
  const isPausedRef = useRef(isPaused);
  
  useEffect(() => {
    isPausedRef.current = isPaused;
    if (isPaused) {
      setControlsVisible(true);
    }
  }, [isPaused]);

  useEffect(() => {
    let hideTimeout = null;
    
    const showAndStartTimer = () => {
      setControlsVisible(true);
      if (hideTimeout) clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        if (!isPausedRef.current) setControlsVisible(false);
      }, CONTROLS_HIDE_DELAY);
    };
    
    const handleActivity = () => showAndStartTimer();

    document.addEventListener('mousemove', handleActivity);
    document.addEventListener('touchstart', handleActivity);
    document.addEventListener('keydown', handleActivity);
    showAndStartTimer();

    return () => {
      document.removeEventListener('mousemove', handleActivity);
      document.removeEventListener('touchstart', handleActivity);
      document.removeEventListener('keydown', handleActivity);
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Load YouTube IFrame API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // Load channels and playlists on mount, set session start time
  useEffect(() => {
    const startTime = Date.now();
    setSessionStartTime(startTime);
    loadChannelsAndPlaylists();
    
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(timeInterval);
  }, []);

  // Periodic view tracking
  useEffect(() => {
    if (!currentChannel) return;
    const trackInterval = setInterval(() => {
      try {
        analyticsAPI.recordView(currentChannel.id, getViewerId());
      } catch (e) {}
    }, 120000);
    return () => clearInterval(trackInterval);
  }, [currentChannel]);

  const loadChannelsAndPlaylists = async () => {
    try {
      setLoading(true);
      
      // Load channels from the public endpoint
      const scheduleResponse = await axios.get(`${BACKEND_URL}/api/schedule/live`);
      const { schedules: scheduleList, date } = scheduleResponse.data;
      
      setScheduleDate(date);
      
      // Convert to playlist map
      // Channels with use_schedule=true use the BACKEND schedule (persistent, synchronized for all viewers)
      // Other channels get shuffled playlists (random per session)
      const playlistMap = {};
      const scheduleMap = {};
      const channelList = [];
      
      for (const schedule of scheduleList) {
        const videos = schedule.videos || [];
        const channelName = schedule.channel_name?.trim();
        const channelUsesSchedule = schedule.use_schedule === true;
        const channelIsLiveStream = schedule.is_live_stream === true;
        
        if (channelIsLiveStream) {
          // Live stream channels don't need playlists or schedules
          channelList.push({
            id: schedule.channel_id,
            name: channelName,
            thumbnail: schedule.channel_thumbnail,
            videoCount: 1,
            use_schedule: false,
            is_live_stream: true,
            live_stream_youtube_id: schedule.live_stream_youtube_id,
          });
          continue;
        }
        
        if (channelUsesSchedule) {
          // Use the BACKEND schedule directly (already has start_time, end_time from server)
          // This ensures all viewers are synchronized to the same schedule
          scheduleMap[schedule.channel_id] = videos; // Backend schedule with time slots
          playlistMap[schedule.channel_id] = videos; // Keep reference
          console.log(`Using backend schedule for ${channelName}: ${videos.length} slots (synchronized)`);
        } else {
          // Shuffle videos for other channels (random per session)
          const shuffledVideos = shuffleArray(videos);
          playlistMap[schedule.channel_id] = shuffledVideos;
        }
        
        channelList.push({
          id: schedule.channel_id,
          name: channelName,
          thumbnail: schedule.channel_thumbnail,
          videoCount: schedule.unique_video_count || videos.length,
          use_schedule: channelUsesSchedule
        });
      }
      
      console.log('Playlists loaded for this session');
      setPlaylists(playlistMap);
      setSchedules(scheduleMap);
      setChannels(channelList);
      
      // Select first channel
      if (channelList.length > 0) {
        selectChannel(channelList[0], playlistMap, scheduleMap, Date.now());
      }
    } catch (error) {
      console.error('Failed to load playlists:', error);
      toast.error('Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  // Calculate elapsed seconds since session start
  const getElapsedSeconds = useCallback(() => {
    if (!sessionStartTime) return 0;
    return Math.floor((Date.now() - sessionStartTime) / 1000);
  }, [sessionStartTime]);

  const selectChannel = useCallback((channel, playlistMap = playlists, scheduleMap = schedules, startTime = sessionStartTime) => {
    setCurrentChannel(channel);
    setFailedVideoIds(new Set());
    
    // Live stream channels - set a special video object
    if (channel.is_live_stream && channel.live_stream_youtube_id) {
      setCurrentVideo({
        video_id: 'live-stream',
        youtube_id: channel.live_stream_youtube_id,
        title: `${channel.name} - LIVE`,
        duration: 0,
        is_live: true,
      });
      setCurrentVideoIndex(0);
      setSeekTime(0);
      setUseProxyPlayer(false);
      setProxyVideoUrl(null);
      showOSD();
      try {
        analyticsAPI.recordView(channel.id, getViewerId());
      } catch (e) {}
      return;
    }
    
    const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    
    // Check if this is a scheduled channel (Hush Music Radio)
    const channelSchedule = scheduleMap[channel.id];
    
    if (channelSchedule && channelSchedule.length > 0) {
      // Use 24-hour schedule for this channel
      const { video, seekTime: newSeekTime, videoIndex } = getVideoFromSchedule(channelSchedule, new Set());
      
      if (video) {
        console.log(`[SCHEDULED] ${channel.name} - Playing: ${video.title} at ${newSeekTime}s`);
        setCurrentVideoIndex(videoIndex);
        setCurrentVideo(video);
        setSeekTime(newSeekTime);
      }
    } else {
      // Use regular playlist for other channels
      const playlist = playlistMap[channel.id];
      if (playlist && playlist.length > 0) {
        const { video, seekTime: newSeekTime, videoIndex } = getVideoFromPlaylist(playlist, elapsed, new Set());
        
        if (video) {
          console.log(`Channel: ${channel.name} - Playing: ${video.title} at ${newSeekTime}s`);
          setCurrentVideoIndex(videoIndex);
          setCurrentVideo(video);
          setSeekTime(newSeekTime);
        }
      }
    }
    
    try {
      analyticsAPI.recordView(channel.id, getViewerId());
    } catch (e) {}
    
    showOSD();
  }, [playlists, schedules, sessionStartTime]);

  const showOSD = () => {
    setShowChannelOSD(true);
    if (osdTimeoutRef.current) clearTimeout(osdTimeoutRef.current);
    osdTimeoutRef.current = setTimeout(() => setShowChannelOSD(false), 3000);
  };

  const getCurrentChannelIndex = () => {
    if (!currentChannel) return -1;
    return channels.findIndex(c => c.id === currentChannel.id);
  };

  const channelUp = () => {
    const currentIndex = getCurrentChannelIndex();
    if (currentIndex > 0) {
      selectChannel(channels[currentIndex - 1]);
    } else if (channels.length > 0) {
      selectChannel(channels[channels.length - 1]);
    }
  };

  const channelDown = () => {
    const currentIndex = getCurrentChannelIndex();
    if (currentIndex < channels.length - 1) {
      selectChannel(channels[currentIndex + 1]);
    } else if (channels.length > 0) {
      selectChannel(channels[0]);
    }
  };

  const goToChannel = (num) => {
    const index = num - 1;
    if (index >= 0 && index < channels.length) {
      selectChannel(channels[index]);
    }
  };

  const handleChannelNumberInput = (digit) => {
    if (channelInputTimeoutRef.current) clearTimeout(channelInputTimeoutRef.current);
    const newInput = channelInput + digit;
    setChannelInput(newInput);
    setShowChannelOSD(true);
    channelInputTimeoutRef.current = setTimeout(() => {
      const channelNum = parseInt(newInput, 10);
      if (channelNum > 0 && channelNum <= channels.length) {
        goToChannel(channelNum);
      }
      setChannelInput('');
    }, 1500);
  };

  const isUploadedVideo = currentVideo && (currentVideo.video_url || !currentVideo.youtube_id);
  
  // Check if current channel is using synchronized schedule mode (via use_schedule flag)
  const isCurrentChannelScheduled = currentChannel?.use_schedule === true;
  
  // Check if current channel is a live stream
  const isCurrentChannelLiveStream = currentChannel?.is_live_stream === true;

  // Play next video in playlist (called when current video ends)
  const playNextVideo = useCallback(() => {
    if (!currentChannel) return;
    
    // For scheduled channels, find next slot in schedule
    if (schedules[currentChannel.id]) {
      const schedule = schedules[currentChannel.id];
      const playableSlots = schedule.filter(v => !failedVideoIds.has(v.youtube_id));
      
      if (playableSlots.length === 0) {
        toast.error('No playable videos on this channel');
        return;
      }
      
      // Find current slot and move to next
      const currentSlotIndex = schedule.findIndex(v => v.video_id === currentVideo?.video_id);
      let nextSlotIndex = currentSlotIndex + 1;
      
      // Find next playable slot
      while (nextSlotIndex < schedule.length && failedVideoIds.has(schedule[nextSlotIndex].youtube_id)) {
        nextSlotIndex++;
      }
      
      // If we're at the end, loop to beginning
      if (nextSlotIndex >= schedule.length) {
        nextSlotIndex = 0;
        while (nextSlotIndex < schedule.length && failedVideoIds.has(schedule[nextSlotIndex].youtube_id)) {
          nextSlotIndex++;
        }
      }
      
      const nextVideo = schedule[nextSlotIndex];
      console.log('[SCHEDULED] Video ended, playing next:', nextVideo.title);
      setCurrentVideoIndex(nextSlotIndex);
      setCurrentVideo(nextVideo);
      setSeekTime(0);
      return;
    }
    
    // For regular channels
    if (!playlists[currentChannel.id]) return;
    
    const playlist = playlists[currentChannel.id];
    const playableVideos = playlist.filter(v => !failedVideoIds.has(v.youtube_id));
    
    if (playableVideos.length === 0) {
      toast.error('No playable videos on this channel');
      return;
    }
    
    // Find next video after current
    const currentPlayableIndex = playableVideos.findIndex(v => v.video_id === currentVideo?.video_id);
    const nextPlayableIndex = (currentPlayableIndex + 1) % playableVideos.length;
    const nextVideo = playableVideos[nextPlayableIndex];
    
    // Find actual index in original playlist
    const actualIndex = playlist.findIndex(v => v.video_id === nextVideo.video_id);
    
    console.log('Video ended, playing next:', nextVideo.title);
    setCurrentVideoIndex(actualIndex);
    setCurrentVideo(nextVideo);
    setSeekTime(0); // Start from beginning
  }, [currentChannel, playlists, schedules, currentVideo, failedVideoIds]);

  // Skip to next video (for unavailable videos - only deletes from DB if admin)
  const skipToNextVideo = useCallback(async () => {
    if (!currentChannel) return;
    
    const playlist = playlists[currentChannel.id] || [];
    const schedule = schedules[currentChannel.id];
    
    // Mark current video as failed
    if (currentVideo?.youtube_id) {
      setFailedVideoIds(prev => new Set(prev).add(currentVideo.youtube_id));
      
      // Only delete from database if user is admin
      if (isAdmin) {
        try {
          const result = await videoCleanupAPI.deleteByYoutubeId(currentVideo.youtube_id, currentChannel.id);
          if (result.data.deleted) {
            console.log('Admin: Deleted unplayable video:', currentVideo.title);
            toast.info(`Removed unavailable video: ${currentVideo.title}`);
          }
        } catch (e) {
          console.error('Failed to delete video:', e);
        }
      } else {
        console.log('Skipping unplayable video (not admin, not deleting):', currentVideo.title);
      }
    }
    
    // Find next playable video
    const newFailedIds = new Set(failedVideoIds);
    if (currentVideo?.youtube_id) newFailedIds.add(currentVideo.youtube_id);
    
    // For scheduled channels, use schedule
    if (schedule && schedule.length > 0) {
      const playableSlots = schedule.filter(v => !newFailedIds.has(v.youtube_id));
      if (playableSlots.length === 0) {
        toast.error('No playable videos on this channel');
        return;
      }
      const nextVideo = playableSlots[0];
      const actualIndex = schedule.findIndex(v => v.video_id === nextVideo.video_id);
      console.log('[SCHEDULED] Skipping to:', nextVideo.title);
      setCurrentVideoIndex(actualIndex);
      setCurrentVideo(nextVideo);
      setSeekTime(0);
      return;
    }
    
    // For regular channels
    const playableVideos = playlist.filter(v => !newFailedIds.has(v.youtube_id));
    
    if (playableVideos.length === 0) {
      toast.error('No playable videos on this channel');
      return;
    }
    
    // Play first available
    const nextVideo = playableVideos[0];
    const actualIndex = playlist.findIndex(v => v.video_id === nextVideo.video_id);
    
    console.log('Skipping to:', nextVideo.title);
    setCurrentVideoIndex(actualIndex);
    setCurrentVideo(nextVideo);
    setSeekTime(0);
  }, [currentChannel, playlists, schedules, currentVideo, failedVideoIds, isAdmin]);

  // Check if video needs proxy (age-restricted) and get stream URL
  const checkAndGetProxyUrl = useCallback(async (youtubeId) => {
    try {
      const response = await youtubeProxyAPI.getStreamInfo(youtubeId);
      if (response.data.success) {
        return response.data.url;
      }
      // If cookies not available, don't wait - just skip
      if (response.data.cookies_available === false) {
        console.log('No cookies available for proxy, skipping immediately');
        return null;
      }
      return null;
    } catch (e) {
      console.error('Error checking proxy:', e);
      return null;
    }
  }, []);

  // Initialize YouTube player when video changes
  useEffect(() => {
    if (!currentVideo?.youtube_id || isUploadedVideo) return;
    
    // Reset proxy state
    setUseProxyPlayer(false);
    setProxyVideoUrl(null);
    
    if (youtubePlayerRef.current) {
      try {
        youtubePlayerRef.current.destroy();
      } catch (e) {}
      youtubePlayerRef.current = null;
    }

    let errorTimeout = null;
    let playbackCheckTimeout = null;
    let ageRestrictionFallbackTimeout = null;
    let retryAttempt = 0; // Track retry attempts for embed
    
    const isLive = currentVideo.is_live === true;

    const tryProxyFallback = async () => {
      // Don't try proxy for live streams
      if (isLive) {
        toast.info('Live stream unavailable');
        return;
      }
      console.log('Trying proxy fallback for age-restricted video...');
      
      try {
        const proxyUrl = await checkAndGetProxyUrl(currentVideo.youtube_id);
        if (proxyUrl) {
          console.log('Got proxy URL, switching to proxy player');
          setProxyVideoUrl(proxyUrl);
          setUseProxyPlayer(true);
          toast.success('Playing via proxy');
        } else {
          console.log('Proxy unavailable, skipping to next video');
          toast.info(`Skipping: ${currentVideo?.title?.substring(0, 25)}...`, { duration: 2000 });
          skipToNextVideo();
        }
      } catch (e) {
        console.error('Proxy fallback failed:', e);
        toast.info(`Skipping unavailable video`, { duration: 2000 });
        skipToNextVideo();
      }
    };
    
    const createPlayer = (host) => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(() => createPlayer(host), 100);
        return;
      }

      const container = document.getElementById('youtube-player');
      if (!container) return;
      
      container.innerHTML = '';
      const playerDiv = document.createElement('div');
      playerDiv.id = 'yt-player-instance';
      container.appendChild(playerDiv);

      youtubePlayerRef.current = new window.YT.Player('yt-player-instance', {
        videoId: currentVideo.youtube_id,
        host: host,
        playerVars: {
          autoplay: 1,
          controls: 0,
          start: isLive ? undefined : Math.floor(seekTime),
          modestbranding: 1,
          rel: 0,
          fs: 0,
          playsinline: 1,
          disablekb: isLive ? 0 : 1,
          iv_load_policy: 3,
          showinfo: 0,
          cc_load_policy: 0,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            if (isMuted) event.target.mute();
            if (!isLive) {
              event.target.seekTo(seekTime, true);
            }
            event.target.playVideo();
            setIsPaused(false);
            
            if (errorTimeout) {
              clearTimeout(errorTimeout);
              errorTimeout = null;
            }
            
            // Get actual video info from YouTube player (skip for live streams)
            if (!isLive) {
              try {
                const actualDuration = Math.floor(event.target.getDuration());
                const videoData = event.target.getVideoData();
                const actualTitle = videoData?.title;
                
                // Update local state with actual title if it's different and not generic
                if (actualTitle && currentVideo && actualTitle !== currentVideo.title) {
                  // Check if current title is generic (like "Video 123")
                  const isGenericTitle = /^Video \d+$/i.test(currentVideo.title);
                  
                  if (isGenericTitle) {
                    console.log(`Updating video title: "${currentVideo.title}" -> "${actualTitle}"`);
                    
                    // Update local state immediately for display
                    setCurrentVideo(prev => prev ? { ...prev, title: actualTitle } : prev);
                    
                    // Update in playlists state too
                    setPlaylists(prev => {
                      const updated = { ...prev };
                      if (currentChannel && updated[currentChannel.id]) {
                        updated[currentChannel.id] = updated[currentChannel.id].map(v => 
                          v.youtube_id === currentVideo.youtube_id ? { ...v, title: actualTitle } : v
                      );
                    }
                    return updated;
                  });
                  
                  // Save to backend if admin
                  if (isAdmin && currentChannel && currentVideo?.video_id) {
                    channelsAPI.updateVideo(currentChannel.id, currentVideo.video_id, { title: actualTitle })
                      .then(() => console.log('Saved video title to database'))
                      .catch(() => {});
                  }
                }
              }
              
              // Report actual duration to backend for self-healing
              if (actualDuration > 0 && currentChannel && currentVideo?.youtube_id) {
                videoCleanupAPI.updateSingleDuration(
                  currentChannel.id, 
                  currentVideo.youtube_id, 
                  actualDuration
                ).then(res => {
                  if (res.data.updated) {
                    console.log(`Updated video duration: ${actualDuration}s`);
                  }
                }).catch(() => {});
              }
            } catch (e) {
              console.error('Error getting video info:', e);
            }
            
              playbackCheckTimeout = setTimeout(() => {
                try {
                  const state = youtubePlayerRef.current?.getPlayerState();
                  if (state === -1 || state === 5) {
                    console.log('Video not playing after 5s, trying proxy...');
                    tryProxyFallback();
                  }
                } catch (e) {}
              }, 5000);
            } // end if (!isLive)
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              setIsPaused(false);
              if (playbackCheckTimeout) {
                clearTimeout(playbackCheckTimeout);
                playbackCheckTimeout = null;
              }
              if (ageRestrictionFallbackTimeout) {
                clearTimeout(ageRestrictionFallbackTimeout);
                ageRestrictionFallbackTimeout = null;
              }
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              setIsPaused(true);
            } else if (event.data === window.YT.PlayerState.ENDED) {
              // Live streams shouldn't trigger "ended" normally, but handle gracefully
              if (!isLive) {
                console.log('Video ended naturally');
                setIsPaused(false);
                playNextVideo();
              }
            }
          },
          onError: (event) => {
            console.error('YouTube error:', event.data, `(attempt ${retryAttempt + 1})`);
            // Error 150 = video unavailable/age-restricted in embed
            // Error 101 = video owner doesn't allow embed
            if (isLive) {
              toast.error('Live stream unavailable');
              return;
            }
            if ((event.data === 150 || event.data === 101) && retryAttempt === 0) {
              // Strategy 1: Retry with regular youtube.com host (some videos work there but not on nocookie)
              console.log('Retrying embed with youtube.com host...');
              retryAttempt = 1;
              if (youtubePlayerRef.current) {
                try { youtubePlayerRef.current.destroy(); } catch (e) {}
                youtubePlayerRef.current = null;
              }
              if (errorTimeout) { clearTimeout(errorTimeout); errorTimeout = null; }
              createPlayer('https://www.youtube.com');
            } else if (event.data === 150 || event.data === 101) {
              // Both embed hosts failed, try yt-dlp proxy
              console.log('Both embed hosts failed, trying proxy fallback...');
              toast.info(`Trying proxy: ${currentVideo?.title?.substring(0, 30)}...`);
              tryProxyFallback();
            } else {
              skipToNextVideo();
            }
          }
        }
      });

      if (!isLive) {
        errorTimeout = setTimeout(() => {
          console.log('Video timeout - trying proxy fallback');
          tryProxyFallback();
        }, 10000);
      }
    };

    // Start with nocookie host for regular videos, regular host for live streams
    createPlayer(isLive ? 'https://www.youtube.com' : 'https://www.youtube-nocookie.com');

    return () => {
      if (errorTimeout) clearTimeout(errorTimeout);
      if (playbackCheckTimeout) clearTimeout(playbackCheckTimeout);
      if (ageRestrictionFallbackTimeout) clearTimeout(ageRestrictionFallbackTimeout);
    };
  }, [currentVideo, seekTime, isMuted, isUploadedVideo, skipToNextVideo, playNextVideo, currentChannel, checkAndGetProxyUrl]);

  // Handle uploaded video playback
  useEffect(() => {
    if (!isUploadedVideo || !currentVideo || !videoRef.current) return;
    
    const video = videoRef.current;
    
    // Wait for video to be ready before attempting to play
    const handleCanPlay = () => {
      video.currentTime = seekTime;
      // Use a promise chain to avoid interruption errors
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPaused(false);
          })
          .catch(e => {
            // Only log if it's not an abort error (which happens during normal navigation)
            if (e.name !== 'AbortError') {
              console.log('Autoplay blocked:', e);
            }
          });
      }
    };
    
    // If video is already ready, play immediately
    if (video.readyState >= 3) {
      handleCanPlay();
    } else {
      // Otherwise wait for canplay event
      video.addEventListener('canplay', handleCanPlay, { once: true });
      // Also try to load the video
      video.load();
    }
    
    return () => {
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, [currentVideo, seekTime, isUploadedVideo]);

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (youtubePlayerRef.current) {
      if (isMuted) youtubePlayerRef.current.unMute();
      else youtubePlayerRef.current.mute();
    }
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
    if (proxyVideoRef.current) {
      proxyVideoRef.current.muted = !isMuted;
    }
  };

  const togglePlayPause = () => {
    setShowPlayPauseOSD(true);
    if (playPauseOsdTimeoutRef.current) clearTimeout(playPauseOsdTimeoutRef.current);
    playPauseOsdTimeoutRef.current = setTimeout(() => setShowPlayPauseOSD(false), 1000);

    if (youtubePlayerRef.current && !useProxyPlayer) {
      const playerState = youtubePlayerRef.current.getPlayerState();
      if (playerState === window.YT.PlayerState.PLAYING) {
        youtubePlayerRef.current.pauseVideo();
        setIsPaused(true);
      } else {
        youtubePlayerRef.current.playVideo();
        setIsPaused(false);
      }
    }
    if (proxyVideoRef.current && useProxyPlayer) {
      if (proxyVideoRef.current.paused) {
        proxyVideoRef.current.play().catch(() => {});
        setIsPaused(false);
      } else {
        proxyVideoRef.current.pause();
        setIsPaused(true);
      }
    }
    if (videoRef.current && isUploadedVideo) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
        setIsPaused(false);
      } else {
        videoRef.current.pause();
        setIsPaused(true);
      }
    }
  };

  const toggleFullscreen = () => {
    const player = playerRef.current;
    if (!player) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      player.requestFullscreen();
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleChannelNumberInput(e.key);
        return;
      }
      
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowUp':
          e.preventDefault();
          channelUp();
          break;
        case 'ArrowDown':
          e.preventDefault();
          channelDown();
          break;
        case 'm':
        case 'M':
          toggleMute();
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'l':
        case 'L':
          setShowChannelList(prev => !prev);
          break;
        case 'c':
        case 'C':
          setShowChannelChanger(prev => !prev);
          break;
        case 'a':
        case 'A':
          if (isAdmin) setShowAdminPanel(prev => !prev);
          break;
        case 'Escape':
          setChannelInput('');
          setShowChannelOSD(false);
          break;
        default:
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [channels, currentChannel, isAdmin, isMuted, channelInput]);

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true
    });
  };

  // Get upcoming videos from playlist or schedule
  const getUpcomingVideos = () => {
    if (!currentChannel) return [];
    
    // For scheduled channels, use schedule
    const schedule = schedules[currentChannel.id];
    if (schedule && schedule.length > 0) {
      const playable = schedule.filter(v => !failedVideoIds.has(v.youtube_id));
      if (playable.length === 0) return [];
      
      const currentIdx = playable.findIndex(v => v.video_id === currentVideo?.video_id);
      const upcoming = [];
      
      for (let i = 1; i <= 3; i++) {
        const idx = (currentIdx + i) % playable.length;
        upcoming.push(playable[idx]);
      }
      
      return upcoming;
    }
    
    // For regular channels, use playlist
    if (!playlists[currentChannel.id]) return [];
    
    const playlist = playlists[currentChannel.id];
    const playable = playlist.filter(v => !failedVideoIds.has(v.youtube_id));
    
    if (playable.length === 0) return [];
    
    const currentIdx = playable.findIndex(v => v.video_id === currentVideo?.video_id);
    const upcoming = [];
    
    for (let i = 1; i <= 3; i++) {
      const idx = (currentIdx + i) % playable.length;
      upcoming.push(playable[idx]);
    }
    
    return upcoming;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Radio size={48} className="mx-auto mb-4 text-primary animate-pulse" />
          <p className="text-gray-400">Loading Live TV...</p>
        </div>
      </div>
    );
  }

  const upcomingVideos = getUpcomingVideos();

  return (
    <div className="min-h-screen bg-black text-white flex" data-testid="live-tv-page">
      {/* Channel Sidebar */}
      {showChannelList && (
        <div className="w-72 bg-[#0a0a0f] border-r border-white/10 flex flex-col h-screen overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Tv size={20} className="text-primary" />
                Channels
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowChannelList(false)}
                className="h-8 w-8"
              >
                <X size={16} />
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
              <Calendar size={12} />
              <span>Playlist: {scheduleDate}</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {channels.map((channel, index) => {
              const isActive = currentChannel?.id === channel.id;
              
              return (
                <button
                  key={channel.id}
                  onClick={() => selectChannel(channel)}
                  className={`w-full p-3 flex items-center gap-3 transition-colors ${
                    isActive 
                      ? 'bg-primary/20 border-l-2 border-primary' 
                      : 'hover:bg-white/5 border-l-2 border-transparent'
                  }`}
                  data-testid={`channel-${channel.id}`}
                >
                  <div className="relative w-12 h-12 rounded overflow-hidden bg-primary/20 flex-shrink-0">
                    {channel.thumbnail && (
                      <img 
                        src={channel.thumbnail.startsWith('/api') 
                          ? `${BACKEND_URL}${channel.thumbnail}` 
                          : channel.thumbnail
                        }
                        alt={channel.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                    {!channel.thumbnail && (
                      <div className="w-full h-full flex items-center justify-center">
                        <Tv size={20} className="text-primary/50" />
                      </div>
                    )}
                    {isActive && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium text-sm truncate">{channel.name}</p>
                    <p className="text-xs text-gray-500">
                      {channel.is_live_stream ? (
                        <span className="text-red-400 font-medium">LIVE STREAM</span>
                      ) : (
                        `${channel.videoCount} videos`
                      )}
                    </p>
                  </div>
                  <span className="text-xs text-gray-600">{index + 1}</span>
                </button>
              );
            })}
          </div>
          
          <div className="p-3 border-t border-white/10 text-xs text-gray-500">
            <p>↑↓ Switch • 0-9 Go to • C Remote</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`flex-1 flex flex-col ${isFullscreen ? 'w-screen h-screen' : ''}`}>
        <div 
          className={`flex-1 relative bg-black ${isFullscreen ? 'w-full h-full' : ''}`} 
          ref={playerRef}
        >
          {!showChannelList && !isFullscreen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowChannelList(true)}
              className="absolute top-4 left-4 z-20 bg-black/50 hover:bg-black/70"
            >
              <List size={20} />
            </Button>
          )}

          {currentVideo?.youtube_id && !isUploadedVideo && !useProxyPlayer && (
            <div className={`relative ${isFullscreen ? 'w-full h-full' : 'w-full h-full'}`}>
              <div 
                id="youtube-player" 
                className={`${isFullscreen ? 'w-full h-full' : 'w-full h-full'}`}
              />
              <div 
                className="absolute inset-0 z-10 cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  togglePlayPause();
                }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                data-testid="video-lock-overlay"
              />
            </div>
          )}

          {/* Proxy video player for age-restricted content */}
          {currentVideo?.youtube_id && !isUploadedVideo && useProxyPlayer && proxyVideoUrl && (
            <div className="relative w-full h-full">
              <video
                ref={proxyVideoRef}
                src={proxyVideoUrl}
                className="w-full h-full object-contain"
                autoPlay
                muted={isMuted}
                playsInline
                onEnded={playNextVideo}
                onError={() => {
                  console.error('Proxy video error');
                  toast.error('Failed to play via proxy');
                  skipToNextVideo();
                }}
                onPlay={() => setIsPaused(false)}
                onPause={() => setIsPaused(true)}
              />
              <div 
                className="absolute inset-0 z-10 cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Toggle play/pause for proxy video
                  if (proxyVideoRef.current) {
                    if (proxyVideoRef.current.paused) {
                      proxyVideoRef.current.play();
                      setIsPaused(false);
                    } else {
                      proxyVideoRef.current.pause();
                      setIsPaused(true);
                    }
                  }
                }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleFullscreen();
                }}
              />
            </div>
          )}

          {isUploadedVideo && currentVideo && (
            <div className="relative w-full h-full">
              {console.log('Rendering uploaded video:', currentVideo?.title, 'URL:', currentVideo?.video_url)}
              <video
                ref={videoRef}
                src={
                  currentVideo.video_url?.startsWith('http') 
                    ? currentVideo.video_url 
                    : currentVideo.video_url 
                      ? `${BACKEND_URL}${currentVideo.video_url}`
                      : null
                }
                className="w-full h-full object-contain"
                autoPlay
                muted={isMuted}
                playsInline
                onEnded={playNextVideo}
                onError={(e) => {
                  console.error('Video error:', e.target.error, 'src:', e.target.src);
                  // Skip to next video on error
                  playNextVideo();
                }}
                onLoadedData={() => {
                  console.log('Video loaded, attempting play');
                  // Video loaded, try to play
                  if (videoRef.current && !isPaused) {
                    videoRef.current.play().catch((e) => console.log('Play failed:', e));
                  }
                }}
                onCanPlay={() => console.log('Video can play')}
              />
              <div 
                className="absolute inset-0 z-10 cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  togglePlayPause();
                }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleFullscreen();
                }}
              />
            </div>
          )}

          {!currentVideo && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Tv size={64} className="mx-auto mb-4 text-gray-600" />
                <p className="text-gray-400">Select a channel to start watching</p>
              </div>
            </div>
          )}

          {showPlayPauseOSD && currentVideo && (
            <div className={`${isFullscreen ? 'fixed' : 'absolute'} top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none`}>
              <div className="bg-black/80 backdrop-blur-sm rounded-full p-6">
                {isPaused ? (
                  <Pause size={48} className="text-white" fill="white" />
                ) : (
                  <Play size={48} className="text-white ml-1" fill="white" />
                )}
              </div>
            </div>
          )}

          {currentChannel && currentVideo && (
            <div className={`${isFullscreen ? 'fixed' : 'absolute'} top-4 right-4 bg-black/70 backdrop-blur-sm rounded-lg p-3 max-w-sm z-40 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0'}`}>
              <div className="flex items-center gap-2 mb-2">
                {isPaused ? (
                  <>
                    <Pause size={12} className="text-yellow-400" />
                    <span className="text-xs text-yellow-400 font-medium">PAUSED</span>
                  </>
                ) : isCurrentChannelLiveStream ? (
                  <>
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-xs text-red-400 font-medium">LIVE STREAM</span>
                  </>
                ) : isCurrentChannelScheduled ? (
                  <>
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-xs text-red-400 font-medium">LIVE</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-xs text-green-400 font-medium">PLAYING</span>
                  </>
                )}
                <span className="text-xs text-gray-400">
                  {formatTime(currentTime)}
                </span>
              </div>
              <p className="font-medium text-sm">{currentChannel.name}</p>
              <p className="text-xs text-gray-400 truncate mt-1">{currentVideo.title}</p>
              {currentVideo.duration && !isCurrentChannelLiveStream && (
                <p className="text-xs text-gray-500 mt-1">
                  Duration: {Math.floor(currentVideo.duration / 60)}:{(currentVideo.duration % 60).toString().padStart(2, '0')}
                </p>
              )}
            </div>
          )}

          {showChannelOSD && currentChannel && (
            <div className={`${isFullscreen ? 'fixed' : 'absolute'} top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none`}>
              <div className="bg-black/90 backdrop-blur-sm rounded-xl p-6 text-center min-w-[200px]">
                <div className="text-6xl font-bold text-primary mb-2">
                  {channelInput || (getCurrentChannelIndex() + 1)}
                </div>
                <p className="text-lg font-medium text-white">
                  {channelInput ? 'Entering...' : currentChannel.name}
                </p>
                {!channelInput && currentVideo && (
                  <p className="text-sm text-gray-400 mt-1 truncate max-w-[250px]">
                    {currentVideo.title}
                  </p>
                )}
              </div>
            </div>
          )}

          {showChannelChanger && (
            <div 
              className={`${isFullscreen ? 'fixed bottom-24 right-6' : 'absolute bottom-20 right-4'} z-50 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
              data-testid="channel-changer"
            >
              <div className="bg-[#12121a]/95 backdrop-blur-sm border border-white/10 rounded-xl p-3 flex flex-col items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={channelUp}
                  className="h-10 w-10 rounded-full hover:bg-primary/20 hover:text-primary"
                  data-testid="channel-up"
                >
                  <ChevronUp size={24} />
                </Button>
                
                <div 
                  className="w-14 h-14 rounded-lg bg-black flex items-center justify-center cursor-pointer hover:bg-white/5"
                  onClick={showOSD}
                  data-testid="channel-number-display"
                >
                  <span className="text-2xl font-bold text-primary">
                    {channelInput || (getCurrentChannelIndex() + 1)}
                  </span>
                </div>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={channelDown}
                  className="h-10 w-10 rounded-full hover:bg-primary/20 hover:text-primary"
                  data-testid="channel-down"
                >
                  <ChevronDown size={24} />
                </Button>
                
                <span className="text-[10px] text-gray-500">
                  of {channels.length}
                </span>
              </div>
            </div>
          )}

          <div className={`${isFullscreen ? 'fixed' : 'absolute'} bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 z-40 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  className="hover:bg-white/10"
                >
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </Button>
                {isFullscreen && (
                  <span className="text-sm text-gray-400 ml-2">
                    Press C to toggle remote • ↑↓ to change channels
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {isAdmin && !isFullscreen && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAdminPanel(!showAdminPanel)}
                    className="hover:bg-white/10"
                  >
                    <Settings size={16} className="mr-1" />
                    Admin
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleFullscreen}
                  className="hover:bg-white/10"
                >
                  <Maximize size={20} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {currentChannel && upcomingVideos.length > 0 && !isCurrentChannelLiveStream && (
          <div className="bg-[#0a0a0f] border-t border-white/10 p-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
                <Clock size={14} />
                <span>Up Next</span>
              </div>
              <div className="flex gap-3 overflow-x-auto">
                {upcomingVideos.map((video, idx) => (
                  <div 
                    key={`${video.video_id}-${idx}`}
                    className="flex items-center gap-2 bg-white/5 rounded px-2 py-1 shrink-0"
                  >
                    <span className="text-xs text-gray-300 truncate max-w-[200px]">
                      {video.title}
                    </span>
                    {video.duration && (
                      <span className="text-xs text-gray-500">
                        ({Math.floor(video.duration / 60)}m)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {showAdminPanel && isAdmin && (
        <div className="w-80 bg-[#0a0a0f] border-l border-white/10 p-4 h-screen overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2">
              <Settings size={18} className="text-primary" />
              Admin Panel
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowAdminPanel(false)}
              className="h-8 w-8"
            >
              <X size={16} />
            </Button>
          </div>
          
          <div className="space-y-4">
            <Button
              onClick={() => navigate('/dashboard')}
              className="w-full bg-primary hover:bg-primary/90"
            >
              <Settings size={16} className="mr-2" />
              Dashboard
            </Button>
            
            <Button
              onClick={() => navigate('/schedule')}
              variant="outline"
              className="w-full border-cyan-500/50 text-cyan-400"
            >
              <Calendar size={16} className="mr-2" />
              TV Guide
            </Button>
            
            {currentChannel && (
              <Button
                onClick={() => navigate(`/edit/${currentChannel.id}`)}
                variant="outline"
                className="w-full"
              >
                <Edit size={16} className="mr-2" />
                Edit Channel
              </Button>
            )}
            
            <Button
              onClick={() => navigate('/create')}
              variant="outline"
              className="w-full"
            >
              <Plus size={16} className="mr-2" />
              Create Channel
            </Button>
          </div>
          
          <div className="mt-6 p-3 bg-white/5 rounded-lg text-xs text-gray-400">
            <p className="font-medium text-gray-300 mb-2">Playlist Info</p>
            <p>Date: {scheduleDate}</p>
            <p className="mt-2">Randomized daily playlist</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveTV;
