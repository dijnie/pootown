"use client";

import React, { useState, useEffect } from "react";
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

export const SoundControl: React.FC = () => {
  const [effectsVolume, setEffectsVolumeState] = useState(0.7);
  const [musicVolume, setMusicVolumeState] = useState(0.3);
  const [isEffectsMuted, setIsEffectsMutedState] = useState(false);
  const [isMusicMuted, setIsMusicMutedState] = useState(false);
  const [showControls, setShowControls] = useState(false);

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
    <div className="relative">
      {/* Main Sound Settings Button - Neobrutalism Style */}
      <button
        onClick={() => {
          playSound("button-click", SOUND_CONFIG.volumes.buttonClick);
          setShowControls(!showControls);
        }}
        className="group relative bg-white border-4 border-black rounded-base shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-2px] hover:translate-y-[-2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all p-3"
        title="Sound Settings"
        onMouseEnter={() => playSound("button-hover", SOUND_CONFIG.volumes.buttonHover)}
      >
        <div className="flex items-center gap-2">
          <svg 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-black"
          >
            <path d="M11 5L6 9H2v6h4l5 4V5z"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          </svg>
          <span className="font-bold text-black text-sm hidden sm:inline">SOUND</span>
        </div>
      </button>

      {/* Expanded Controls Panel - Neobrutalism Style */}
      {showControls && (
        <div className="absolute bottom-full left-0 mb-3 bg-white border-4 border-black rounded-base shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] min-w-[320px] overflow-hidden">
          {/* Header */}
          <div className="bg-yellow-300 border-b-4 border-black p-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-black text-lg">🎵 SOUND SETTINGS</h3>
              <button
                onClick={() => {
                  playSound("button-click", SOUND_CONFIG.volumes.buttonClick);
                  setShowControls(false);
                }}
                className="w-8 h-8 flex items-center justify-center bg-white border-2 border-black rounded-base shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                onMouseEnter={() => playSound("button-hover", SOUND_CONFIG.volumes.buttonHover)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          <div className="p-4 space-y-5">
            {/* Music Controls */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-black text-sm flex items-center gap-2">
                  🎵 BACKGROUND MUSIC
                </span>
                <button
                  onClick={toggleMusicMute}
                  className={`w-10 h-10 flex items-center justify-center border-3 border-black rounded-base shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all ${
                    isMusicMuted ? 'bg-red-400' : 'bg-green-400'
                  }`}
                  title={isMusicMuted ? "Unmute Music" : "Mute Music"}
                >
                  {isMusicMuted ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-black">
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-black">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                    </svg>
                  )}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={isMusicMuted ? 0 : musicVolume}
                    onChange={(e) => handleMusicVolumeChange(parseFloat(e.target.value))}
                    className="w-full h-3 bg-gray-200 border-2 border-black rounded-base appearance-none cursor-pointer slider-music"
                    style={{
                      background: `linear-gradient(to right, #60a5fa ${(isMusicMuted ? 0 : musicVolume) * 100}%, #e5e7eb ${(isMusicMuted ? 0 : musicVolume) * 100}%)`
                    }}
                  />
                </div>
                <span className="font-bold text-black text-sm w-12 text-center bg-blue-200 border-2 border-black rounded-base px-2 py-1">
                  {Math.round((isMusicMuted ? 0 : musicVolume) * 100)}%
                </span>
              </div>
            </div>

            {/* Divider */}
            <div className="h-1 bg-black rounded-full"></div>

            {/* Effects Controls */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-black text-sm flex items-center gap-2">
                  🔊 SOUND EFFECTS
                </span>
                <button
                  onClick={toggleEffectsMute}
                  className={`w-10 h-10 flex items-center justify-center border-3 border-black rounded-base shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all ${
                    isEffectsMuted ? 'bg-red-400' : 'bg-green-400'
                  }`}
                  title={isEffectsMuted ? "Unmute Effects" : "Mute Effects"}
                >
                  {isEffectsMuted ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-black">
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-black">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                    </svg>
                  )}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={isEffectsMuted ? 0 : effectsVolume}
                    onChange={(e) => handleEffectsVolumeChange(parseFloat(e.target.value))}
                    className="w-full h-3 bg-gray-200 border-2 border-black rounded-base appearance-none cursor-pointer slider-effects"
                    style={{
                      background: `linear-gradient(to right, #4ade80 ${(isEffectsMuted ? 0 : effectsVolume) * 100}%, #e5e7eb ${(isEffectsMuted ? 0 : effectsVolume) * 100}%)`
                    }}
                  />
                </div>
                <span className="font-bold text-black text-sm w-12 text-center bg-green-200 border-2 border-black rounded-base px-2 py-1">
                  {Math.round((isEffectsMuted ? 0 : effectsVolume) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .slider-music::-webkit-slider-thumb,
        .slider-effects::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 4px;
          background: black;
          cursor: pointer;
          border: 3px solid white;
          box-shadow: 2px 2px 0px 0px rgba(0,0,0,0.5);
        }
        
        .slider-music::-moz-range-thumb,
        .slider-effects::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 4px;
          background: black;
          cursor: pointer;
          border: 3px solid white;
          box-shadow: 2px 2px 0px 0px rgba(0,0,0,0.5);
        }

        .slider-music::-webkit-slider-thumb:hover,
        .slider-effects::-webkit-slider-thumb:hover {
          transform: scale(1.1);
        }

        .slider-music::-webkit-slider-thumb:active,
        .slider-effects::-webkit-slider-thumb:active {
          transform: scale(0.95);
        }
      `}</style>
    </div>
  );
};
