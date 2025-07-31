import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';

import type { Database } from './types';

const SUPABASE_URL = "https://ojmiubjjnvswaoprueio.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qbWl1YmpqbnZzd2FvcHJ1ZWlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMTQyODcsImV4cCI6MjA2NTU5MDI4N30.4djPgHjQsvOIIqw4AWwxHQR6t_PG3NhbVDuojpJqQDQ";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Mock data for demonstration
const mockFeedbackData = [
  {
    id: '1',
    timestamp: '2024-01-15T10:30:00Z',
    rating: 5,
    category: 'User Interface',
    message: 'The new dashboard is amazing! Very intuitive and easy to navigate.',
    status: 'new' as const
  },
  {
    id: '2',
    timestamp: '2024-01-14T14:20:00Z',
    rating: 4,
    category: 'Notifications',
    message: 'SMS notifications work great, but email notifications could be faster.',
    status: 'reviewed' as const
  },
  {
    id: '3',
    timestamp: '2024-01-13T09:15:00Z',
    rating: 3,
    category: 'Performance',
    message: 'The system is good but sometimes loads slowly during peak hours.',
    status: 'resolved' as const
  },
  {
    id: '4',
    timestamp: '2024-01-12T16:45:00Z',
    rating: 5,
    category: 'Features',
    message: 'Love the new result tracking feature! Very helpful for monitoring progress.',
    status: 'new' as const
  },
  {
    id: '5',
    timestamp: '2024-01-11T11:30:00Z',
    rating: 2,
    category: 'Bug Report',
    message: 'Found a bug where the CGPA calculation seems incorrect for some courses.',
    status: 'reviewed' as const
  }
];

interface FeedbackResponse {
  id: string;
  timestamp: string;
  rating: number;
  category: string;
  message: string;
  status: 'new' | 'reviewed' | 'resolved';
}

interface FeedbackInput {
  rating: number;
  category: string;
  message: string;
}

interface FeedbackSettings {
  autoRefresh: boolean;
  refreshInterval: number; // in minutes
  enableCategories: string[];
  requireMessage: boolean;
}

const defaultSettings: FeedbackSettings = {
  autoRefresh: false,
  refreshInterval: 5,
  enableCategories: ['User Interface', 'Performance', 'Features', 'Bug Report', 'General'],
  requireMessage: true
};

export const useFeedback = () => {
  const [feedbackData, setFeedbackData] = useState<FeedbackResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<FeedbackSettings>(defaultSettings);
  
  const { toast } = useToast();

  // Load feedback from database on mount
  useEffect(() => {
    loadFeedbackData();
    loadSettings();
  }, []);

  // Load all feedback from Supabase
  const loadFeedbackData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase
        .from('feedback_responses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading feedback:', error);
        throw new Error(error.message);
      }

      // Transform database data to component format
      const transformedData: FeedbackResponse[] = (data || []).map(item => ({
        id: item.id,
        timestamp: item.created_at,
        rating: item.rating,
        category: item.category,
        message: item.message,
        status: item.status as 'new' | 'reviewed' | 'resolved'
      }));

      setFeedbackData(transformedData);
      console.log(`Loaded ${transformedData.length} feedback responses from database`);
      
    } catch (error) {
      console.error('Error loading feedback data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load feedback data');
      
      // Fallback to mock data if database fails
      setFeedbackData(mockFeedbackData);
      
      toast({
        title: "Database Connection Error",
        description: "Using sample data. Please check your database connection.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Load settings from Supabase
  const loadSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('feedback_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error loading settings:', error);
        return;
      }

      if (data) {
        const loadedSettings: FeedbackSettings = {
          autoRefresh: data.auto_refresh || false,
          refreshInterval: data.refresh_interval || 5,
          enableCategories: data.enabled_categories || defaultSettings.enableCategories,
          requireMessage: data.require_message !== false
        };
        
        setSettings(loadedSettings);
        console.log('Loaded settings from database:', loadedSettings);
      }
    } catch (error) {
      console.error('Error loading feedback settings:', error);
      setSettings(defaultSettings);
    }
  }, []);

  // Save settings to Supabase
  const saveSettings = useCallback(async (newSettings: Partial<FeedbackSettings>) => {
    try {
      setLoading(true);
      const updatedSettings = { ...settings, ...newSettings };
      
      const settingsToSave = {
        auto_refresh: updatedSettings.autoRefresh,
        refresh_interval: updatedSettings.refreshInterval,
        enabled_categories: updatedSettings.enableCategories,
        require_message: updatedSettings.requireMessage,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('feedback_settings')
        .upsert(settingsToSave, {
          onConflict: 'id'
        });

      if (error) {
        console.error('Supabase error details:', error);
        throw new Error(error.message);
      }

      setSettings(updatedSettings);
      
      toast({
        title: "Settings Saved",
        description: "Feedback settings have been saved successfully."
      });

      return true;
    } catch (error) {
      console.error('Error saving feedback settings:', error);
      
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save settings.",
        variant: "destructive"
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [settings, toast]);

  // Submit new feedback to database
  const submitFeedback = useCallback(async (feedback: FeedbackInput) => {
    try {
      setLoading(true);
      setError(null);

      // Validate input
      if (!feedback.rating || feedback.rating < 1 || feedback.rating > 5) {
        throw new Error('Rating must be between 1 and 5');
      }

      if (!feedback.category?.trim()) {
        throw new Error('Category is required');
      }

      if (settings.requireMessage && !feedback.message?.trim()) {
        throw new Error('Message is required');
      }

      const feedbackToSave = {
        rating: feedback.rating,
        category: feedback.category.trim(),
        message: feedback.message?.trim() || '',
        status: 'new',
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('feedback_responses')
        .insert([feedbackToSave])
        .select()
        .single();

      if (error) {
        console.error('Error submitting feedback:', error);
        throw new Error(error.message);
      }

      // Add new feedback to local state
      const newFeedback: FeedbackResponse = {
        id: data.id,
        timestamp: data.created_at,
        rating: data.rating,
        category: data.category,
        message: data.message,
        status: data.status as 'new' | 'reviewed' | 'resolved'
      };

      setFeedbackData(prev => [newFeedback, ...prev]);

      toast({
        title: "Feedback Submitted",
        description: "Thank you for your feedback! It has been saved successfully."
      });

      return true;
    } catch (error) {
      console.error('Error submitting feedback:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit feedback';
      setError(errorMessage);
      
      toast({
        title: "Submission Error",
        description: errorMessage,
        variant: "destructive"
      });
      
      return false;
    } finally {
      setLoading(false);
    }
  }, [settings.requireMessage, toast]);

  // Update feedback status in database
  const updateFeedbackStatus = useCallback(async (feedbackId: string, newStatus: 'new' | 'reviewed' | 'resolved') => {
    try {
      setLoading(true);

      const { error } = await supabase
        .from('feedback_responses')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', feedbackId);

      if (error) {
        console.error('Error updating feedback status:', error);
        throw new Error(error.message);
      }

      // Update local state
      setFeedbackData(prev => 
        prev.map(item => 
          item.id === feedbackId 
            ? { ...item, status: newStatus }
            : item
        )
      );
      
      toast({
        title: "Status Updated",
        description: `Feedback marked as ${newStatus}.`
      });

      return true;
    } catch (error) {
      console.error('Error updating feedback status:', error);
      toast({
        title: "Update Error",
        description: error instanceof Error ? error.message : "Failed to update status.",
        variant: "destructive"
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Delete feedback from database
  const deleteFeedback = useCallback(async (feedbackId: string) => {
    try {
      setLoading(true);

      const { error } = await supabase
        .from('feedback_responses')
        .delete()
        .eq('id', feedbackId);

      if (error) {
        console.error('Error deleting feedback:', error);
        throw new Error(error.message);
      }

      // Remove from local state
      setFeedbackData(prev => prev.filter(item => item.id !== feedbackId));
      
      toast({
        title: "Feedback Deleted",
        description: "Feedback has been permanently deleted."
      });

      return true;
    } catch (error) {
      console.error('Error deleting feedback:', error);
      toast({
        title: "Delete Error",
        description: error instanceof Error ? error.message : "Failed to delete feedback.",
        variant: "destructive"
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Get feedback statistics
  const getStatistics = useCallback(() => {
    const totalResponses = feedbackData.length;
    const averageRating = totalResponses > 0 
      ? feedbackData.reduce((sum, item) => sum + item.rating, 0) / totalResponses 
      : 0;
    const newFeedback = feedbackData.filter(item => item.status === 'new').length;
    const reviewedFeedback = feedbackData.filter(item => item.status === 'reviewed').length;
    const resolvedFeedback = feedbackData.filter(item => item.status === 'resolved').length;
    
    const categoryBreakdown = feedbackData.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const ratingDistribution = feedbackData.reduce((acc, item) => {
      acc[item.rating] = (acc[item.rating] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    // Calculate trends (last 7 days vs previous 7 days)
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const recentFeedback = feedbackData.filter(item => 
      new Date(item.timestamp) >= sevenDaysAgo
    );
    const previousFeedback = feedbackData.filter(item => {
      const date = new Date(item.timestamp);
      return date >= fourteenDaysAgo && date < sevenDaysAgo;
    });

    const recentAverage = recentFeedback.length > 0 
      ? recentFeedback.reduce((sum, item) => sum + item.rating, 0) / recentFeedback.length 
      : 0;
    const previousAverage = previousFeedback.length > 0 
      ? previousFeedback.reduce((sum, item) => sum + item.rating, 0) / previousFeedback.length 
      : 0;

    return {
      totalResponses,
      averageRating,
      newFeedback,
      reviewedFeedback,
      resolvedFeedback,
      categoryBreakdown,
      ratingDistribution,
      recentFeedback: recentFeedback.length,
      ratingTrend: recentAverage - previousAverage
    };
  }, [feedbackData]);

  // Filter feedback data
  const filterFeedback = useCallback((
    searchTerm: string = '',
    category: string = 'all',
    rating: string = 'all',
    status: string = 'all',
    dateRange?: { start: Date; end: Date }
  ) => {
    return feedbackData.filter(item => {
      const matchesSearch = 
        item.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = category === 'all' || item.category === category;
      const matchesRating = rating === 'all' || item.rating.toString() === rating;
      const matchesStatus = status === 'all' || item.status === status;
      
      const matchesDateRange = !dateRange || (
        new Date(item.timestamp) >= dateRange.start &&
        new Date(item.timestamp) <= dateRange.end
      );
      
      return matchesSearch && matchesCategory && matchesRating && matchesStatus && matchesDateRange;
    });
  }, [feedbackData]);

  // Get unique categories
  const getCategories = useCallback(() => {
    return [...new Set(feedbackData.map(item => item.category))];
  }, [feedbackData]);

  // Export feedback data
  const exportFeedbackData = useCallback((format: 'csv' | 'json' = 'csv') => {
    try {
      let content: string;
      let filename: string;
      let mimeType: string;

      if (format === 'csv') {
        const headers = ['Timestamp', 'Rating', 'Category', 'Message', 'Status'];
        const csvContent = [
          headers.join(','),
          ...feedbackData.map(item => [
            item.timestamp,
            item.rating,
            `"${item.category}"`,
            `"${item.message.replace(/"/g, '""')}"`,
            item.status
          ].join(','))
        ].join('\n');
        
        content = csvContent;
        filename = `feedback-export-${new Date().toISOString().split('T')[0]}.csv`;
        mimeType = 'text/csv';
      } else {
        content = JSON.stringify(feedbackData, null, 2);
        filename = `feedback-export-${new Date().toISOString().split('T')[0]}.json`;
        mimeType = 'application/json';
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Export Successful",
        description: `Feedback data exported as ${format.toUpperCase()}`
      });
      
      return true;
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Error",
        description: "Failed to export feedback data",
        variant: "destructive"
      });
      return false;
    }
  }, [feedbackData, toast]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Refresh feedback data
  const refreshFeedbackData = useCallback(async () => {
    await loadFeedbackData();
  }, [loadFeedbackData]);

  return {
    feedbackData,
    loading,
    error,
    settings,
    submitFeedback,
    loadFeedbackData,
    refreshFeedbackData,
    saveSettings,
    updateFeedbackStatus,
    deleteFeedback,
    getStatistics,
    filterFeedback,
    getCategories,
    exportFeedbackData,
    clearError
  };
};
