import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { channelsAPI, categoriesAPI } from '../lib/api';
import ChannelCard from '../components/ChannelCard';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { Search, Filter, Radio, X } from 'lucide-react';
import { toast } from 'sonner';

const Browse = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'All');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadChannels();
  }, [selectedCategory, searchParams]);

  const loadData = async () => {
    try {
      const categoriesRes = await categoriesAPI.getAll();
      setCategories(categoriesRes.data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadChannels = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedCategory && selectedCategory !== 'All') {
        params.category = selectedCategory;
      }
      const search = searchParams.get('search');
      if (search) {
        params.search = search;
      }

      const response = await channelsAPI.getAll(params);
      setChannels(response.data);
    } catch (error) {
      console.error('Failed to load channels:', error);
      toast.error('Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const newParams = new URLSearchParams(searchParams);
    if (searchQuery) {
      newParams.set('search', searchQuery);
    } else {
      newParams.delete('search');
    }
    setSearchParams(newParams);
  };

  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
    const newParams = new URLSearchParams(searchParams);
    if (category !== 'All') {
      newParams.set('category', category);
    } else {
      newParams.delete('category');
    }
    setSearchParams(newParams);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All');
    setSearchParams(new URLSearchParams());
  };

  const hasFilters = selectedCategory !== 'All' || searchParams.get('search');

  return (
    <div className="min-h-screen overflow-y-auto px-6 md:px-12 lg:px-16 py-8" data-testid="browse-page">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-heading text-4xl md:text-5xl tracking-tight mb-2">
          Browse Channels
        </h1>
        <p className="text-gray-400">
          Discover and watch the best content from creators around the world
        </p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
            <Input
              type="text"
              placeholder="Search channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 bg-surface border-white/10 focus:border-primary h-12"
              data-testid="search-input"
            />
          </div>
          <Button
            type="submit"
            className="bg-primary hover:bg-primary-hover px-6"
            data-testid="search-submit"
          >
            Search
          </Button>
        </form>

        {hasFilters && (
          <Button
            variant="outline"
            onClick={clearFilters}
            className="border-white/20 hover:bg-white/10"
            data-testid="clear-filters"
          >
            <X size={16} className="mr-2" />
            Clear Filters
          </Button>
        )}
      </div>

      {/* Category Pills */}
      <div className="flex gap-3 overflow-x-auto pb-4 mb-8 hide-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => handleCategoryChange(cat.name)}
            className={`category-pill flex-shrink-0 px-5 py-2.5 rounded-full border text-sm font-medium transition-all ${
              selectedCategory === cat.name
                ? 'bg-primary border-primary text-white'
                : 'border-white/20 text-gray-300 hover:border-primary hover:text-white'
            }`}
            data-testid={`filter-category-${cat.name.toLowerCase()}`}
          >
            {cat.name}
            <span className="ml-2 opacity-60">({cat.count})</span>
          </button>
        ))}
      </div>

      {/* Results Info */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-400">
          {loading ? 'Loading...' : `${channels.length} channels found`}
          {selectedCategory !== 'All' && ` in ${selectedCategory}`}
        </p>
      </div>

      {/* Channels Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array(8).fill(0).map((_, i) => (
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
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <ChannelCard channel={channel} />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <Radio size={64} className="mx-auto mb-4 text-gray-600" />
          <h3 className="text-xl font-semibold mb-2">No channels found</h3>
          <p className="text-gray-400 mb-6">
            {searchParams.get('search')
              ? `No results for "${searchParams.get('search')}"`
              : 'Try adjusting your filters'}
          </p>
          <Button
            onClick={clearFilters}
            variant="outline"
            className="border-white/20"
          >
            Clear All Filters
          </Button>
        </div>
      )}
    </div>
  );
};

export default Browse;
