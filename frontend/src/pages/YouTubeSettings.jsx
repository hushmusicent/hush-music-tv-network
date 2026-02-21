import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { youtubeProxyAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { 
  ArrowLeft,
  Upload,
  Trash2,
  Check,
  X,
  AlertTriangle,
  Shield,
  Cookie,
  RefreshCw,
  ExternalLink,
  Info,
  Activity,
  Play,
  Ban,
  Eye,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const YouTubeSettings = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const isAdmin = user?.is_admin;
  
  const [cookiesStatus, setCookiesStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [testingVideo, setTestingVideo] = useState('');
  const [testResult, setTestResult] = useState(null);
  
  // Bulk check state
  const [bulkCheckRunning, setBulkCheckRunning] = useState(false);
  const [bulkCheckResults, setBulkCheckResults] = useState(null);
  const [expandedChannels, setExpandedChannels] = useState({});
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    // Wait for auth state to be determined
    if (isAuthenticated === undefined) return;
    
    if (!isAuthenticated || !isAdmin) {
      navigate('/login');
      return;
    }
    loadCookiesStatus();
  }, [isAuthenticated, isAdmin, navigate]);

  const loadCookiesStatus = async () => {
    try {
      setLoading(true);
      const response = await youtubeProxyAPI.getCookiesStatus();
      setCookiesStatus(response.data);
    } catch (error) {
      console.error('Failed to load cookies status:', error);
      setCookiesStatus({ configured: false });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.txt')) {
      toast.error('Please upload a .txt file in Netscape cookie format');
      return;
    }

    try {
      setUploading(true);
      const response = await youtubeProxyAPI.uploadCookies(file);
      toast.success(response.data.message);
      await loadCookiesStatus();
    } catch (error) {
      console.error('Failed to upload cookies:', error);
      toast.error(error.response?.data?.detail || 'Failed to upload cookies');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteCookies = async () => {
    if (!window.confirm('Are you sure you want to delete the YouTube cookies?')) {
      return;
    }

    try {
      await youtubeProxyAPI.deleteCookies();
      toast.success('Cookies deleted');
      await loadCookiesStatus();
    } catch (error) {
      toast.error('Failed to delete cookies');
    }
  };

  const handleTestVideo = async () => {
    if (!testingVideo.trim()) {
      toast.error('Please enter a YouTube video ID');
      return;
    }

    // Extract video ID from URL if needed
    let videoId = testingVideo.trim();
    const urlMatch = videoId.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    if (urlMatch) {
      videoId = urlMatch[1];
    }

    try {
      setTestResult({ loading: true });
      const response = await youtubeProxyAPI.checkVideo(videoId);
      setTestResult(response.data);
    } catch (error) {
      setTestResult({ error: error.response?.data?.detail || 'Test failed' });
    }
  };

  const handleBulkCheck = async () => {
    try {
      setBulkCheckRunning(true);
      setBulkCheckResults(null);
      toast.info('Starting bulk video health check... This may take several minutes.');
      
      const response = await youtubeProxyAPI.bulkCheck();
      setBulkCheckResults(response.data);
      
      const { age_restricted, unavailable, total_videos } = response.data;
      if (age_restricted === 0 && unavailable === 0) {
        toast.success(`All ${total_videos} videos are playable!`);
      } else {
        toast.warning(`Found ${age_restricted} age-restricted and ${unavailable} unavailable videos.`);
      }
    } catch (error) {
      console.error('Bulk check failed:', error);
      toast.error('Bulk check failed. Please try again.');
    } finally {
      setBulkCheckRunning(false);
    }
  };

  const handleQuickCheck = async () => {
    try {
      setBulkCheckRunning(true);
      setBulkCheckResults(null);
      toast.info('Running quick sample check...');
      
      const response = await youtubeProxyAPI.quickCheck(5);
      setBulkCheckResults({
        ...response.data,
        is_quick_check: true
      });
      
      toast.success('Quick check complete!');
    } catch (error) {
      console.error('Quick check failed:', error);
      toast.error('Quick check failed. Please try again.');
    } finally {
      setBulkCheckRunning(false);
    }
  };

  const toggleChannelExpand = (channelId) => {
    setExpandedChannels(prev => ({
      ...prev,
      [channelId]: !prev[channelId]
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard')}
            >
              <ArrowLeft size={20} />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Cookie className="text-primary" />
                YouTube Settings
              </h1>
              <p className="text-sm text-gray-400">
                Configure cookies for age-restricted video playback
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Status Card */}
        <div className="glass rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield size={20} className="text-primary" />
            Cookies Status
          </h2>
          
          <div className="flex items-center gap-4 p-4 rounded-lg bg-black/30">
            {cookiesStatus?.configured ? (
              <>
                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Check size={24} className="text-green-500" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-green-400">Cookies Configured</p>
                  <p className="text-sm text-gray-400">
                    Size: {(cookiesStatus.file_size / 1024).toFixed(1)} KB
                    {cookiesStatus.working ? (
                      <span className="text-green-400 ml-2">• Working</span>
                    ) : (
                      <span className="text-yellow-400 ml-2">• May need refresh</span>
                    )}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteCookies}
                >
                  <Trash2 size={16} className="mr-1" />
                  Delete
                </Button>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <AlertTriangle size={24} className="text-yellow-500" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-yellow-400">No Cookies Configured</p>
                  <p className="text-sm text-gray-400">
                    Age-restricted videos will be skipped
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Upload Card */}
        <div className="glass rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Upload size={20} className="text-primary" />
            Upload Cookies File
          </h2>
          
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <div className="flex items-start gap-3">
                <Info size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-gray-300">
                  <p className="font-medium text-blue-400 mb-2">How to get YouTube cookies:</p>
                  <ol className="list-decimal list-inside space-y-1 text-gray-400">
                    <li>Install a browser extension like "Get cookies.txt LOCALLY" or "cookies.txt"</li>
                    <li>Log in to YouTube with an age-verified account</li>
                    <li>Navigate to YouTube and export cookies for youtube.com</li>
                    <li>Upload the exported .txt file below</li>
                  </ol>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="bg-primary hover:bg-primary/90"
              >
                {uploading ? (
                  <RefreshCw size={16} className="mr-2 animate-spin" />
                ) : (
                  <Upload size={16} className="mr-2" />
                )}
                {uploading ? 'Uploading...' : 'Upload Cookies File'}
              </Button>
              <span className="text-sm text-gray-400">
                Netscape format .txt file
              </span>
            </div>
          </div>
        </div>

        {/* Test Card */}
        <div className="glass rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <RefreshCw size={20} className="text-primary" />
            Test Video
          </h2>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Test if a specific YouTube video can be played through the proxy.
            </p>
            
            <div className="flex items-center gap-4">
              <input
                type="text"
                value={testingVideo}
                onChange={(e) => setTestingVideo(e.target.value)}
                placeholder="Enter YouTube video ID or URL"
                className="flex-1 px-4 py-2 rounded-lg bg-black/50 border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button onClick={handleTestVideo}>
                Test
              </Button>
            </div>

            {testResult && (
              <div className={`p-4 rounded-lg ${
                testResult.loading ? 'bg-blue-500/10' :
                testResult.error ? 'bg-red-500/10' :
                testResult.playable ? 'bg-green-500/10' : 'bg-yellow-500/10'
              }`}>
                {testResult.loading ? (
                  <div className="flex items-center gap-2 text-blue-400">
                    <RefreshCw size={16} className="animate-spin" />
                    Testing...
                  </div>
                ) : testResult.error ? (
                  <div className="flex items-center gap-2 text-red-400">
                    <X size={16} />
                    {testResult.error}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {testResult.playable ? (
                        <Check size={16} className="text-green-400" />
                      ) : (
                        <X size={16} className="text-red-400" />
                      )}
                      <span className={testResult.playable ? 'text-green-400' : 'text-red-400'}>
                        {testResult.playable ? 'Playable' : 'Not Playable'}
                      </span>
                    </div>
                    {testResult.title && (
                      <p className="text-sm text-gray-300">{testResult.title}</p>
                    )}
                    {testResult.age_restricted && (
                      <div className="flex items-center gap-2 text-yellow-400 text-sm">
                        <AlertTriangle size={14} />
                        Age-restricted content
                        {testResult.needs_proxy && ' - Will use proxy'}
                      </div>
                    )}
                    {testResult.duration && (
                      <p className="text-xs text-gray-500">
                        Duration: {Math.floor(testResult.duration / 60)}:{(testResult.duration % 60).toString().padStart(2, '0')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bulk Health Check Card */}
        <div className="glass rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity size={20} className="text-primary" />
            Video Health Check
          </h2>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Scan all videos across your channels to identify age-restricted and unavailable content.
            </p>
            
            <div className="flex items-center gap-4">
              <Button 
                onClick={handleQuickCheck}
                disabled={bulkCheckRunning}
                variant="outline"
                className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
              >
                {bulkCheckRunning ? (
                  <RefreshCw size={16} className="mr-2 animate-spin" />
                ) : (
                  <Eye size={16} className="mr-2" />
                )}
                Quick Check
              </Button>
              <Button 
                onClick={handleBulkCheck}
                disabled={bulkCheckRunning}
                className="bg-primary hover:bg-primary/90"
              >
                {bulkCheckRunning ? (
                  <RefreshCw size={16} className="mr-2 animate-spin" />
                ) : (
                  <Activity size={16} className="mr-2" />
                )}
                Full Health Check
              </Button>
              {bulkCheckRunning && (
                <span className="text-sm text-yellow-400">
                  This may take several minutes...
                </span>
              )}
            </div>

            {/* Results */}
            {bulkCheckResults && (
              <div className="mt-6 space-y-4">
                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                    <div className="text-2xl font-bold text-white">
                      {bulkCheckResults.is_quick_check ? bulkCheckResults.total_checked : bulkCheckResults.total_videos}
                    </div>
                    <div className="text-sm text-gray-400">
                      {bulkCheckResults.is_quick_check ? 'Checked' : 'Total Videos'}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                    <div className="text-2xl font-bold text-green-400">
                      {bulkCheckResults.playable}
                    </div>
                    <div className="text-sm text-gray-400 flex items-center gap-1">
                      <Play size={12} /> Playable
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <div className="text-2xl font-bold text-yellow-400">
                      {bulkCheckResults.age_restricted}
                    </div>
                    <div className="text-sm text-gray-400 flex items-center gap-1">
                      <AlertTriangle size={12} /> Age-Restricted
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                    <div className="text-2xl font-bold text-red-400">
                      {bulkCheckResults.unavailable}
                    </div>
                    <div className="text-sm text-gray-400 flex items-center gap-1">
                      <Ban size={12} /> Unavailable
                    </div>
                  </div>
                </div>

                {/* Cookies Status */}
                <div className={`p-3 rounded-lg ${bulkCheckResults.cookies_configured ? 'bg-green-500/10' : 'bg-yellow-500/10'}`}>
                  <div className="flex items-center gap-2 text-sm">
                    {bulkCheckResults.cookies_configured ? (
                      <>
                        <Check size={14} className="text-green-400" />
                        <span className="text-green-400">Cookies configured - age-restricted videos can be played via proxy</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={14} className="text-yellow-400" />
                        <span className="text-yellow-400">No cookies configured - age-restricted videos will be skipped</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Age-Restricted Videos List */}
                {bulkCheckResults.age_restricted_videos && bulkCheckResults.age_restricted_videos.length > 0 && (
                  <div className="rounded-lg border border-yellow-500/30 overflow-hidden">
                    <div className="p-3 bg-yellow-500/10 flex items-center justify-between">
                      <span className="font-medium text-yellow-400 flex items-center gap-2">
                        <AlertTriangle size={16} />
                        Age-Restricted Videos ({bulkCheckResults.age_restricted_videos.length})
                      </span>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {bulkCheckResults.age_restricted_videos.map((video, idx) => (
                        <div 
                          key={idx} 
                          className="p-3 border-b border-white/5 last:border-b-0 flex items-center justify-between hover:bg-white/5"
                        >
                          <div className="flex-1">
                            <div className="text-sm text-white truncate max-w-md">{video.title}</div>
                            <div className="text-xs text-gray-500">{video.channel_name}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {video.can_play_with_cookies && (
                              <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400">
                                Proxy OK
                              </span>
                            )}
                            <a 
                              href={`https://youtube.com/watch?v=${video.youtube_id}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-white"
                            >
                              <ExternalLink size={14} />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unavailable Videos List */}
                {bulkCheckResults.unavailable_videos && bulkCheckResults.unavailable_videos.length > 0 && (
                  <div className="rounded-lg border border-red-500/30 overflow-hidden">
                    <div className="p-3 bg-red-500/10 flex items-center justify-between">
                      <span className="font-medium text-red-400 flex items-center gap-2">
                        <Ban size={16} />
                        Unavailable Videos ({bulkCheckResults.unavailable_videos.length})
                      </span>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {bulkCheckResults.unavailable_videos.map((video, idx) => (
                        <div 
                          key={idx} 
                          className="p-3 border-b border-white/5 last:border-b-0 flex items-center justify-between hover:bg-white/5"
                        >
                          <div className="flex-1">
                            <div className="text-sm text-white truncate max-w-md">{video.title}</div>
                            <div className="text-xs text-gray-500">{video.channel_name}</div>
                            <div className="text-xs text-red-400">{video.reason}</div>
                          </div>
                          <a 
                            href={`https://youtube.com/watch?v=${video.youtube_id}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-white"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Check Issues */}
                {bulkCheckResults.is_quick_check && bulkCheckResults.issues && bulkCheckResults.issues.length > 0 && (
                  <div className="rounded-lg border border-orange-500/30 overflow-hidden">
                    <div className="p-3 bg-orange-500/10">
                      <span className="font-medium text-orange-400 flex items-center gap-2">
                        <AlertTriangle size={16} />
                        Issues Found ({bulkCheckResults.issues.length})
                      </span>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {bulkCheckResults.issues.map((issue, idx) => (
                        <div 
                          key={idx} 
                          className="p-3 border-b border-white/5 last:border-b-0 flex items-center justify-between hover:bg-white/5"
                        >
                          <div className="flex-1">
                            <div className="text-sm text-white truncate max-w-md">{issue.title}</div>
                            <div className="text-xs text-gray-500">{issue.channel}</div>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded ${
                            issue.type === 'age_restricted' 
                              ? 'bg-yellow-500/20 text-yellow-400' 
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {issue.type === 'age_restricted' ? 'Age Restricted' : 'Unavailable'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Channel Summary (for full check) */}
                {bulkCheckResults.channels_summary && bulkCheckResults.channels_summary.length > 0 && (
                  <div className="rounded-lg border border-white/10 overflow-hidden">
                    <div className="p-3 bg-white/5">
                      <span className="font-medium text-gray-300">Channel Summary</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {bulkCheckResults.channels_summary
                        .filter(ch => ch.age_restricted > 0 || ch.unavailable > 0)
                        .map((channel, idx) => (
                          <div 
                            key={idx} 
                            className="p-3 border-b border-white/5 last:border-b-0 flex items-center justify-between hover:bg-white/5"
                          >
                            <div className="text-sm text-white">{channel.channel_name}</div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-green-400">{channel.playable} OK</span>
                              {channel.age_restricted > 0 && (
                                <span className="text-yellow-400">{channel.age_restricted} Restricted</span>
                              )}
                              {channel.unavailable > 0 && (
                                <span className="text-red-400">{channel.unavailable} Unavailable</span>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* All Good Message */}
                {bulkCheckResults.age_restricted === 0 && bulkCheckResults.unavailable === 0 && (
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
                    <Check size={32} className="mx-auto mb-2 text-green-400" />
                    <p className="text-green-400 font-medium">All videos are playable!</p>
                    <p className="text-sm text-gray-400">No age-restricted or unavailable videos found.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Help Card */}
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Info size={20} className="text-primary" />
            About Age-Restricted Content
          </h2>
          
          <div className="space-y-4 text-sm text-gray-400">
            <p>
              YouTube age-restricts certain content, which cannot be played in embedded players 
              without authentication. This system uses your logged-in YouTube cookies to access 
              such content.
            </p>
            <p>
              <strong className="text-gray-300">How it works:</strong> When a video fails to play 
              in the normal YouTube embed, the system automatically attempts to fetch the video 
              through a proxy using your cookies. If successful, the video plays as a direct stream.
            </p>
            <p>
              <strong className="text-yellow-400">Important:</strong> Cookies may expire periodically. 
              If videos stop playing, try uploading fresh cookies from your browser.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default YouTubeSettings;
