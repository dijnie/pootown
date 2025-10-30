"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX, Music, Volume } from "lucide-react";
import {
  getEffectsVolume,
  setEffectsVolume,
  getMusicVolume,
  setMusicVolume,
  getEffectsMuted,
  setEffectsMuted,
  getMusicMuted,
  setMusicMuted,
  playBackgroundMusic,
  playSound,
  SOUND_CONFIG,
} from "@/lib/soundUtil";

export const SoundSettingsDialog: React.FC = () => {
  const [effectsVolume, setEffectsVolumeState] = useState(0.7);
  const [musicVolume, setMusicVolumeState] = useState(0.3);
  const [isEffectsMuted, setIsEffectsMutedState] = useState(false);
  const [isMusicMuted, setIsMusicMutedState] = useState(false);

  useEffect(() => {
    // Initialize with current volumes
    setEffectsVolumeState(getEffectsVolume());
    setMusicVolumeState(getMusicVolume());
    setIsEffectsMutedState(getEffectsMuted());
    setIsMusicMutedState(getMusicMuted());

    // Start background music
    playBackgroundMusic();
  }, []);

  const handleEffectsVolumeChange = (newVolume: number) => {
    setEffectsVolumeState(newVolume);
    setEffectsVolume(newVolume);
    if (newVolume > 0) {
      setIsEffectsMutedState(false);
      setEffectsMuted(false);
    }
  };

  const handleMusicVolumeChange = (newVolume: number) => {
    setMusicVolumeState(newVolume);
    setMusicVolume(newVolume);
    if (newVolume > 0) {
      setIsMusicMutedState(false);
      setMusicMuted(false);
    }
  };

  const toggleEffectsMute = () => {
    playSound("button-click", SOUND_CONFIG.volumes.buttonClick);
    const newMuted = !isEffectsMuted;
    setIsEffectsMutedState(newMuted);
    setEffectsMuted(newMuted);
  };

  const toggleMusicMute = () => {
    playSound("button-click", SOUND_CONFIG.volumes.buttonClick);
    const newMuted = !isMusicMuted;
    setIsMusicMutedState(newMuted);
    setMusicMuted(newMuted);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="icon"
          className="h-8 w-8"
          onClick={() =>
            playSound("button-click", SOUND_CONFIG.volumes.buttonClick)
          }
        >
          <Volume2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            Sound Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Background Music Controls */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4" />
                <span className="text-sm font-medium">Background Music</span>
              </div>
              <Button
                variant={isMusicMuted ? "neutral" : "default"}
                size="icon"
                className="h-8 w-8"
                onClick={toggleMusicMute}
              >
                {isMusicMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMusicMuted ? 0 : musicVolume}
                onChange={(e) =>
                  handleMusicVolumeChange(parseFloat(e.target.value))
                }
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <span className="text-sm font-medium w-12 text-right">
                {Math.round((isMusicMuted ? 0 : musicVolume) * 100)}%
              </span>
            </div>
          </div>

          {/* Sound Effects Controls */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                <span className="text-sm font-medium">Sound Effects</span>
              </div>
              <Button
                variant={isEffectsMuted ? "neutral" : "default"}
                size="icon"
                className="h-8 w-8"
                onClick={toggleEffectsMute}
              >
                {isEffectsMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isEffectsMuted ? 0 : effectsVolume}
                onChange={(e) =>
                  handleEffectsVolumeChange(parseFloat(e.target.value))
                }
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
              <span className="text-sm font-medium w-12 text-right">
                {Math.round((isEffectsMuted ? 0 : effectsVolume) * 100)}%
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
