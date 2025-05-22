import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from "react";
import { ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Audio } from 'expo-av';

interface AudioPlayerProps {
  audioUrl: string | null;
  enabled: boolean;
  getSignedUrl?: (storagePath: string) => Promise<string | null>;
  startPosition?: number | null; // Position in seconds where to start playback
  endPosition?: number | null; // Position in seconds where this page's content ends
  onFinish?: () => void; // Callback when reaching the end position
}

export interface AudioPlayerRef {
  pause: () => Promise<void>;
  play: () => Promise<void>;
  isPlaying: () => boolean;
  isLoaded: () => boolean;
}

const AudioPlayer = forwardRef<AudioPlayerRef, AudioPlayerProps>(({
  audioUrl,
  enabled,
  getSignedUrl,
  startPosition = null,
  endPosition = null,
  onFinish,
}, ref) => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [soundLoaded, setSoundLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const isMountedRef = useRef(true);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    pause: async () => {
      if (sound && soundLoaded) {
        try {
          await sound.pauseAsync();
          setIsPlaying(false);
        } catch (err) {
          console.log('Error pausing sound:', err);
        }
      }
      return Promise.resolve();
    },
    play: async () => {
      if (sound && soundLoaded) {
        try {
          // If we have a start position, set it before playing
          if (startPosition !== null) {
            await sound.setPositionAsync(startPosition * 1000);
          }
          await sound.playAsync();
          setIsPlaying(true);
        } catch (err) {
          console.log('Error playing sound:', err);
        }
      }
      return Promise.resolve();
    },
    isPlaying: () => isPlaying,
    isLoaded: () => soundLoaded
  }));

  // Clean load/unload of sound
  useEffect(() => {
    // Track component mount state
    isMountedRef.current = true;
    
    // Reset state when audioUrl changes
    setIsLoading(false);
    setSoundLoaded(false);
    setIsPlaying(false);
    setHasError(false);
    
    // Clean up previous sound if exists
    if (sound) {
      const oldSound = sound;
      setSound(null);
      oldSound.unloadAsync().catch(() => {});
    }
    
    // Don't load if no URL or disabled
    if (!audioUrl || !enabled) {
      return;
    }
    
    // Load new sound
    const soundObject = new Audio.Sound();
    setSound(soundObject);
    setIsLoading(true);
    
    const loadSound = async () => {
      try {
        // Get the proper audio URL
        let finalUrl = audioUrl;
        if (!audioUrl.startsWith('http') && getSignedUrl) {
          const url = await getSignedUrl(audioUrl);
          if (url) finalUrl = url;
        }
        
        // Load the audio
        await soundObject.loadAsync({ uri: finalUrl }, { shouldPlay: false });
        
        // Set up position tracking to detect page end
        if (endPosition !== null) {
          soundObject.setOnPlaybackStatusUpdate(status => {
            if (!status.isLoaded || !status.isPlaying) return;
            
            // Check if we've reached the end position
            if (endPosition && status.positionMillis >= endPosition * 1000) {
              console.log('Reached end position:', status.positionMillis, 'End:', endPosition * 1000);
              // Don't pause audio, just notify about reaching the end
              onFinish?.();
            }
          });
        }
        
        if (isMountedRef.current) {
          setSoundLoaded(true);
          setIsLoading(false);
        }
      } catch (error) {
        console.log('Error loading audio:', error);
        if (isMountedRef.current) {
          setHasError(true);
          setIsLoading(false);
        }
      }
    };
    
    loadSound();
    
    // Cleanup function
    return () => {
      isMountedRef.current = false;
      if (soundObject) {
        soundObject.unloadAsync().catch(() => {});
      }
    };
  }, [audioUrl, enabled, getSignedUrl, endPosition, onFinish]);

  // Simple toggle play/pause function
  const togglePlayback = async () => {
    if (!sound || isLoading || !soundLoaded) return;
    
    try {
      if (isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        // If we have a start position, set it before playing
        if (startPosition !== null) {
          await sound.setPositionAsync(startPosition * 1000); // Convert to milliseconds
        }
        await sound.playAsync();
        setIsPlaying(true);
      }
    } catch (error) {
      console.log('Error toggling playback:', error);
      setHasError(true);
    }
  };

  if (!enabled || !audioUrl) {
    return null;
  }

  return (
    <TouchableOpacity 
      style={[
        styles.playButton,
        isLoading && styles.loadingButton,
        hasError && styles.errorButton
      ]}
      onPress={togglePlayback}
      disabled={isLoading || hasError}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : hasError ? (
        <Feather 
          name="alert-circle" 
          size={20} 
          color="#fff" 
        />
      ) : (
        <Feather 
          name={isPlaying ? "pause" : "play"} 
          size={20} 
          color="#fff" 
        />
      )}
    </TouchableOpacity>
  );
});

export default AudioPlayer;

const styles = StyleSheet.create({
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#3f51b5",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingButton: {
    backgroundColor: "#666",
  },
  errorButton: {
    backgroundColor: "#e53935",
  },
}); 