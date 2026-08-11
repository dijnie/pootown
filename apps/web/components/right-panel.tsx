// "use client";

// import React, { useState } from "react";
// import { SoundControl } from "@/components/sound-control";
// import { playSound } from "@/lib/soundUtil";
// import { useGameContext } from "./game-provider";
// import { formatAddress, formatPrice, generatePlayerIcon } from "@/lib/utils";

// interface RightPanelProps {
//   boardRotation: number;
//   onRotateClockwise: () => void;
//   onRotateCounterClockwise: () => void;
// }

// export const RightPanel: React.FC<RightPanelProps> = ({
//   boardRotation,
//   onRotateClockwise,
//   onRotateCounterClockwise,
// }) => {
//   const { players, currentPlayerAddress, setDemoDices } = useGameContext();

//   const [demoDice1, setDemoDice1] = useState(0);
//   const [demoDice2, setDemoDice2] = useState(0);

//   if (!players || players.length === 0) {
//     return (
//       <div
//         className="w-[20rem] bg-background p-4 flex flex-col h-screen overflow-y-auto"
//         style={{ height: "100vh" }}
//       >
//         <div className="p-4 bg-white rounded-lg shadow">
//           <h3 className="text-lg font-bold mb-4">Players List</h3>
//           <div className="text-center text-gray-500">No players joined yet</div>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="w-full lg:w-[34rem] bg-background p-2 sm:p-4 flex flex-col h-full overflow-y-auto">
//       {/* Current Player Info - Hide on small mobile */}
//       {/* <div className="hidden sm:block mb-4 lg:mb-6 p-3 lg:p-4 bg-white rounded-lg shadow">
//         <h2 className="text-lg lg:text-xl font-bold mb-2">Current Turn</h2>
//         <div className="flex items-center gap-3">
//           <div className="w-6 h-6 lg:w-8 lg:h-8 flex items-center justify-center">
//             <img
//               src={currentPlayer.avatar}
//               alt={`${currentPlayer.name} avatar`}
//               className="w-full h-full object-contain drop-shadow-md"
//             />
//           </div>
//           <div>
//             <div className="font-bold text-gray-800 text-sm lg:text-base">{currentPlayer.name}</div>
//             <div className="text-xs lg:text-sm text-gray-700 font-semibold">
//               Money: ${currentPlayer.money}
//             </div>
//             <div className="text-xs lg:text-sm text-gray-700 font-semibold">
//               Position: {currentPlayer.position}
//             </div>
//             <div className="text-xs text-blue-700 font-medium">
//               {boardSpaces[currentPlayer.position]?.name}
//             </div>
//           </div>
//         </div>
//       </div> */}

//       {/* Players List */}
//       <div>
//         <div className="space-y-2 lg:space-y-3">
//           {players.map((player) => (
//             <div
//               key={player.address}
//               className="transition-colors border-l-8"
//               style={
//                 player.wallet === currentPlayerAddress
//                   ? { borderColor: generatePlayerIcon(player.wallet).color }
//                   : {}
//               }
//             >
//               <div className="flex items-center gap-2">
//                 <div className="size-10 rounded-full flex items-center justify-center">
//                   {generatePlayerIcon(player.wallet)?.avatar && (
//                     <img
//                       src={generatePlayerIcon(player.wallet)?.avatar}
//                       alt={`${player.wallet} avatar`}
//                       className="w-full h-full object-contain drop-shadow-md"
//                     />
//                   )}
//                 </div>
//                 <div className="flex-1">
//                   <div className="font-bold text-gray-800 text-xs lg:text-sm">
//                     {formatAddress(player.wallet)}
//                   </div>
//                 </div>
//                 <div>
//                   <div className="text-xs text-gray-600 font-semibold">
//                     {formatPrice(Number(player.cashBalance))}
//                   </div>
//                   <div className="hidden sm:block text-xs text-gray-500">
//                     Position: {player.position}
//                   </div>
//                 </div>
//               </div>
//             </div>
//           ))}
//         </div>
//       </div>

//       {/* Controls - Hide on mobile, show on desktop */}
//       <div className="hidden lg:block mt-4 p-3 lg:p-4 bg-white rounded-lg shadow">
//         <h3 className="text-lg font-bold mb-4">Controls</h3>

//         {/* Current Dialog Toggle - only show when there's an active dialog */}
//         {/* {(gameState.gamePhase === "property-action" ||
//           gameState.gamePhase === "special-action") && (
//           <div className="mb-4">
//             <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
//               <input
//                 type="checkbox"
//                 checked={currentDialogVisible}
//                 onChange={(e) => setCurrentDialogVisible(e.target.checked)}
//                 className="rounded"
//               />
//               Show Current Dialog
//             </label>
//           </div>
//         )} */}

//         <div className="w-full mb-4">
//           <div className="flex w-full gap-2 items-center justify-center">
//             <div className="flex flex-col items-center gap-1">
//               <label className="text-xs text-gray-600">Dice 1</label>
//               <input
//                 type="number"
//                 min="1"
//                 max="6"
//                 value={demoDice1}
//                 onChange={(e) =>
//                   setDemoDice1(
//                     // Math.max(1, Math.min(6, parseInt(e.target.value) || 1))
//                     parseInt(e.target.value) || 1
//                   )
//                 }
//                 className="w-24 h-8 text-center border border-gray-300 rounded text-sm"
//               />
//             </div>
//             <div className="flex flex-col items-center gap-1">
//               <label className="text-xs text-gray-600">Dice 2</label>
//               <input
//                 type="number"
//                 min="1"
//                 max="6"
//                 value={demoDice2}
//                 onChange={(e) =>
//                   setDemoDice2(
//                     // Math.max(1, Math.min(6, parseInt(e.target.value) || 1))
//                     parseInt(e.target.value) || 1
//                   )
//                 }
//                 className="w-24 h-8 text-center border border-gray-300 rounded text-sm"
//               />
//             </div>
//             <div>
//               <button
//                 onClick={() => {
//                   setDemoDices([demoDice1, demoDice2]);
//                 }}
//                 className="px-6 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
//               >
//                 Set
//               </button>
//               <button
//                 onClick={() => {
//                   setDemoDice1(0);
//                   setDemoDice2(0);
//                   setDemoDices(null);
//                 }}
//                 className="px-6 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
//               >
//                 Clear
//               </button>
//             </div>
//           </div>
//         </div>

//         {/* Sound Controls */}
//         <div className="mb-4">
//           <h3 className="text-sm font-semibold mb-2 text-gray-700">
//             Sound Settings
//           </h3>
//           <SoundControl />
//         </div>

//         {/* Rotation Controls */}
//         <div className="flex gap-2">
//           <button
//             onClick={() => {
//               playSound("button-click", 0.5);
//               onRotateCounterClockwise();
//             }}
//             onMouseEnter={() => playSound("button-hover", 0.2)}
//             className="flex-1 px-3 py-3 min-h-[44px] bg-gray-700 text-white hover:bg-gray-800 transition-colors text-sm font-semibold rounded-lg"
//           >
//             ↺ Left
//           </button>
//           <button
//             onClick={() => {
//               playSound("button-click", 0.5);
//               onRotateClockwise();
//             }}
//             onMouseEnter={() => playSound("button-hover", 0.2)}
//             className="flex-1 px-3 py-3 min-h-[44px] bg-gray-700 text-white hover:bg-gray-800 transition-colors text-sm font-semibold rounded-lg"
//           >
//             ↻ Right
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };
