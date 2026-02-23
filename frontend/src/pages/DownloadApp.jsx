import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { 
  Download, 
  Smartphone, 
  Monitor, 
  Apple, 
  Chrome,
  Share,
  Plus,
  Check,
  ArrowRight,
  Tv,
  Wifi,
  Bell
} from 'lucide-react';

const DownloadApp = () => {
  const [platform, setPlatform] = useState('unknown');
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase();
    if (/android/i.test(userAgent)) {
      setPlatform('android');
    } else if (/iphone|ipad|ipod/i.test(userAgent)) {
      setPlatform('ios');
    } else if (/windows/i.test(userAgent)) {
      setPlatform('windows');
    } else if (/macintosh|mac os x/i.test(userAgent)) {
      setPlatform('mac');
    } else {
      setPlatform('desktop');
    }

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Listen for install prompt
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    setInstalling(true);
    deferredPrompt.prompt();
    
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    
    setDeferredPrompt(null);
    setInstalling(false);
  };

  const features = [
    { icon: Tv, title: '22+ Channels', desc: 'Music, Comedy, Entertainment & more' },
    { icon: Wifi, title: 'Works Offline', desc: 'Watch even without internet' },
    { icon: Bell, title: 'Notifications', desc: 'Get notified about new content' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-black">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <img 
              src="/icons/icon-192x192.png" 
              alt="Hush Music TV" 
              className="w-24 h-24 rounded-2xl shadow-2xl shadow-purple-500/30"
            />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
            Hush Music TV
          </h1>
          <p className="text-xl text-gray-400 mb-8 max-w-md mx-auto">
            24/7 streaming channels on your device. Install now for the best experience.
          </p>
          
          {isInstalled ? (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 text-green-400 text-lg">
                <Check size={24} />
                <span>App Installed!</span>
              </div>
              <Link to="/live">
                <Button size="lg" className="bg-purple-600 hover:bg-purple-700">
                  Open Live TV <ArrowRight size={20} className="ml-2" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {deferredPrompt && (
                <Button 
                  size="lg" 
                  onClick={handleInstall}
                  disabled={installing}
                  className="bg-purple-600 hover:bg-purple-700 text-lg px-8 py-6"
                >
                  <Download size={24} className="mr-2" />
                  {installing ? 'Installing...' : 'Install App'}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mb-12 max-w-3xl mx-auto">
          {features.map((feature, idx) => (
            <div key={idx} className="glass rounded-xl p-6 text-center">
              <feature.icon size={32} className="mx-auto mb-3 text-purple-400" />
              <h3 className="font-semibold mb-1">{feature.title}</h3>
              <p className="text-sm text-gray-400">{feature.desc}</p>
            </div>
          ))}
        </div>

        {/* Platform-specific Instructions */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Installation Guide</h2>
          
          {/* Android Instructions */}
          <div className={`glass rounded-xl p-6 mb-6 ${platform === 'android' ? 'ring-2 ring-purple-500' : ''}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <Smartphone size={24} className="text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Android</h3>
                <p className="text-sm text-gray-400">Chrome Browser</p>
              </div>
              {platform === 'android' && (
                <span className="ml-auto px-3 py-1 bg-purple-500/20 text-purple-400 text-sm rounded-full">
                  Your Device
                </span>
              )}
            </div>
            <ol className="space-y-3 text-gray-300">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-sm">1</span>
                <span>Tap the <strong>menu icon</strong> (⋮) in Chrome</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-sm">2</span>
                <span>Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-sm">3</span>
                <span>Tap <strong>"Install"</strong> to confirm</span>
              </li>
            </ol>
            {platform === 'android' && !isInstalled && (
              <div className="mt-4 p-3 bg-green-500/10 rounded-lg border border-green-500/30">
                <p className="text-sm text-green-400">
                  💡 Look for the install banner at the bottom of your screen, or use the browser menu.
                </p>
              </div>
            )}
          </div>

          {/* iOS Instructions */}
          <div className={`glass rounded-xl p-6 mb-6 ${platform === 'ios' ? 'ring-2 ring-purple-500' : ''}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-gray-500/20 flex items-center justify-center">
                <Apple size={24} className="text-gray-300" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">iPhone / iPad</h3>
                <p className="text-sm text-gray-400">Safari Browser</p>
              </div>
              {platform === 'ios' && (
                <span className="ml-auto px-3 py-1 bg-purple-500/20 text-purple-400 text-sm rounded-full">
                  Your Device
                </span>
              )}
            </div>
            <ol className="space-y-3 text-gray-300">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-sm">1</span>
                <span>Open this page in <strong>Safari</strong> browser</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-sm">2</span>
                <span>Tap the <strong>Share button</strong> <Share size={16} className="inline" /></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-sm">3</span>
                <span>Scroll down and tap <strong>"Add to Home Screen"</strong> <Plus size={16} className="inline" /></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-sm">4</span>
                <span>Tap <strong>"Add"</strong> in the top right</span>
              </li>
            </ol>
          </div>

          {/* Desktop Instructions */}
          <div className={`glass rounded-xl p-6 ${platform === 'windows' || platform === 'mac' || platform === 'desktop' ? 'ring-2 ring-purple-500' : ''}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Monitor size={24} className="text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Desktop</h3>
                <p className="text-sm text-gray-400">Chrome, Edge, or Brave</p>
              </div>
              {(platform === 'windows' || platform === 'mac' || platform === 'desktop') && (
                <span className="ml-auto px-3 py-1 bg-purple-500/20 text-purple-400 text-sm rounded-full">
                  Your Device
                </span>
              )}
            </div>
            <ol className="space-y-3 text-gray-300">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-sm">1</span>
                <span>Look for the <strong>install icon</strong> in the address bar (⊕ or ↓)</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-sm">2</span>
                <span>Click <strong>"Install"</strong> when prompted</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-sm">3</span>
                <span>The app will open in its own window</span>
              </li>
            </ol>
          </div>
        </div>

        {/* QR Code Section */}
        <div className="text-center mt-12">
          <p className="text-gray-400 mb-4">Share with friends</p>
          <div className="inline-block p-4 bg-white rounded-xl">
            <img 
              src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(window.location.origin + '/download')}`}
              alt="QR Code"
              className="w-32 h-32"
            />
          </div>
          <p className="text-sm text-gray-500 mt-2">Scan to download on another device</p>
        </div>

        {/* Back to app */}
        <div className="text-center mt-12">
          <Link to="/">
            <Button variant="outline" className="border-purple-500/50 text-purple-400">
              ← Back to Hush Music TV
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default DownloadApp;
