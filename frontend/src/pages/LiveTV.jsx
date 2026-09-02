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
  const [showChannelList, setShowChannelList] = useState(window.innerWidth >= 768); // Start collapsed on mobile
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [scheduleDate, setScheduleDate] = useState('');
  const [showChannelChanger, setShowChannelChanger] = useState(true);
  const [channelInput, setChannelInput] = useState('');
  const [showChannelOSD, setShowChannelOSD] = useState(false);
  const [showPlayPauseOSD, setShowPlayPauseOSD] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [failedVideoIds, setFailedVideoIds] = useState(new Set());
  const [sessionStartTime, setSessionStartTime] = useState(null); // When user started watching
  const [useProxyPlayer, setUseProxyPlayer] = useState(false); // Whether to use proxy for current video
  const [proxyVideoUrl, setProxyVideoUrl] = useState(null); // Direct video URL from proxy
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768); // Mobile detection
  
  // Commercial break state
  const [commercials, setCommercials] = useState([]); // Commercials for current channel
  const [isCommercialBreak, setIsCommercialBreak] = useState(false);
  const [currentCommercialIndex, setCurrentCommercialIndex] = useState(0);
  const [commercialBreakVideos, setCommercialBreakVideos] = useState([]); // 3 random commercials
  const [pendingNextVideo, setPendingNextVideo] = useState(null); // Video to play after commercials
  const commercialVideoRef = useRef(null);
  const COMMERCIALS_PER_BREAK = 3;
  
  const playerRef = useRef(null);
  const pageRef = useRef(null);
  const videoRef = useRef(null);
  const youtubePlayerRef = useRef(null);
  const proxyVideoRef = useRef(null); // For proxy video player
  const channelInputTimeoutRef = useRef(null);
  const osdTimeoutRef = useRef(null);
  const playPauseOsdTimeoutRef = useRef(null);
  const seekTimeRef = useRef(0);
  const isMutedRef = useRef(false);

  // Auto-hide controls after inactivity
  const CONTROLS_HIDE_DELAY = 3000;
  const isPausedRef = useRef(isPaused);
  const showControlsTriggerRef = useRef(() => {});
  
  // Detect mobile screen resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  useEffect(() => {
    isPausedRef.current = isPaused;
    if (isPaused) {
      setControlsVisible(true);
    }
  }, [isPaused]);

  // Keep refs in sync with state - these run before player effects
  useEffect(() => { seekTimeRef.current = seekTime; }, [seekTime]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  useEffect(() => {
    let hideTimeout = null;
    
    const showAndStartTimer = () => {
      setControlsVisible(true);
      if (hideTimeout) clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        if (!isPausedRef.current) setControlsVisible(false);
      }, CONTROLS_HIDE_DELAY);
    };
    
    showControlsTriggerRef.current = showAndStartTimer;
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
      const nowFs = !!document.fullscreenElement;
      setIsFullscreen(nowFs);
      // Briefly reveal channel tab + controls when entering/exiting fullscreen,
      // then auto-hide via the existing controls timer.
      showControlsTriggerRef.current?.();
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
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    
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
      
      // Respect ?channel=<id> query param (e.g. coming from TV Guide page).
      // Fallback to first channel if param is missing or invalid.
      if (channelList.length > 0) {
        const params = new URLSearchParams(window.location.search);
        const wantedId = params.get('channel');
        const target = wantedId ? channelList.find((c) => c.id === wantedId) : null;
        selectChannel(target || channelList[0], playlistMap, scheduleMap, Date.now());
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
    
    // Reset commercial time tracking when changing channels
    // Reset commercial state when changing channels
    setIsCommercialBreak(false);
    setCommercialBreakVideos([]);
    setPendingNextVideo(null);
    
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

  // Fetch commercials when channel changes
  useEffect(() => {
    if (!currentChannel) return;

    // Clear previous channel's commercials immediately so a break firing during
    // the fetch cannot leak ads from the previously-tuned channel.
    setCommercials([]);

    const fetchCommercials = async () => {
      const channelIdAtStart = currentChannel.id;
      try {
        const response = await fetch(`${BACKEND_URL}/api/channels/${channelIdAtStart}/commercials`);
        // If the user switched channels again while we were fetching, drop this response.
        if (channelIdAtStart !== currentChannel.id) return;
        if (response.ok) {
          const data = await response.json();
          setCommercials(data);
          console.log(`Loaded ${data.length} commercials for ${currentChannel.name}`);
        } else {
          setCommercials([]);
        }
      } catch (error) {
        console.error('Failed to fetch commercials:', error);
        setCommercials([]);
      }
    };

    fetchCommercials();
  }, [currentChannel?.id]);

  // Start commercial break before playing next video
  const startCommercialBreak = useCallback((nextVideoData) => {
    if (commercials.length === 0) {
      // No commercials available, just play next video directly
      if (nextVideoData) {
        console.log('No commercials, playing next video directly:', nextVideoData.video.title);
        setCurrentVideoIndex(nextVideoData.index);
        setCurrentVideo(nextVideoData.video);
        setSeekTime(0);
      }
      return;
    }
    
    // Store the next video to play after commercials
    setPendingNextVideo(nextVideoData);
    
    // Select random commercials (up to 3)
    const shuffled = [...commercials].sort(() => Math.random() - 0.5);
    const selectedCommercials = shuffled.slice(0, Math.min(COMMERCIALS_PER_BREAK, commercials.length));
    
    console.log(`Starting commercial break with ${selectedCommercials.length} commercials, next video: ${nextVideoData?.video?.title}`);
    
    setCommercialBreakVideos(selectedCommercials);
    setCurrentCommercialIndex(0);
    setIsCommercialBreak(true);
    
    // Track first commercial play
    if (selectedCommercials.length > 0 && currentChannel) {
      try {
        analyticsAPI.recordCommercial(
          selectedCommercials[0].id,
          currentChannel.id,
          getViewerId(),
          'play'
        );
      } catch (e) {
        console.log('Failed to track commercial play:', e);
      }
    }
    
    // Pause any playing video
    if (videoRef.current) videoRef.current.pause();
    if (youtubePlayerRef.current?.pauseVideo) youtubePlayerRef.current.pauseVideo();
    if (proxyVideoRef.current) proxyVideoRef.current.pause();
    
  }, [commercials]);

  // End commercial break and play the next video
  const endCommercialBreak = useCallback(() => {
    console.log('Commercial break ended');
    
    // Clear commercial state
    setIsCommercialBreak(false);
    setCommercialBreakVideos([]);
    setCurrentCommercialIndex(0);
    setIsPaused(false);
    
    // Play the pending next video
    if (pendingNextVideo) {
      console.log('Playing next video:', pendingNextVideo.video.title);
      setCurrentVideoIndex(pendingNextVideo.index);
      setCurrentVideo(pendingNextVideo.video);
      setSeekTime(0);
      setPendingNextVideo(null);
    }
  }, [pendingNextVideo]);

  // Handle commercial video ended
  const handleCommercialEnded = useCallback(() => {
    // Track commercial completion
    const currentCommercial = commercialBreakVideos[currentCommercialIndex];
    if (currentCommercial && currentChannel) {
      try {
        analyticsAPI.recordCommercial(
          currentCommercial.id,
          currentChannel.id,
          getViewerId(),
          'complete'
        );
      } catch (e) {
        console.log('Failed to track commercial complete:', e);
      }
    }
    
    const nextIndex = currentCommercialIndex + 1;
    
    if (nextIndex < commercialBreakVideos.length) {
      // Play next commercial - track the play event
      setCurrentCommercialIndex(nextIndex);
      const nextCommercial = commercialBreakVideos[nextIndex];
      if (nextCommercial && currentChannel) {
        try {
          analyticsAPI.recordCommercial(
            nextCommercial.id,
            currentChannel.id,
            getViewerId(),
            'play'
          );
        } catch (e) {
          console.log('Failed to track commercial play:', e);
        }
      }
    } else {
      // Commercial break ended - resume regular video
      endCommercialBreak();
    }
  }, [currentCommercialIndex, commercialBreakVideos, currentChannel, endCommercialBreak]);

  // Track video events for analytics
  const trackVideoEvent = useCallback((eventType) => {
    if (!currentChannel || !currentVideo) return;
    try {
      analyticsAPI.recordView(
        currentChannel.id, getViewerId(),
        currentVideo.video_id || currentVideo.youtube_id || '',
        currentVideo.title || '',
        eventType
      );
    } catch (e) {}
  }, [currentChannel, currentVideo]);

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
  // Now triggers commercials before playing the next video
  const playNextVideo = useCallback(() => {
    if (!currentChannel) return;
    trackVideoEvent('complete');  // Track video completion
    
    let nextVideoData = null;
    
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
      nextVideoData = { video: nextVideo, index: nextSlotIndex };
      console.log('[SCHEDULED] Video ended, queuing next:', nextVideo.title);
    } else {
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
      nextVideoData = { video: nextVideo, index: actualIndex };
      console.log('Video ended, queuing next:', nextVideo.title);
    }
    
    // Start commercial break (will play next video after commercials)
    // If no commercials, startCommercialBreak will play the video directly
    if (nextVideoData) {
      startCommercialBreak(nextVideoData);
    }
  }, [currentChannel, playlists, schedules, currentVideo, failedVideoIds, startCommercialBreak]);

  // Skip to next video (for unavailable videos). Never auto-deletes from DB;
  // admins can use "Run Cleanup" in the admin panel to bulk-remove unplayable
  // videos on demand.
  const skipToNextVideo = useCallback(async () => {
    if (!currentChannel) return;
    trackVideoEvent('skip');  // Track video skip
    
    const playlist = playlists[currentChannel.id] || [];
    const schedule = schedules[currentChannel.id];
    
    // Mark current video as failed so we don't retry it this session
    if (currentVideo?.youtube_id) {
      setFailedVideoIds(prev => new Set(prev).add(currentVideo.youtube_id));
      console.log('Skipping unplayable video (auto-delete disabled):', currentVideo.title);
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
  }, [currentChannel, playlists, schedules, currentVideo, failedVideoIds]);

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

  // Store callbacks in refs to avoid triggering useEffect
  const skipToNextVideoRef = useRef(skipToNextVideo);
  const playNextVideoRef = useRef(playNextVideo);
  const checkAndGetProxyUrlRef = useRef(checkAndGetProxyUrl);
  const trackVideoEventRef = useRef(trackVideoEvent);
  useEffect(() => { skipToNextVideoRef.current = skipToNextVideo; }, [skipToNextVideo]);
  useEffect(() => { playNextVideoRef.current = playNextVideo; }, [playNextVideo]);
  useEffect(() => { checkAndGetProxyUrlRef.current = checkAndGetProxyUrl; }, [checkAndGetProxyUrl]);
  useEffect(() => { trackVideoEventRef.current = trackVideoEvent; }, [trackVideoEvent]);

  // Initialize YouTube player when video changes
  useEffect(() => {
    const videoId = currentVideo?.youtube_id;
    if (!videoId || isUploadedVideo) return;
    
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
        skipToNextVideoRef.current();
        return;
      }
      console.log('Trying proxy fallback...');
      
      try {
        const proxyUrl = await checkAndGetProxyUrlRef.current(currentVideo.youtube_id);
        if (proxyUrl) {
          console.log('Got proxy URL, switching to proxy player');
          setProxyVideoUrl(proxyUrl);
          setUseProxyPlayer(true);
        } else {
          console.log('Proxy unavailable, skipping');
          skipToNextVideoRef.current();
        }
      } catch (e) {
        console.error('Proxy fallback failed:', e);
        skipToNextVideoRef.current();
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
          start: isLive ? undefined : Math.floor(seekTimeRef.current),
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
            if (isMutedRef.current) event.target.mute();
            if (!isLive) {
              event.target.seekTo(seekTimeRef.current, true);
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
                
                // Report actual duration to backend for self-healing (doesn't trigger re-render)
                if (actualDuration > 0 && currentVideo?.youtube_id) {
                  videoCleanupAPI.updateSingleDuration(
                    currentChannel?.id, 
                    currentVideo.youtube_id, 
                    actualDuration
                  ).catch(() => {});
                }
            } catch (e) {
              console.error('Error getting video info:', e);
            }
            
              playbackCheckTimeout = setTimeout(() => {
                try {
                  const state = youtubePlayerRef.current?.getPlayerState();
                  if (state === -1 || state === 5) {
                    console.log('Video not playing after 12s, trying proxy...');
                    tryProxyFallback();
                  }
                } catch (e) {}
              }, 12000);
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
                playNextVideoRef.current();
              }
            }
          },
          onError: (event) => {
            console.error('YouTube error:', event.data, `(attempt ${retryAttempt + 1})`);
            // Error 150 = video unavailable/age-restricted in embed
            // Error 101 = video owner doesn't allow embed
            if (isLive) {
              skipToNextVideoRef.current();
              return;
            }
            if ((event.data === 150 || event.data === 101) && retryAttempt === 0) {
              // Strategy 1: Retry with regular youtube.com host (some videos work there but not on nocookie)
              console.log('Retrying embed with youtube.com host...');
              retryAttempt = 1;
              // Clear ALL timeouts before retry
              if (errorTimeout) { clearTimeout(errorTimeout); errorTimeout = null; }
              if (playbackCheckTimeout) { clearTimeout(playbackCheckTimeout); playbackCheckTimeout = null; }
              if (ageRestrictionFallbackTimeout) { clearTimeout(ageRestrictionFallbackTimeout); ageRestrictionFallbackTimeout = null; }
              if (youtubePlayerRef.current) {
                try { youtubePlayerRef.current.destroy(); } catch (e) {}
                youtubePlayerRef.current = null;
              }
              createPlayer('https://www.youtube.com');
            } else if (event.data === 150 || event.data === 101) {
              // Both embed hosts failed, try yt-dlp proxy silently
              console.log('Both embed hosts failed, trying proxy fallback...');
              tryProxyFallback();
            } else {
              skipToNextVideoRef.current();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVideo?.youtube_id, currentVideo?.video_id, isUploadedVideo]);

  // Handle uploaded video playback — serialized seek-then-play to avoid
  // hardware-decoder races on Android Chrome (frozen video / running audio).
  useEffect(() => {
    if (!isUploadedVideo || !currentVideo || !videoRef.current) return;

    const video = videoRef.current;
    let cancelled = false;

    const seekAndPlay = async () => {
      const seek = seekTimeRef.current;

      // 1. Wait for metadata (duration must be known before seeking)
      if (video.readyState < 1) {
        await new Promise((resolve) => {
          const onMeta = () => {
            video.removeEventListener('loadedmetadata', onMeta);
            resolve();
          };
          video.addEventListener('loadedmetadata', onMeta);
        });
      }
      if (cancelled) return;

      // 2. Seek if needed, then wait for the seek to complete before calling play().
      // Calling play() while the HW decoder is mid-seek is what causes the
      // "video frozen / audio plays" symptom on Android Chrome.
      if (seek > 0 && Math.abs(video.currentTime - seek) > 2) {
        await new Promise((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
          try {
            video.currentTime = seek;
          } catch (e) {
            // If seek fails, just play from current position.
            video.removeEventListener('seeked', onSeeked);
            resolve();
          }
        });
      }
      if (cancelled) return;

      // 3. Now play.
      try {
        await video.play();
        if (!cancelled) setIsPaused(false);
      } catch (e) {
        if (e?.name !== 'AbortError') {
          console.log('Play failed:', e);
        }
      }
    };

    seekAndPlay();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVideo?.video_id, currentVideo?.video_url, isUploadedVideo]);

  // Stall watchdog DISABLED — was causing false-positive recovery seeks that
  // produced the "plays a few seconds, jumps back" loop on production. Kept
  // the early-return so the rest of the file is otherwise unchanged. If a
  // real freeze happens, the user can manually click play / change channels.
  useEffect(() => {
    if (!isUploadedVideo || !currentVideo || !videoRef.current) return;
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVideo?.video_id, currentVideo?.video_url, isUploadedVideo]);

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
    const target = pageRef.current || playerRef.current;
    if (!target) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      target.requestFullscreen();
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

  // Close sidebar when selecting channel on mobile
  const handleChannelSelect = (channel) => {
    selectChannel(channel);
    if (isMobile) {
      setShowChannelList(false);
    }
  };

  return (
    <div ref={pageRef} className="min-h-screen bg-black text-white flex flex-col md:flex-row" data-testid="live-tv-page">
      {/* Channel Sidebar - Overlay on mobile & fullscreen, fixed sidebar on desktop */}
      {showChannelList && (
        <>
          {/* Overlay backdrop (mobile or fullscreen) */}
          {(isMobile || isFullscreen) && (
            <div 
              className="fixed inset-0 bg-black/70 z-40"
              onClick={() => setShowChannelList(false)}
            />
          )}
          <div className={`
            ${(isMobile || isFullscreen)
              ? 'fixed inset-y-0 left-0 z-50 w-[280px] animate-in slide-in-from-left duration-200' 
              : 'w-72 relative'
            }
            bg-[#0a0a0f] border-r border-white/10 flex flex-col h-screen overflow-hidden
          `}>
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
                    onClick={() => handleChannelSelect(channel)}
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
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      )}
                      <div className="absolute inset-0 -z-10 flex items-center justify-center">
                        <Tv size={20} className="text-primary/50" />
                      </div>
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
            
            <div className="p-3 border-t border-white/10 text-xs text-gray-500 hidden md:block">
              <p>↑↓ Switch • 0-9 Go to • C Remote</p>
            </div>
          </div>
        </>
      )}

      {/* Main Content */}
      <div className={`flex-1 flex flex-col ${isFullscreen ? 'w-screen h-screen' : ''}`}>
        <div 
          className={`flex-1 relative bg-black ${isFullscreen ? 'w-full h-full' : isMobile ? 'h-[60vh]' : ''}`} 
          ref={playerRef}
        >
          {/* Sidebar toggle - visible in all modes (mobile/desktop, fullscreen too), auto-hides with controls */}
          {!showChannelList && (
            <Button
              variant="ghost"
              onClick={() => setShowChannelList(true)}
              className={`${isFullscreen ? 'fixed' : 'absolute'} top-4 left-4 z-50 h-11 px-3 rounded-xl bg-[#12121a]/95 backdrop-blur-sm border border-white/10 text-white hover:bg-primary/20 hover:text-primary transition-opacity duration-300 flex items-center gap-2 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              data-testid="channels-list-toggle"
            >
              <List size={18} />
              <span className="text-sm font-medium">Channels</span>
            </Button>
          )}

          {/* Commercial Break Player */}
          {isCommercialBreak && commercialBreakVideos.length > 0 && (
            <div className="absolute inset-0 z-50 bg-black">
              {/* Commercial video — quieter than program audio */}
              <video
                ref={commercialVideoRef}
                src={commercialBreakVideos[currentCommercialIndex]?.url}
                className="w-full h-full object-contain"
                autoPlay
                muted={isMuted}
                playsInline
                onLoadedData={(e) => { try { e.target.volume = 0.6; } catch (_) {} }}
                onEnded={handleCommercialEnded}
                onError={handleCommercialEnded}
              />
              
              {/* Commercial overlay info */}
              <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 z-10">
                <div className="flex items-center gap-2 text-xs text-yellow-400">
                  <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                  COMMERCIAL {currentCommercialIndex + 1} of {commercialBreakVideos.length}
                </div>
              </div>
              
              {/* Commercial progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                <div 
                  className="h-full bg-yellow-400 transition-all duration-100"
                  style={{ 
                    width: `${((currentCommercialIndex + 1) / commercialBreakVideos.length) * 100}%` 
                  }}
                />
              </div>
            </div>
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
                preload="auto"
                muted={isMuted}
                playsInline
                onEnded={playNextVideo}
                onError={(e) => {
                  console.error('Video error:', e.target.error, 'src:', e.target.src);
                  skipToNextVideo();
                }}
                onWaiting={() => setIsBuffering(true)}
                onPlaying={() => setIsBuffering(false)}
              />
              {isBuffering && (
                <div className="absolute inset-0 flex items-center justify-center z-5 pointer-events-none">
                  <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}
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

          {/* Now Playing OSD - Responsive */}
          {currentChannel && currentVideo && (
            <div className={`${isFullscreen ? 'fixed' : 'absolute'} ${isMobile ? 'top-12 right-2 max-w-[200px] p-2' : 'top-4 right-4 max-w-sm p-3'} bg-black/70 backdrop-blur-sm rounded-lg z-40 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} data-testid="now-playing-osd">
              <div className="flex items-center gap-2 mb-1 md:mb-2">
                {isPaused ? (
                  <>
                    <Pause size={isMobile ? 10 : 12} className="text-yellow-400" />
                    <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-yellow-400 font-medium`}>PAUSED</span>
                  </>
                ) : isCurrentChannelLiveStream ? (
                  <>
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-red-400 font-medium`}>LIVE STREAM</span>
                  </>
                ) : isCurrentChannelScheduled ? (
                  <>
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-red-400 font-medium`}>LIVE</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-green-400 font-medium`}>PLAYING</span>
                  </>
                )}
                <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-400`}>
                  {formatTime(currentTime)}
                </span>
              </div>
              <p className={`font-medium ${isMobile ? 'text-xs' : 'text-sm'}`}>{currentChannel.name}</p>
              <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-400 truncate mt-1`}>{currentVideo.title}</p>
              {currentVideo.duration && !isCurrentChannelLiveStream && (
                <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-500 mt-1`}>
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

          {/* Channel Changer - Responsive positioning */}
          {showChannelChanger && (
            <div 
              className={`${isFullscreen ? 'fixed bottom-24 right-6' : 'absolute'} ${isMobile ? 'bottom-16 right-2' : 'bottom-20 right-4'} z-50 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
              data-testid="channel-changer"
            >
              <div className={`bg-[#12121a]/95 backdrop-blur-sm border border-white/10 rounded-xl ${isMobile ? 'p-2' : 'p-3'} flex flex-col items-center gap-1 md:gap-2`}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={channelUp}
                  className={`${isMobile ? 'h-8 w-8' : 'h-10 w-10'} rounded-full hover:bg-primary/20 hover:text-primary`}
                  data-testid="channel-up"
                >
                  <ChevronUp size={isMobile ? 20 : 24} />
                </Button>
                
                <div 
                  className={`${isMobile ? 'w-10 h-10' : 'w-14 h-14'} rounded-lg bg-black flex items-center justify-center cursor-pointer hover:bg-white/5`}
                  onClick={showOSD}
                  data-testid="channel-number-display"
                >
                  <span className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-primary`}>
                    {channelInput || (getCurrentChannelIndex() + 1)}
                  </span>
                </div>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={channelDown}
                  className={`${isMobile ? 'h-8 w-8' : 'h-10 w-10'} rounded-full hover:bg-primary/20 hover:text-primary`}
                  data-testid="channel-down"
                >
                  <ChevronDown size={isMobile ? 20 : 24} />
                </Button>
                
                <span className="text-[10px] text-gray-500">
                  of {channels.length}
                </span>
              </div>
            </div>
          )}

          {/* Bottom Controls - Responsive */}
          <div className={`${isFullscreen ? 'fixed' : 'absolute'} bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent ${isMobile ? 'p-2' : 'p-4'} z-40 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 md:gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  className={`hover:bg-white/10 ${isMobile ? 'h-8 w-8' : ''}`}
                >
                  {isMuted ? <VolumeX size={isMobile ? 16 : 20} /> : <Volume2 size={isMobile ? 16 : 20} />}
                </Button>
                {isFullscreen && !isMobile && (
                  <span className="text-sm text-gray-400 ml-2">
                    Press C to toggle remote • ↑↓ to change channels
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-1 md:gap-2">
                {isAdmin && !isFullscreen && !isMobile && (
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
                  onClick={toggleFullscreen}
                  className={`hover:bg-white/10 flex items-center gap-1 ${isMobile ? 'h-8 px-2' : 'h-9 px-3'}`}
                  data-testid="fullscreen-toggle"
                >
                  <Maximize size={isMobile ? 16 : 20} />
                  <span className={`${isMobile ? 'text-[11px]' : 'text-sm'} font-medium`}>
                    {isFullscreen ? 'Exit' : 'FullScreen'}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Up Next Section - Responsive */}
        {currentChannel && upcomingVideos.length > 0 && !isCurrentChannelLiveStream && (
          <div className={`bg-[#0a0a0f] border-t border-white/10 ${isMobile ? 'p-2' : 'p-3'}`}>
            <div className="flex items-center gap-2 md:gap-4">
              <div className={`flex items-center gap-1 md:gap-2 ${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-400 shrink-0`}>
                <Clock size={isMobile ? 12 : 14} />
                <span>Up Next</span>
              </div>
              <div className="flex gap-2 md:gap-3 overflow-x-auto scrollbar-hide">
                {upcomingVideos.slice(0, isMobile ? 2 : 3).map((video, idx) => (
                  <div 
                    key={`${video.video_id}-${idx}`}
                    className={`flex items-center gap-2 bg-white/5 rounded ${isMobile ? 'px-1.5 py-0.5' : 'px-2 py-1'} shrink-0`}
                  >
                    <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-300 truncate ${isMobile ? 'max-w-[100px]' : 'max-w-[200px]'}`}>
                      {video.title}
                    </span>
                    {video.duration && !isMobile && (
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

      {/* Admin Panel - Hide on mobile unless specifically toggled */}
      {showAdminPanel && isAdmin && !isMobile && (
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
