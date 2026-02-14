import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { favoritesAPI } from '../lib/api';
import ChannelCard from '../components/ChannelCard';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { Heart, Radio, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const Favorites = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    loadFavorites();
  }, [isAuthenticated, navigate]);

  const loadFavorites = async () => {
    try {
      const response = await favoritesAPI.getAll();
      setFavorites(response.data);
    } catch (error) {
      console.error('Failed to load favorites:', error);
      toast.error('Failed to load favorites');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-6 md:px-12 lg:px-16 py-8" data-testid="favorites-page">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          data-testid="back-btn"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="font-heading text-4xl md:text-5xl tracking-tight flex items-center gap-3">
            <Heart size={36} className="text-accent-rose" />
            Favorites
          </h1>
          <p className="text-gray-400 mt-2">
            Channels you've saved for quick access
          </p>
        </div>
      </div>

      {/* Favorites Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-video rounded-lg bg-white/10" />
              <Skeleton className="h-5 w-3/4 bg-white/10" />
              <Skeleton className="h-4 w-1/2 bg-white/10" />
            </div>
          ))}
        </div>
      ) : favorites.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {favorites.map((channel, index) => (
            <div
              key={channel.id}
              className="animate-slide-up"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <ChannelCard channel={channel} />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 glass rounded-lg">
          <Heart size={64} className="mx-auto mb-4 text-gray-600" />
          <h3 className="text-xl font-semibold mb-2">No favorites yet</h3>
          <p className="text-gray-400 mb-6">
            Start exploring and save channels you love
          </p>
          <Button
            onClick={() => navigate('/browse')}
            className="bg-primary hover:bg-primary-hover"
          >
            <Radio size={18} className="mr-2" />
            Browse Channels
          </Button>
        </div>
      )}
    </div>
  );
};

export default Favorites;
