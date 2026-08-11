"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { 
  Trophy, 
  TrendingUp, 
  Clock, 
  Target, 
  Coins, 
  Calendar,
  Award,
  Star,
  Crown,
  Copy,
  ExternalLink
} from "lucide-react";
import { formatAddress } from "@/lib/utils";
import { getRandomAvatarByAddress } from "@/lib/avatar-utils";
import type { TopPlayerItem } from "@/services/leaderboard";

interface PlayerProfileModalProps {
  player: TopPlayerItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PlayerProfileModal({ player, isOpen, onClose }: PlayerProfileModalProps) {
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [activeTab, setActiveTab] = useState<"stats" | "achievements">("stats");

  if (!player) return null;

  const username = player.playerName || formatAddress(player.walletAddress);
  const avatar = getRandomAvatarByAddress(player.walletAddress);
  const winRate = Math.round(player.winRate);
  const lastActive = new Date(player.lastActiveDate);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(player.walletAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const achievements = [
    {
      id: "high-roller",
      name: "High Roller",
      description: "Earned over 100 SOL",
      icon: Coins,
      unlocked: player.totalEarnings >= 100,
      color: "text-yellow-500",
    },
    {
      id: "veteran",
      name: "Veteran Player",
      description: "Played over 50 games",
      icon: Trophy,
      unlocked: player.totalGamesPlayed >= 50,
      color: "text-blue-500",
    },
    {
      id: "winner",
      name: "Champion",
      description: "Win rate above 70%",
      icon: Crown,
      unlocked: winRate >= 70,
      color: "text-purple-500",
    },
    {
      id: "property-mogul",
      name: "Property Mogul",
      description: "Owned over 100 properties",
      icon: Star,
      unlocked: player.totalPropertiesOwned >= 100,
      color: "text-green-500",
    },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto sm:p-6 p-4 space-y-6 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="w-12 h-12">
              <AvatarImage src={avatar} alt={username} />
              <AvatarFallback>{username.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold truncate">{username}</h2>
                {player.rank && (
                  <Badge variant="neutral" className="shrink-0">Rank #{player.rank}</Badge>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <span className="truncate">{formatAddress(player.walletAddress)}</span>
                <Button
                  variant="neutral"
                  size="sm"
                  onClick={copyAddress}
                  className="h-6 w-6 p-0"
                >
                  <Copy className="w-3 h-3" />
                </Button>
                {copiedAddress && <span className="text-green-500">Copied!</span>}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Custom Tab Navigation */}
        <div className="flex items-center gap-1 bg-muted/40 p-1.5 rounded-xl border border-border/50">
          <button
            onClick={() => setActiveTab("stats")}
            className={`flex-1 px-4 py-3 text-sm font-semibold rounded-lg transition-all duration-300 cursor-pointer relative overflow-hidden group min-w-0 ${
              activeTab === "stats" 
                ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25 border-2 border-blue-400/50 transform scale-[1.02]" 
                : "text-muted-foreground hover:text-foreground hover:bg-muted/70 border-2 border-transparent hover:border-muted-foreground/20 hover:shadow-md"
            }`}
          >
            <span className="relative z-10 flex items-center justify-center gap-2 whitespace-nowrap">
              <TrendingUp className={`w-4 h-4 transition-transform duration-300 flex-shrink-0 ${
                activeTab === "stats" ? "scale-110" : "group-hover:scale-105"
              }`} />
              <span className="truncate">Statistics</span>
            </span>
            {activeTab === "stats" && (
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-blue-600/20 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("achievements")}
            className={`flex-1 px-4 py-3 text-sm font-semibold rounded-lg transition-all duration-300 cursor-pointer relative overflow-hidden group min-w-0 ${
              activeTab === "achievements" 
                ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25 border-2 border-amber-400/50 transform scale-[1.02]" 
                : "text-muted-foreground hover:text-foreground hover:bg-muted/70 border-2 border-transparent hover:border-muted-foreground/20 hover:shadow-md"
            }`}
          >
            <span className="relative z-10 flex items-center justify-center gap-2 whitespace-nowrap">
              <Trophy className={`w-4 h-4 transition-transform duration-300 flex-shrink-0 ${
                activeTab === "achievements" ? "scale-110" : "group-hover:scale-105"
              }`} />
              <span className="truncate">Achievements</span>
            </span>
            {activeTab === "achievements" && (
              <div className="absolute inset-0 bg-gradient-to-r from-amber-400/20 to-orange-500/20 animate-pulse" />
            )}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "stats" && (
          <div className="space-y-6">
            {/* Key Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Card className="min-h-[150px]">
                 <CardHeader className="pb-2">
                   <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                     <Trophy className="w-4 h-4 text-yellow-500" />
                     Win Rate
                   </CardTitle>
                 </CardHeader>
                <CardContent className="flex flex-col justify-between">
                   <div className="text-2xl font-bold">{winRate}%</div>
                  <div className="w-full bg-muted rounded-full h-2 mt-2 overflow-hidden">
                     <div 
                       className="bg-yellow-500 h-2 rounded-full transition-all duration-300" 
                       style={{ width: `${winRate}%` }}
                     />
                   </div>
                 </CardContent>
               </Card>

              <Card className="min-h-[150px]">
                 <CardHeader className="pb-2">
                   <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                     <Coins className="w-4 h-4 text-green-500" />
                     Total Earnings
                   </CardTitle>
                 </CardHeader>
                <CardContent className="flex flex-col justify-between">
                   <div className="text-2xl font-bold">{player.totalEarnings.toFixed(2)} SOL</div>
                   <div className="text-xs text-muted-foreground">
                     Unclaimed: {player.unclaimedEarnings.toFixed(2)} SOL
                   </div>
                 </CardContent>
               </Card>

              <Card className="min-h-[150px]">
                 <CardHeader className="pb-2">
                   <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                     <Target className="w-4 h-4 text-blue-500" />
                     Games Played
                   </CardTitle>
                 </CardHeader>
                <CardContent className="flex flex-col justify-between">
                   <div className="text-2xl font-bold">{player.totalGamesPlayed}</div>
                   <div className="text-xs text-muted-foreground">
                     {player.totalGamesWon}W / {player.totalGamesLost}L
                   </div>
                 </CardContent>
               </Card>

              <Card className="min-h-[150px]">
                 <CardHeader className="pb-2">
                   <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                     <Clock className="w-4 h-4 text-purple-500" />
                     Avg Game Time
                   </CardTitle>
                 </CardHeader>
                <CardContent className="flex flex-col justify-end">
                   <div className="text-2xl font-bold">
                     {Math.round(player.averageGameDuration || 0)}m
                   </div>
                 </CardContent>
               </Card>
             </div>

            {/* Detailed Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Performance Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                     <span>Average Cash Balance</span>
                     <span className="font-semibold">{player.averageCashBalance.toFixed(2)}</span>
                   </div>
                  <div className="flex items-center justify-between text-sm">
                     <span>Highest Cash Balance</span>
                     <span className="font-semibold">{player.highestCashBalance.toFixed(2)}</span>
                   </div>
                  <div className="flex items-center justify-between text-sm">
                     <span>Properties Owned</span>
                     <span className="font-semibold">{player.totalPropertiesOwned}</span>
                   </div>
                   {player.leaderboardScore && (
                    <div className="flex items-center justify-between text-sm">
                       <span>Leaderboard Score</span>
                       <span className="font-semibold">{player.leaderboardScore.toFixed(0)}</span>
                     </div>
                   )}
                 </CardContent>
               </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Activity Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                     <span>Last Active</span>
                     <span className="font-semibold">{lastActive.toLocaleDateString()}</span>
                   </div>
                  <div className="flex items-center justify-between text-sm">
                     <span>Player Since</span>
                     <span className="font-semibold">
                       {new Date(Date.now() - player.totalGamesPlayed * 24 * 60 * 60 * 1000).toLocaleDateString()}
                     </span>
                   </div>
                 </CardContent>
               </Card>
             </div>
          </div>
        )}

        {activeTab === "achievements" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {achievements.map((achievement) => (
              <Card key={achievement.id} className={`h-full ${achievement.unlocked ? 'border-green-500/50' : 'opacity-60'}`}>
                  <CardContent className="p-4">
                     <div className="flex items-center gap-3">
                       <div className={`${achievement.unlocked ? 'bg-green-100 dark:bg-green-900' : 'bg-gray-100 dark:bg-gray-800'} p-2 rounded-full`}>
                         <achievement.icon className={`${achievement.unlocked ? achievement.color : 'text-gray-400'} w-5 h-5`} />
                       </div>
                       <div className="flex-1">
                         <h3 className="font-semibold flex items-center gap-2">
                           {achievement.name}
                           {achievement.unlocked && <Award className="w-4 h-4 text-yellow-500" />}
                         </h3>
                         <p className="text-sm text-muted-foreground">{achievement.description}</p>
                       </div>
                     </div>
                   </CardContent>
                 </Card>
               ))}
            </div>
          </div>
        )}

        <div className="flex justify-between items-center pt-4 border-t gap-3">
          <Button variant="neutral" onClick={onClose}>
            Close
          </Button>
          <Button variant="neutral" className="flex items-center gap-2">
            <ExternalLink className="w-4 h-4" />
            View on Explorer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}