"use client";

import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings, RotateCcw, RotateCw, Volume2, VolumeX, Music, Volume, X } from "lucide-react";
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

interface GameSettingsDialogProps {
    onRotateCW: () => void;
    onRotateCCW: () => void;
    boardRotation: number;
}

export const GameSettingsDialog: React.FC<GameSettingsDialogProps> = ({
    onRotateCW,
    onRotateCCW,
    boardRotation,
}) => {
    const [effectsVolume, setEffectsVolumeState] = useState(0.7);
    const [musicVolume, setMusicVolumeState] = useState(0.3);
    const [isEffectsMuted, setIsEffectsMutedState] = useState(false);
    const [isMusicMuted, setIsMusicMutedState] = useState(false);
    const [open, setOpen] = useState(false);

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
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    // variant="outline"
                    className="w-full border-4 border-black rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-2px] hover:translate-y-[-2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all font-bold"
                    onClick={() =>
                        playSound("button-click", SOUND_CONFIG.volumes.buttonClick)
                    }
                >
                    <Settings className="h-4 w-4 mr-2" />
                    GAME SETTINGS
                </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] sm:w-[90vw] md:max-w-[500px] lg:max-w-[550px] p-0 gap-0 border-4 border-black rounded-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] sm:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="bg-yellow-300 border-b-4 border-black p-3 sm:p-4 md:p-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 sm:gap-3">
                            <div className="bg-white border-3 border-black rounded-none p-1.5 sm:p-2 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                <Settings className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                            </div>
                            <h2 className="font-bold text-lg sm:text-xl md:text-2xl">GAME SETTINGS</h2>
                        </div>
                        <button
                            onClick={() => {
                                playSound("button-click", SOUND_CONFIG.volumes.buttonClick);
                                setOpen(false);
                            }}
                            className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 flex items-center justify-center bg-white border-3 border-black rounded-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] sm:hover:translate-x-[3px] sm:hover:translate-y-[3px] active:bg-red-400 transition-all"
                        >
                            <X className="h-4 w-4 sm:h-5 sm:w-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-5 md:space-y-6 bg-white">
                    {/* Sound Settings Section */}
                    <div className="space-y-3 sm:space-y-4">
                        <div className="bg-blue-100 border-3 border-black rounded-none p-2 sm:p-2.5 md:p-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                            <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
                                <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" />
                                SOUND SETTINGS
                            </h3>
                        </div>

                        {/* Background Music */}
                        <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 border-3 border-black rounded-none bg-white">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 sm:gap-2">
                                    <Music className="h-4 w-4 sm:h-5 sm:w-5" />
                                    <span className="font-bold text-sm sm:text-base">Background Music</span>
                                </div>
                                <button
                                    onClick={toggleMusicMute}
                                    className={`w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center border-3 border-black rounded-none shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] sm:hover:translate-x-[4px] sm:hover:translate-y-[4px] transition-all ${isMusicMuted ? "bg-red-400" : "bg-green-400"
                                        }`}
                                >
                                    {isMusicMuted ? (
                                        <VolumeX className="h-4 w-4 sm:h-5 sm:w-5" />
                                    ) : (
                                        <Volume className="h-4 w-4 sm:h-5 sm:w-5" />
                                    )}
                                </button>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                                <div className="flex-1 relative">
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={isMusicMuted ? 0 : musicVolume}
                                        onChange={(e) =>
                                            handleMusicVolumeChange(parseFloat(e.target.value))
                                        }
                                        className="w-full h-3 sm:h-4 bg-gray-200 border-3 border-black rounded-none appearance-none cursor-pointer slider-music"
                                        style={{
                                            background: `linear-gradient(to right, #60a5fa ${(isMusicMuted ? 0 : musicVolume) * 100
                                                }%, #e5e7eb ${(isMusicMuted ? 0 : musicVolume) * 100}%)`,
                                        }}
                                    />
                                </div>
                                <span className="font-bold text-sm sm:text-base md:text-lg w-12 sm:w-14 md:w-16 text-center bg-blue-200 border-3 border-black rounded-none px-2 sm:px-3 py-1 sm:py-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                                    {Math.round((isMusicMuted ? 0 : musicVolume) * 100)}%
                                </span>
                            </div>
                        </div>

                        {/* Sound Effects */}
                        <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 border-3 border-black rounded-none bg-white">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 sm:gap-2">
                                    <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" />
                                    <span className="font-bold text-sm sm:text-base">Sound Effects</span>
                                </div>
                                <button
                                    onClick={toggleEffectsMute}
                                    className={`w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center border-3 border-black rounded-none shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] sm:hover:translate-x-[4px] sm:hover:translate-y-[4px] transition-all ${isEffectsMuted ? "bg-red-400" : "bg-green-400"
                                        }`}
                                >
                                    {isEffectsMuted ? (
                                        <VolumeX className="h-4 w-4 sm:h-5 sm:w-5" />
                                    ) : (
                                        <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" />
                                    )}
                                </button>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                                <div className="flex-1 relative">
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={isEffectsMuted ? 0 : effectsVolume}
                                        onChange={(e) =>
                                            handleEffectsVolumeChange(parseFloat(e.target.value))
                                        }
                                        className="w-full h-3 sm:h-4 bg-gray-200 border-3 border-black rounded-none appearance-none cursor-pointer slider-effects"
                                        style={{
                                            background: `linear-gradient(to right, #4ade80 ${(isEffectsMuted ? 0 : effectsVolume) * 100
                                                }%, #e5e7eb ${(isEffectsMuted ? 0 : effectsVolume) * 100}%)`,
                                        }}
                                    />
                                </div>
                                <span className="font-bold text-sm sm:text-base md:text-lg w-12 sm:w-14 md:w-16 text-center bg-green-200 border-3 border-black rounded-none px-2 sm:px-3 py-1 sm:py-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] sm:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                                    {Math.round((isEffectsMuted ? 0 : effectsVolume) * 100)}%
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="h-1 bg-black rounded-none"></div>

                    {/* Board Rotation Section */}
                    <div className="space-y-3 sm:space-y-4">
                        <div className="bg-purple-100 border-3 border-black rounded-none p-2 sm:p-2.5 md:p-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                            <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
                                <RotateCw className="h-4 w-4 sm:h-5 sm:w-5" />
                                BOARD ROTATION
                            </h3>
                        </div>

                        <div className="flex items-center justify-between p-3 sm:p-4 border-3 border-black rounded-none bg-white">
                            <span className="font-bold text-sm sm:text-base">Current: <span className="font-bold text-base sm:text-lg bg-purple-200 border-2 border-black rounded-none px-2 sm:px-3 py-0.5 sm:py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] inline-block ml-1">{boardRotation}°</span></span>
                            <div className="flex items-center gap-2 sm:gap-3">
                                <button
                                    onClick={() => {
                                        playSound("button-click", SOUND_CONFIG.volumes.buttonClick);
                                        onRotateCCW();
                                    }}
                                    className="w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center bg-white border-3 border-black rounded-none shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] sm:hover:translate-x-[4px] sm:hover:translate-y-[4px] active:bg-blue-300 transition-all"
                                    title="Rotate Left"
                                >
                                    <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
                                </button>
                                <button
                                    onClick={() => {
                                        playSound("button-click", SOUND_CONFIG.volumes.buttonClick);
                                        onRotateCW();
                                    }}
                                    className="w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center bg-white border-3 border-black rounded-none shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] sm:hover:translate-x-[4px] sm:hover:translate-y-[4px] active:bg-blue-300 transition-all"
                                    title="Rotate Right"
                                >
                                    <RotateCw className="h-4 w-4 sm:h-5 sm:w-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <style jsx>{`
          .slider-music::-webkit-slider-thumb,
          .slider-effects::-webkit-slider-thumb {
            appearance: none;
            height: 24px;
            width: 24px;
            border-radius: 0;
            background: black;
            cursor: pointer;
            border: 3px solid white;
            box-shadow: 3px 3px 0px 0px rgba(0, 0, 0, 0.8);
          }

          .slider-music::-moz-range-thumb,
          .slider-effects::-moz-range-thumb {
            height: 24px;
            width: 24px;
            border-radius: 0;
            background: black;
            cursor: pointer;
            border: 3px solid white;
            box-shadow: 3px 3px 0px 0px rgba(0, 0, 0, 0.8);
          }

          .slider-music::-webkit-slider-thumb:hover,
          .slider-effects::-webkit-slider-thumb:hover {
            transform: scale(1.1);
          }

          .slider-music::-webkit-slider-thumb:active,
          .slider-effects::-webkit-slider-thumb:active {
            transform: scale(0.95);
            box-shadow: none;
          }
        `}</style>
            </DialogContent>
        </Dialog>
    );
};

