import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { channelsAPI, categoriesAPI, seedAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import ChannelCard from '../components/ChannelCard';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { 
  Play, 
  Tv, 
  TrendingUp, 
  Sparkles, 
  ChevronRight,
  Plus,
  Radio
} from 'lucide-react';
import { toast } from 'sonner';

const Home = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [featuredChannels, setFeaturedChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [heroChannel, setHeroChannel] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Seed data first
      try {
        await seedAPI.seed();
      } catch (e) {
        // Already seeded, ignore
      }

      const [channelsRes, categoriesRes] = await Promise.all([
        channelsAPI.getFeatured(),
        categoriesAPI.getAll(),
      ]);

      setFeaturedChannels(channelsRes.data);
      setCategories(categoriesRes.data);
      
      if (channelsRes.data.length > 0) {
        setHeroChannel(channelsRes.data[0]);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  const heroImage = heroChannel?.thumbnail || 
    'https://images.unsplash.com/photo-1576307302704-b6142d572612?w=1920';

  return (
    <div className="min-h-screen" data-testid="home-page">
      {/* Hero Section */}
      <section className="relative h-[70vh] min-h-[500px] overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt="Featured"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/60 to-transparent" />
          <div className="absolute inset-0 hero-gradient" />
        </div>

        {/* Hero Content */}
        <div className="relative h-full flex flex-col justify-end px-6 md:px-12 lg:px-16 pb-12">
          {loading ? (
            <div className="space-y-4 max-w-2xl">
              <Skeleton className="h-16 w-3/4 bg-white/10" />
              <Skeleton className="h-6 w-1/2 bg-white/10" />
              <Skeleton className="h-12 w-48 bg-white/10" />
            </div>
          ) : heroChannel ? (
            <div className="max-w-2xl animate-slide-up">
              <div className="flex items-center gap-2 mb-4">
                <span className="flex items-center gap-1.5 bg-live px-3 py-1 rounded-sm">
                  <span className="w-2 h-2 bg-white rounded-full live-indicator" />
                  <span className="text-xs font-bold tracking-wider">LIVE NOW</span>
                </span>
                <span className="text-sm text-gray-400 uppercase tracking-wider">
                  {heroChannel.category}
                </span>
              </div>

              <h1 className="font-heading text-5xl md:text-7xl lg:text-8xl tracking-tight leading-none mb-4">
                {heroChannel.name}
              </h1>

              <p className="text-lg text-gray-300 mb-6 max-w-xl">
                {heroChannel.description || 'Tune in to the best content 24/7'}
              </p>

              <div className="flex items-center gap-4">
                <Button
                  onClick={() => navigate(`/watch/${heroChannel.id}`)}
                  className="bg-primary hover:bg-primary-hover text-white font-bold px-8 py-6 text-lg glow-primary-hover"
                  data-testid="watch-now-btn"
                >
                  <Play size={20} className="mr-2" fill="white" />
                  Watch Now
                </Button>

                <Button
                  variant="outline"
                  onClick={() => navigate('/browse')}
                  className="border-white/30 text-white hover:bg-white/10 px-8 py-6 text-lg"
                  data-testid="browse-btn"
                >
                  Browse All
                </Button>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl animate-slide-up">
              <h1 className="font-heading text-5xl md:text-7xl tracking-tight leading-none mb-4">
                YOUR TV NETWORK
              </h1>
              <p className="text-lg text-gray-300 mb-6">
                Create and watch custom TV channels 24/7
              </p>
              <Button
                onClick={() => isAuthenticated ? navigate('/create') : navigate('/login')}
                className="bg-primary hover:bg-primary-hover text-white font-bold px-8 py-6 text-lg"
              >
                <Plus size={20} className="mr-2" />
                Create Channel
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Categories Section */}
      <section className="px-6 md:px-12 lg:px-16 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading text-3xl md:text-4xl tracking-wide flex items-center gap-3">
            <Sparkles size={28} className="text-primary" />
            Categories
          </h2>
          <Link
            to="/browse"
            className="text-sm text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
            data-testid="view-all-categories"
          >
            View All <ChevronRight size={16} />
          </Link>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-4 hide-scrollbar">
          {loading
            ? Array(8).fill(0).map((_, i) => (
                <Skeleton key={i} className="min-w-[120px] h-10 rounded-full bg-white/10" />
              ))
            : categories.map((cat) => (
                <Link
                  key={cat.name}
                  to={`/browse?category=${cat.name}`}
                  className="category-pill flex-shrink-0 px-5 py-2.5 rounded-full border border-white/20 text-sm font-medium hover:border-primary hover:text-primary transition-all"
                  data-testid={`category-${cat.name.toLowerCase()}`}
                >
                  {cat.name}
                  <span className="ml-2 text-gray-500">({cat.count})</span>
                </Link>
              ))}
        </div>
      </section>

      {/* Featured Channels */}
      <section className="px-6 md:px-12 lg:px-16 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading text-3xl md:text-4xl tracking-wide flex items-center gap-3">
            <TrendingUp size={28} className="text-accent-lime" />
            Featured Channels
          </h2>
          <Link
            to="/browse"
            className="text-sm text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
            data-testid="view-all-featured"
          >
            View All <ChevronRight size={16} />
          </Link>
        </div>

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
        ) : featuredChannels.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {featuredChannels.map((channel, index) => (
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
          <div className="text-center py-16">
            <Radio size={48} className="mx-auto mb-4 text-gray-500" />
            <p className="text-gray-400 mb-4">No channels available yet</p>
            <Button
              onClick={() => isAuthenticated ? navigate('/create') : navigate('/login')}
              className="bg-primary hover:bg-primary-hover"
            >
              Create First Channel
            </Button>
          </div>
        )}
      </section>

      {/* CTA Section */}
      <section className="px-6 md:px-12 lg:px-16 py-16">
        <div className="relative overflow-hidden rounded-2xl bg-surface p-8 md:p-12">
          <div className="absolute inset-0 hero-gradient opacity-50" />
          <div className="relative grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="font-heading text-4xl md:text-5xl tracking-tight mb-4">
                START YOUR OWN
                <br />
                <span className="text-primary">TV CHANNEL</span>
              </h2>
              <p className="text-gray-400 mb-6">
                Curate playlists from YouTube, create schedules, and broadcast 24/7 to your audience.
              </p>
              <Button
                onClick={() => isAuthenticated ? navigate('/create') : navigate('/login')}
                className="bg-primary hover:bg-primary-hover text-white font-bold px-8 py-6 text-lg glow-primary-hover"
                data-testid="cta-create-btn"
              >
                <Tv size={20} className="mr-2" />
                Create Channel
              </Button>
            </div>
            <div className="hidden md:block">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="aspect-video bg-black/40 rounded-lg overflow-hidden">
                    <img
                      src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400"
                      alt="Music"
                      className="w-full h-full object-cover opacity-60"
                    />
                  </div>
                  <div className="aspect-video bg-black/40 rounded-lg overflow-hidden">
                    <img
                      src="https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400"
                      alt="Gaming"
                      className="w-full h-full object-cover opacity-60"
                    />
                  </div>
                </div>
                <div className="space-y-4 mt-8">
                  <div className="aspect-video bg-black/40 rounded-lg overflow-hidden">
                    <img
                      src="https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400"
                      alt="Education"
                      className="w-full h-full object-cover opacity-60"
                    />
                  </div>
                  <div className="aspect-video bg-black/40 rounded-lg overflow-hidden">
                    <img
                      src="https://images.unsplash.com/photo-1527224857830-43a7acc85260?w=400"
                      alt="Comedy"
                      className="w-full h-full object-cover opacity-60"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
