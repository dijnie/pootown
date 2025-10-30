// "use client";

// import React from "react";
// import { GameLogs } from "./game-logs";
// import { Button } from "@/components/ui/button";
// import { useGameLogs } from "@/hooks/useGameLogs";

// export const GameLogsTest: React.FC = () => {
//   const { addGameLog, clearLogs, gameLogs } = useGameLogs();

//   const addTestLog = () => {
//     addGameLog({
//       type: "join",
//       playerId: "test-player-1",
//       message: "Test player joined the game",
//       details: {
//         playerIndex: 1,
//         totalPlayers: 2,
//       },
//     });
//   };

//   const addPurchaseLog = () => {
//     addGameLog({
//       type: "purchase",
//       playerId: "test-player-2",
//       message: "Test player bought Boardwalk for $400",
//       details: {
//         propertyName: "Boardwalk",
//         position: 39,
//         price: 400,
//       },
//     });
//   };

//   return (
//     <div className="p-4 space-y-4">
//       <h3 className="text-lg font-semibold">Game Logs Test</h3>

//       <div className="flex gap-2">
//         <Button onClick={addTestLog} size="sm">
//           Add Join Log
//         </Button>
//         <Button onClick={addPurchaseLog} size="sm">
//           Add Purchase Log
//         </Button>
//         <Button onClick={clearLogs} variant="outline" size="sm">
//           Clear Logs
//         </Button>
//       </div>

//       <div className="text-sm text-muted-foreground">
//         Total logs: {gameLogs.length}
//       </div>

//       <GameLogs
//         maxHeight="h-64"
//         showTimestamps={true}
//         showIcons={true}
//         autoScroll={true}
//       />
//     </div>
//   );
// };
