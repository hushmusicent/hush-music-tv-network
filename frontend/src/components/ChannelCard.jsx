import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { favoritesAPI } from '../lib/api';
import { Heart, Users, Play, Radio, MoreVertical, Edit, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { toast } from 'sonner';

const ChannelCard = ({ channel, onDelete, showMenu = false }) => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteCount, setFavoriteCount] = useState(channel.favorites_count || 0);
  const [isLoading, setIsLoading] = useState(false);

  const isOwner = user?.id === channel.owner_id;
  const isAdmin = user?.is_admin === true;
  const canEdit = isOwner || isAdmin;

  const handleFavorite = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      toast.error('Please sign in to add favorites');
      navigate('/login');
      return;
    }

    setIsLoading(true);
    try {
      if (isFavorite) {
        await favoritesAPI.remove(channel.id);
        setIsFavorite(false);
        setFavoriteCount((prev) => Math.max(0, prev - 1));
        toast.success('Removed from favorites');
      } else {
        await favoritesAPI.add(channel.id);
        setIsFavorite(true);
        setFavoriteCount((prev) => prev + 1);
        toast.success('Added to favorites');
      }
    } catch (error) {
      toast.error('Failed to update favorites');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (onDelete) {
      onDelete(channel.id);
    }
  };

  const thumbnail = channel.thumbnail || 
    (channel.videos?.[0]?.thumbnail) || 
    'https://images.unsplash.com/photo-1576307302704-b6142d572612?w=800';

  return (
    <div className="channel-card group relative" data-testid={`channel-card-${channel.id}`}>
      <Link to={`/watch/${channel.id}`} className="block">
        {/* Thumbnail */}
        <div className="relative aspect-video bg-zinc-900 rounded-lg overflow-hidden">
          <img
            src={thumbnail}
            alt={channel.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
          />
          
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          {/* Play button on hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="p-4 bg-primary rounded-full glow-primary transform scale-90 group-hover:scale-100 transition-transform">
              <Play size={24} fill="white" />
            </div>
          </div>

          {/* Live badge */}
          {channel.is_24_7 && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-live px-2 py-1 rounded-sm">
              <span className="w-1.5 h-1.5 bg-white rounded-full live-indicator" />
              <span className="text-[10px] font-bold tracking-wider">24/7</span>
            </div>
          )}

          {/* Category badge */}
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-sm">
            <span className="text-[10px] font-medium text-gray-300 uppercase tracking-wider">
              {channel.category}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="mt-3 px-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white truncate group-hover:text-primary transition-colors">
                {channel.name}
              </h3>
              <p className="text-sm text-gray-400 truncate mt-0.5">
                by {channel.owner_username}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleFavorite}
                disabled={isLoading}
                className={`p-1.5 rounded-full transition-colors ${
                  isFavorite 
                    ? 'text-accent-rose bg-accent-rose/20' 
                    : 'text-gray-400 hover:text-accent-rose hover:bg-white/10'
                }`}
                data-testid={`favorite-btn-${channel.id}`}
              >
                <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
              </button>

              {showMenu && canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                      onClick={(e) => e.preventDefault()}
                      data-testid={`channel-menu-${channel.id}`}
                    >
                      <MoreVertical size={16} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-surface border-white/10">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/edit/${channel.id}`);
                      }}
                      className="cursor-pointer hover:bg-white/10"
                    >
                      <Edit size={14} className="mr-2" />
                      Edit Channel
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleDelete}
                      className="cursor-pointer text-red-400 hover:bg-white/10"
                    >
                      <Trash2 size={14} className="mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Users size={12} />
              {channel.viewers_count?.toLocaleString() || 0}
            </span>
            <span className="flex items-center gap-1">
              <Heart size={12} />
              {favoriteCount.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Radio size={12} />
              {channel.videos?.length || 0} videos
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default ChannelCard;
