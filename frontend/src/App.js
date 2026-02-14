import React from 'react';
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';

// Pages
import Home from './pages/Home';
import Browse from './pages/Browse';
import Watch from './pages/Watch';
import LiveTV from './pages/LiveTV';
import TVGuide from './pages/TVGuide';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ChannelCreator from './pages/ChannelCreator';
import Favorites from './pages/Favorites';
import EmbedPlayer from './pages/EmbedPlayer';
import EmbedNetwork from './pages/EmbedNetwork';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Embed pages - no layout, minimal UI */}
          <Route path="/embed/:channelId" element={<EmbedPlayer />} />
          <Route path="/embed" element={<EmbedNetwork />} />
          
          {/* Live TV - full screen experience */}
          <Route path="/live" element={<LiveTV />} />
          
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
                  <Route path="/guide" element={<TVGuide />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/create" element={<ChannelCreator />} />
                  <Route path="/edit/:channelId" element={<ChannelCreator />} />
                  <Route path="/favorites" element={<Favorites />} />
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
