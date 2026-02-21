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
