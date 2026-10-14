import React from 'react';
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
// Kick off the /api/schedule/live prefetch as soon as the app module loads,
// so LiveTV and TV Guide are ready to display instantly when the user navigates.
import './lib/prefetch';

// Pages
import Home from './pages/Home';
import Browse from './pages/Browse';
import Watch from './pages/Watch';
import LiveTV from './pages/LiveTV';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ChannelCreator from './pages/ChannelCreator';
import Favorites from './pages/Favorites';
import EmbedPlayer from './pages/EmbedPlayer';
import EmbedNetwork from './pages/EmbedNetwork';
import Analytics from './pages/Analytics';
import Schedule from './pages/Schedule';
import ScheduleEditor from './pages/ScheduleEditor';
import BulkThumbnails from './pages/BulkThumbnails';
import YouTubeSettings from './pages/YouTubeSettings';
import DownloadApp from './pages/DownloadApp';
import Commercials from './pages/Commercials';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TVCursor from './components/TVCursor';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <TVCursor />
        <Routes>
          {/* Embed pages - no layout, minimal UI */}
          <Route path="/embed/:channelId" element={<EmbedPlayer />} />
          <Route path="/embed" element={<EmbedNetwork />} />
          
          {/* Download page - no layout */}
          <Route path="/download" element={<DownloadApp />} />
          
          {/* Privacy policy - no layout, publicly linkable for Play Store submission */}
          <Route path="/privacy" element={<PrivacyPolicy />} />
          
          {/* Live TV - with layout */}
          <Route
            path="/live"
            element={
              <Layout>
                <LiveTV />
              </Layout>
            }
          />
          
          {/* Auth page without layout */}
          <Route path="/login" element={<Login />} />
          
          {/* All other pages with layout */}
          <Route
            path="/*"
            element={
              <Layout>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/browse" element={<Browse />} />
                  <Route path="/watch/:channelId" element={<Watch />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/schedule" element={<Schedule />} />
                  <Route path="/schedule-editor/:channelId" element={<ScheduleEditor />} />
                  <Route path="/create" element={<ChannelCreator />} />
                  <Route path="/edit/:channelId" element={<ChannelCreator />} />
                  <Route path="/favorites" element={<Favorites />} />
                  <Route path="/bulk-thumbnails" element={<BulkThumbnails />} />
                  <Route path="/youtube-settings" element={<YouTubeSettings />} />
                  <Route path="/commercials" element={<Commercials />} />
                  <Route path="/guide" element={<Schedule />} />
                  <Route path="/library" element={<Browse />} />
                  <Route path="/admin" element={<Dashboard />} />
                </Routes>
              </Layout>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
