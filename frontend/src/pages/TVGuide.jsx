import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { tvGuideAPI } from '../lib/api';
import { Skeleton } from '../components/ui/skeleton';
import { Calendar, Clock, ChevronLeft, ChevronRight, Radio, Play, Shuffle } from 'lucide-react';
import { Button } from '../components/ui/button';

// Seeded random function for consistent shuffling across all viewers
const seededRandom = (seed) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

// Shuffle array using a seed (date-based so all viewers see same order)
const shuffleWithSeed = (array, seed) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Get today's seed - changes daily so playlist order changes each day
const getDailySeed = () => {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
};

// Generate a full 24-hour schedule for a channel based on actual video durations
const generateChannelSchedule = (videos, randomPlay = false) => {
  if (!videos || videos.length === 0) return [];

  // If random play is enabled, shuffle videos consistently for all viewers
  const playlistVideos = randomPlay ? shuffleWithSeed(videos, getDailySeed()) : videos;

  const schedule = [];
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Calculate total playlist duration
  let totalDuration = 0;
  playlistVideos.forEach(v => {
    totalDuration += v.duration || 300;
  });

  if (totalDuration === 0) return [];

  // Generate schedule for 24 hours (86400 seconds)
  let currentSecond = 0;
  const endOfDay = 86400; // 24 hours in seconds

  while (currentSecond < endOfDay) {
    const positionInPlaylist = currentSecond % totalDuration;
    
    // Find which video is at this position
    let accumulated = 0;
    for (let i = 0; i < playlistVideos.length; i++) {
      const video = playlistVideos[i];
      const videoDuration = video.duration || 300;
      
      if (accumulated + videoDuration > positionInPlaylist) {
        // This video is playing at currentSecond
        const videoStartInPlaylist = accumulated;
        const offsetIntoVideo = positionInPlaylist - videoStartInPlaylist;
        const remainingDuration = videoDuration - offsetIntoVideo;
        
        const startTime = new Date(startOfDay);
        startTime.setSeconds(currentSecond);
        
        const endTime = new Date(startOfDay);
        endTime.setSeconds(currentSecond + remainingDuration);
        
        schedule.push({
          video,
          startTime,
          endTime,
          startSeconds: currentSecond,
          durationSeconds: remainingDuration
        });
        
        currentSecond += remainingDuration;
        break;
      }
      accumulated += videoDuration;
    }
  }

  return schedule;
};

const TVGuide = () => {
  const [guideData, setGuideData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const scrollRef = useRef(null);

  useEffect(() => {
    loadGuide();
    
    // Update current time every minute
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  const loadGuide = async () => {
    try {
      const response = await tvGuideAPI.get();
      setGuideData(response.data);
    } catch (error) {
      console.error('Failed to load TV guide:', error);
    } finally {
      setLoading(false);
    }
  };

  // Generate time slots for 24 hours (48 half-hour slots)
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let i = 0; i < 24; i++) {
      slots.push(`${i.toString().padStart(2, '0')}:00`);
      slots.push(`${i.toString().padStart(2, '0')}:30`);
    }
    return slots;
  }, []);

  const currentHour = currentTime.getHours();
  const currentMinute = currentTime.getMinutes();
  const currentSeconds = currentHour * 3600 + currentMinute * 60 + currentTime.getSeconds();

  // Pixels per second for the timeline (120px per 30min slot = 120px per 1800 seconds)
  const PIXELS_PER_SECOND = 120 / 1800;
  const TOTAL_WIDTH = timeSlots.length * 120; // 48 slots * 120px

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -400, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 400, behavior: 'smooth' });
    }
  };

  const scrollToNow = () => {
    if (scrollRef.current) {
      const nowPosition = currentSeconds * PIXELS_PER_SECOND;
      scrollRef.current.scrollTo({ left: nowPosition - 200, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen overflow-y-auto px-6 md:px-12 lg:px-16 py-8" data-testid="tv-guide-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-heading text-4xl md:text-5xl tracking-tight flex items-center gap-3">
            <Calendar size={36} className="text-primary" />
            TV Guide
          </h1>
          <p className="text-gray-400 mt-2">
            See what's playing now and what's coming up
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-gray-400">
            <Clock size={18} />
            <span className="font-mono">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <Button
            onClick={scrollToNow}
            variant="outline"
            size="sm"
            className="border-primary text-primary hover:bg-primary hover:text-white"
            data-testid="scroll-to-now"
          >
            Now
          </Button>
        </div>
      </div>

      {/* TV Guide Grid */}
      <div className="relative">
        {/* Scroll Controls */}
        <button
          onClick={scrollLeft}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 bg-black/80 hover:bg-primary rounded-full transition-colors"
          data-testid="scroll-left"
        >
          <ChevronLeft size={24} />
        </button>
        <button
          onClick={scrollRight}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 bg-black/80 hover:bg-primary rounded-full transition-colors"
          data-testid="scroll-right"
        >
          <ChevronRight size={24} />
        </button>

        {/* Guide Container */}
        <div className="glass rounded-lg overflow-hidden">
          {/* Time Header */}
          <div className="flex border-b border-white/10">
            <div className="w-48 flex-shrink-0 p-4 bg-surface sticky left-0 z-20 border-r border-white/10">
              <span className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                Channel
              </span>
            </div>
            <div
              ref={scrollRef}
              className="flex-1 overflow-x-auto hide-scrollbar"
            >
              <div className="flex" style={{ width: `${timeSlots.length * 120}px` }}>
                {timeSlots.map((slot, index) => (
                  <div
                    key={slot}
                    className={`w-[120px] flex-shrink-0 p-4 border-r border-white/5 text-center ${
                      Math.floor(index / 2) === currentHour
                        ? 'bg-primary/20 text-primary'
                        : 'text-gray-400'
                    }`}
                  >
                    <span className="text-sm font-mono">{slot}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Channel Rows */}
          {loading ? (
            <div className="space-y-0">
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="flex border-b border-white/5">
                  <div className="w-48 flex-shrink-0 p-4 bg-surface sticky left-0 z-10 border-r border-white/10">
                    <Skeleton className="h-6 w-32 bg-white/10" />
                  </div>
                  <div className="flex-1 p-4">
                    <Skeleton className="h-16 w-full bg-white/10" />
                  </div>
                </div>
              ))}
            </div>
          ) : guideData.length > 0 ? (
            <div>
              {guideData.map((channel) => {
                const currentVideo = getCurrentVideo(channel.videos);
                
                return (
                  <div
                    key={channel.channel_id}
                    className="flex border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    {/* Channel Name */}
                    <div className="w-48 flex-shrink-0 p-4 bg-surface sticky left-0 z-10 border-r border-white/10">
                      <Link
                        to={`/watch/${channel.channel_id}`}
                        className="block group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded bg-primary/20 flex items-center justify-center">
                            <Radio size={18} className="text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                              {channel.channel_name}
                            </h4>
                            {channel.is_24_7 && (
                              <span className="text-[10px] text-live">24/7</span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </div>

                    {/* Schedule */}
                    <div className="flex-1 overflow-x-auto hide-scrollbar">
                      <div
                        className="flex items-stretch min-h-[80px]"
                        style={{ width: `${timeSlots.length * 120}px` }}
                      >
                        {channel.videos && channel.videos.length > 0 ? (
                          channel.videos.map((video, vIndex) => {
                            const duration = video.duration || 300;
                            const width = Math.max((duration / 1800) * 120, 120); // Min 1 slot width
                            const isNowPlaying = currentVideo?.id === video.id;
                            
                            return (
                              <div
                                key={video.id}
                                className={`flex-shrink-0 p-3 border-r border-white/5 ${
                                  isNowPlaying
                                    ? 'bg-primary/20 border-l-2 border-l-primary'
                                    : 'hover:bg-white/5'
                                }`}
                                style={{ width: `${width}px` }}
                              >
                                <Link
                                  to={`/watch/${channel.channel_id}`}
                                  className="block h-full"
                                >
                                  <div className="flex items-start gap-2">
                                    {isNowPlaying && (
                                      <div className="p-1 bg-primary rounded">
                                        <Play size={10} fill="white" />
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium truncate">
                                        {video.title}
                                      </p>
                                      <p className="text-[10px] text-gray-500 mt-1">
                                        {Math.floor(duration / 60)}min
                                      </p>
                                    </div>
                                  </div>
                                </Link>
                              </div>
                            );
                          })
                        ) : (
                          <div className="flex items-center justify-center w-full text-gray-500 text-sm">
                            No schedule available
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center">
              <Radio size={48} className="mx-auto mb-4 text-gray-500" />
              <p className="text-gray-400">No channels available in TV guide</p>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 flex items-center gap-6 text-sm text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-primary/20 border-l-2 border-primary rounded" />
          <span>Now Playing</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-live rounded-full live-indicator" />
          <span>24/7 Channel</span>
        </div>
      </div>
    </div>
  );
};

export default TVGuide;
