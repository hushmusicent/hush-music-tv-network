import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { channelsAPI } from '../lib/api';
import ChannelCard from '../components/ChannelCard';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { 
  Tv, 
  Plus, 
  Radio, 
  TrendingUp, 
  Heart,
  Settings,
  User
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

const Dashboard = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteChannelId, setDeleteChannelId] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    loadChannels();
  }, [isAuthenticated, navigate]);

  const loadChannels = async () => {
    try {
      const response = await channelsAPI.getMy();
      setChannels(response.data);
    } catch (error) {
      console.error('Failed to load channels:', error);
      toast.error('Failed to load your channels');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChannel = async () => {
    if (!deleteChannelId) return;

    try {
      await channelsAPI.delete(deleteChannelId);
      setChannels((prev) => prev.filter((c) => c.id !== deleteChannelId));
      toast.success('Channel deleted successfully');
    } catch (error) {
      toast.error('Failed to delete channel');
    } finally {
      setDeleteChannelId(null);
    }
  };

  const totalViewers = channels.reduce((sum, c) => sum + (c.viewers_count || 0), 0);
  const totalFavorites = channels.reduce((sum, c) => sum + (c.favorites_count || 0), 0);

  return (
    <div className="min-h-screen px-6 md:px-12 lg:px-16 py-8" data-testid="dashboard-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-heading text-4xl md:text-5xl tracking-tight flex items-center gap-3">
            <User size={36} className="text-primary" />
            Dashboard
          </h1>
          <p className="text-gray-400 mt-2">
            Welcome back, <span className="text-white">{user?.username}</span>
          </p>
        </div>

        <Button
          onClick={() => navigate('/create')}
          className="bg-primary hover:bg-primary-hover font-bold glow-primary-hover"
          data-testid="create-channel-btn"
        >
          <Plus size={18} className="mr-2" />
          Create Channel
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <div className="glass rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/20 rounded-lg">
              <Tv size={24} className="text-primary" />
            </div>
            <div>
              <p className="text-3xl font-bold">{channels.length}</p>
              <p className="text-sm text-gray-400">Your Channels</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-accent-cyan/20 rounded-lg">
              <TrendingUp size={24} className="text-accent-cyan" />
            </div>
            <div>
              <p className="text-3xl font-bold">{totalViewers.toLocaleString()}</p>
              <p className="text-sm text-gray-400">Total Viewers</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-accent-rose/20 rounded-lg">
              <Heart size={24} className="text-accent-rose" />
            </div>
            <div>
              <p className="text-3xl font-bold">{totalFavorites.toLocaleString()}</p>
              <p className="text-sm text-gray-400">Total Favorites</p>
            </div>
          </div>
        </div>
      </div>

      {/* My Channels */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading text-2xl tracking-wide flex items-center gap-2">
            <Radio size={24} className="text-accent-lime" />
            My Channels
          </h2>
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
        ) : channels.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {channels.map((channel, index) => (
              <div
                key={channel.id}
                className="animate-slide-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <ChannelCard
                  channel={channel}
                  showMenu={true}
                  onDelete={setDeleteChannelId}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 glass rounded-lg">
            <Radio size={64} className="mx-auto mb-4 text-gray-600" />
            <h3 className="text-xl font-semibold mb-2">No channels yet</h3>
            <p className="text-gray-400 mb-6">
              Create your first channel and start broadcasting!
            </p>
            <Button
              onClick={() => navigate('/create')}
              className="bg-primary hover:bg-primary-hover"
            >
              <Plus size={18} className="mr-2" />
              Create Channel
            </Button>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          to="/favorites"
          className="glass rounded-lg p-6 hover:bg-white/5 transition-colors group"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-accent-rose/20 rounded-lg group-hover:scale-110 transition-transform">
              <Heart size={24} className="text-accent-rose" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">My Favorites</h3>
              <p className="text-sm text-gray-400">View channels you've favorited</p>
            </div>
          </div>
        </Link>

        <Link
          to="/guide"
          className="glass rounded-lg p-6 hover:bg-white/5 transition-colors group"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/20 rounded-lg group-hover:scale-110 transition-transform">
              <Settings size={24} className="text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">TV Guide</h3>
              <p className="text-sm text-gray-400">See what's playing on all channels</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteChannelId} onOpenChange={() => setDeleteChannelId(null)}>
        <AlertDialogContent className="bg-surface border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Channel</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to delete this channel? This action cannot be undone.
              All videos and schedule data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/20">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChannel}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-delete-btn"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;
