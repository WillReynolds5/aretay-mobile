import React, { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Audio, AVPlaybackStatus } from 'expo-av';

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

  // Expose pause and play methods via ref
  useImperativeHandle(ref, () => ({
    pause: async () => {
      if (sound) {
        try {
          const status = await sound.getStatusAsync();
          if (status.isLoaded && status.isPlaying) {
            await sound.pauseAsync();
            setIsPlaying(false);
          } else if (!status.isLoaded) {
            console.log('AudioPlayer: Pause called, but sound is not loaded.');
          }
        } catch (error) {
          console.log('AudioPlayer: Error during pause:', error);
          setIsPlaying(false); // Ensure UI consistency
        }
      }
    },
    play: async () => {
      if (sound && !isLoading) { // isLoading check might be redundant if sound.getStatusAsync().isLoaded is primary
        try {
          const status = await sound.getStatusAsync();
          if (status.isLoaded && !status.isPlaying) {
            if (startPosition !== null) {
              const currentPositionMillis = status.positionMillis;
              if (Math.abs(currentPositionMillis - startPosition * 1000) > 100) { // 100ms tolerance
                console.log(`AudioPlayer: play() called, seeking to startPosition: ${startPosition}`);
                await sound.setPositionAsync(startPosition * 1000);
              }
            }
            await sound.playAsync();
            setIsPlaying(true);
          } else if (!status.isLoaded) {
            console.log('AudioPlayer: Play called, but sound is not loaded.');
          } else if (status.isLoaded && status.isPlaying) {
            console.log('AudioPlayer: Play called, but sound is already playing.');
          }
        } catch (error) {
          console.log('AudioPlayer: Error in play method:', error);
          setIsPlaying(false);
        }
      } else if (!sound) {
         console.log('AudioPlayer: Play called, but sound object is null.');
      } else if (isLoading) {
         console.log('AudioPlayer: Play called while sound is loading.');
      }
    }
  }));

  // Effect for loading/unloading sound based on audioUrl and enabled status
  useEffect(() => {
    let isMounted = true;
    let currentSoundObject: Audio.Sound | null = null;

    const loadSound = async () => {
      if (!enabled || !audioUrl) {
        setIsLoading(false);
        if (sound) { // If there's an old sound, unload it
          console.log('AudioPlayer: audioUrl or enabled changed, unloading previous sound.');
          await sound.unloadAsync().catch(e => console.log("Error unloading previous sound", e));
          setSound(null);
          setIsPlaying(false);
        }
        return;
      }

      setIsLoading(true);
      const newSoundObject = new Audio.Sound();
      currentSoundObject = newSoundObject; // Keep track for cleanup

      try {
        let finalUrl = audioUrl;
        if (!audioUrl.startsWith('http') && getSignedUrl) {
          const url = await getSignedUrl(audioUrl);
          if (url) finalUrl = url;
          else { throw new Error("Failed to get signed URL"); }
        }

        console.log(`AudioPlayer: Loading sound from ${finalUrl}`);
        await newSoundObject.loadAsync({ uri: finalUrl }, { shouldPlay: false });

        if (isMounted) {
          // Unload any previous sound before setting the new one
          if (sound && sound !== newSoundObject) {
             console.log('AudioPlayer: Unloading sound before setting new one.');
             await sound.unloadAsync().catch(e => console.log("Error unloading old sound before setting new", e));
          }
          setSound(newSoundObject);
          setIsLoading(false);
          // Note: isPlaying should be false here, as shouldPlay is false
          setIsPlaying(false); 
        } else {
          // Component unmounted before loading finished
          console.log('AudioPlayer: Component unmounted during load, unloading sound.');
          await newSoundObject.unloadAsync().catch(e => console.log("Error unloading sound on unmount during load", e));
        }
      } catch (error) {
        console.log('AudioPlayer: Error loading audio:', error);
        if (isMounted) {
          setIsLoading(false);
          setSound(null); // Ensure sound is null on error
          setIsPlaying(false);
        }
        // If there was an error, ensure the new sound object is unloaded if it exists
        if (newSoundObject) {
            await newSoundObject.unloadAsync().catch(e => console.log("Error unloading sound after load error", e));
        }
      }
    };

    loadSound();

    return () => {
      isMounted = false;
      console.log('AudioPlayer: Cleanup for loadSound effect. Current audioUrl:', audioUrl);
      if (currentSoundObject) {
        console.log('AudioPlayer: Unloading sound in cleanup (currentSoundObject)');
        currentSoundObject.unloadAsync().catch(e => console.log("Error unloading currentSoundObject in cleanup", e));
      } else if (sound) {
        // Fallback in case currentSoundObject wasn't set due to early return or error
        console.log('AudioPlayer: Unloading sound in cleanup (sound state)');
        sound.unloadAsync().catch(e => console.log("Error unloading sound from state in cleanup", e));
      }
      setSound(null); // Clear sound state on cleanup
      setIsPlaying(false);
      setIsLoading(false);
    };
  }, [audioUrl, enabled, getSignedUrl]); // Primary dependencies for loading

  // Effect for handling onPlaybackStatusUpdate (for endPosition)
  useEffect(() => {
    if (!sound) { // Simpler check: if sound object doesn't exist, do nothing.
        // console.log("AudioPlayer: StatusUpdateEffect - Sound object is null.");
        return;
    }

    const statusUpdateCallback = (status: AVPlaybackStatus) => { // Use imported AVPlaybackStatus
      if (!status.isLoaded) {
        // If the sound is no longer loaded (e.g., due to unloadAsync), update isPlaying
        if (isPlaying) setIsPlaying(false);
        return;
      }

      // Update isPlaying state based on the actual sound status
      if (status.isPlaying !== isPlaying) {
        setIsPlaying(status.isPlaying);
      }

      if (status.isPlaying && endPosition !== null && status.positionMillis >= endPosition * 1000) {
        console.log('AudioPlayer: Reached end position:', status.positionMillis, 'End:', endPosition * 1000);
        onFinish?.();
      }

      // Handle natural end of audio if no endPosition is set or if it's beyond duration
      if (status.didJustFinish && !status.isLooping) {
        console.log('AudioPlayer: Audio didJustFinish.');
        setIsPlaying(false); // Ensure isPlaying is false
        // If there's an onFinish, it might be called here too,
        // depending on whether endPosition is the primary trigger.
        // For now, let endPosition logic handle onFinish.
        // If no endPosition, this could be a place to call onFinish.
        if (endPosition === null) {
           onFinish?.(); // Call onFinish if audio naturally ends and no specific endPosition was set
        }
      }
    };

    sound.setOnPlaybackStatusUpdate(statusUpdateCallback);

    return () => {
      if (sound) { // Simpler check for cleanup
        // console.log("AudioPlayer: Clearing playback status update callback.");
        sound.setOnPlaybackStatusUpdate(null);
      }
    };
  }, [sound, endPosition, onFinish, isPlaying]); // isPlaying added to re-evaluate if UI state gets out of sync

  // Effect to handle startPosition changes (seeking)
  useEffect(() => {
    if (sound && startPosition !== null) { // Don't need isPlaying here, can seek a paused sound
      const seek = async () => {
        try {
          const status = await sound.getStatusAsync();
          if (status.isLoaded) {
             // Only seek if not already at/near the target startPosition to avoid redundant seeks
            if (Math.abs(status.positionMillis - startPosition * 1000) > 100) { // 100ms tolerance
                console.log(`AudioPlayer: startPosition prop changed to ${startPosition}, seeking.`);
                await sound.setPositionAsync(startPosition * 1000);
            }
          } else {
            console.log(`AudioPlayer: startPosition prop changed, but sound not loaded. Cannot seek.`);
          }
        } catch (error) {
          console.log('AudioPlayer: Error setting position for new startPosition:', error);
        }
      };
      seek();
    }
  }, [sound, startPosition]);

  // Simple toggle play/pause function
  const togglePlayback = async () => {
    if (!sound || isLoading) return;
    
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
    }
  };

  if (!enabled || !audioUrl) {
    return null;
  }

  return (
    <TouchableOpacity 
      style={[
        styles.playButton,
        isLoading && styles.loadingButton
      ]}
      onPress={togglePlayback}
      disabled={isLoading}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color="#fff" />
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
}); 