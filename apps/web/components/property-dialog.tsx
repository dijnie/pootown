// "use client";

// import React from "react";
// import { getPropertyData } from "@/data/unified-monopoly-data";
// import { playPropertySound, playSound, SOUND_CONFIG } from "@/lib/soundUtil";

// interface PropertyDialogProps {
//   isOpen: boolean;
//   propertyName: string;
//   propertyPrice: number;
//   playerMoney: number;
//   position: number;
//   onBuy: () => void;
//   onSkip: () => void;
//   onBuyWithBuilding: (buildingLevel: 'flag' | 'house1') => void;
//   onClose?: () => void;
// }

// export const PropertyDialog: React.FC<PropertyDialogProps> = ({
//   isOpen,
//   propertyName,
//   propertyPrice,
//   playerMoney,
//   position,
//   onBuy,
//   onSkip,
//   onBuyWithBuilding,
//   onClose,
// }) => {
//   if (!isOpen) return null;

//   const property = getPropertyData(position);
//   if (!property) return null;

//   const flagCost = property.flagCost || propertyPrice; // Fallback to full price if no flagCost
//   const houseCost = property.houseCost || 0;
//   const house1Cost = flagCost + houseCost; // Flag cost + house cost
//   const canAffordFlag = playerMoney >= flagCost;
//   const canAffordHouse1 = playerMoney >= house1Cost;

//   return (
//     <div
//       className={`fixed inset-0 flex items-center justify-center z-50 transition-all duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
//         }`}
//     >
//       {/* Lighter background overlay */}
//       <div className="absolute inset-0 bg-black opacity-20" />

//       {/* Dialog with slide-up animation */}
//       <div
//         className={`relative bg-white border-2 border-gray-300 p-6 max-w-sm w-full mx-4 transition-all duration-300 ${isOpen ? "translate-y-0 scale-100" : "translate-y-8 scale-95"
//           }`}
//       >
//         <div className="text-center mb-4">
//           <h3 className="text-lg font-medium text-gray-800 mb-1">
//             {propertyName}
//           </h3>
//           <p className="text-xl font-bold text-gray-900">${propertyPrice}</p>
//         </div>

//         <div className="mb-4 text-sm">
//           <div className="flex justify-between mb-1">
//             <span className="text-gray-600">Your Money:</span>
//             <span className="font-medium">${playerMoney}</span>
//           </div>
//           <div className="flex justify-between mb-1">
//             <span className="text-gray-600">Flag Cost:</span>
//             <span className="font-medium">${flagCost}</span>
//           </div>
//           <div className="flex justify-between mb-2">
//             <span className="text-gray-600">House Cost:</span>
//             <span className="font-medium">+${houseCost}</span>
//           </div>
//         </div>

//         {/* Purchase Options - Similar to Building Dialog */}
//         <div className="space-y-2 mb-4">
//           <div className="text-sm text-gray-600 mb-2 text-center">
//             Purchase Options:
//           </div>

//           {/* Flag Option */}
//           <button
//             onClick={() => {
//               playPropertySound('buy');
//               onBuyWithBuilding('flag');
//             }}
//             onMouseEnter={() => canAffordFlag && playSound("button-hover", 0.2)}
//             disabled={!canAffordFlag}
//             className={`w-full px-3 py-2 transition-colors text-sm flex justify-between items-center ${canAffordFlag
//                 ? "bg-yellow-500 text-white hover:bg-yellow-600"
//                 : "bg-gray-300 text-gray-500 cursor-not-allowed"
//               }`}
//           >
//             <span>
//               🚩 Cấm cờ - Rent: ${property.baseRent}
//               {!canAffordFlag && " (Not enough money)"}
//             </span>
//             <span>${flagCost}</span>
//           </button>

//           {/* House 1 Option */}
//           <button
//             onClick={() => {
//               playPropertySound('buy');
//               onBuyWithBuilding('house1');
//             }}
//             onMouseEnter={() => canAffordHouse1 && playSound("button-hover", 0.2)}
//             disabled={!canAffordHouse1}
//             className={`w-full px-3 py-2 transition-colors text-sm flex justify-between items-center ${canAffordHouse1
//               ? "bg-blue-600 text-white hover:bg-blue-700"
//               : "bg-gray-300 text-gray-500 cursor-not-allowed"
//               }`}
//           >
//             <span>
//               🏠 1 House - Rent: ${property.rentWith1House}
//               {!canAffordHouse1 && " (Not enough money)"}
//             </span>
//             <span>${house1Cost}</span>
//           </button>

//           {/* Disabled options to show progression */}
//           {[2, 3, 4].map((houses) => {
//             const rentKey = `rentWith${houses}Houses` as keyof typeof property;
//             const rent = property[rentKey] as number;
//             return (
//               <button
//                 key={houses}
//                 disabled={true}
//                 className="w-full px-3 py-2 bg-gray-300 text-gray-500 cursor-not-allowed transition-colors text-sm flex justify-between items-center"
//               >
//                 <span>🏠 {houses} Houses - Rent: ${rent} (Available after purchase)</span>
//                 <span>-</span>
//               </button>
//             );
//           })}

//           {/* Hotel option */}
//           <button
//             disabled={true}
//             className="w-full px-3 py-2 bg-gray-300 text-gray-500 cursor-not-allowed transition-colors text-sm flex justify-between items-center"
//           >
//             <span>🏨 Hotel - Rent: ${property.rentWithHotel} (Available after 4 houses)</span>
//             <span>-</span>
//           </button>
//         </div>

//         {/* Info about purchase phases */}
//         <div className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 text-xs mb-4">
//           <p className="mb-1">Purchase Phases:</p>
//           <ul className="list-disc list-inside space-y-1">
//             <li><strong>Phase 1:</strong> Choose Flag (${flagCost}) or 1 House (${house1Cost})</li>
//             <li><strong>Flag:</strong> Lower cost, basic rent</li>
//             <li><strong>1 House:</strong> Higher cost, better rent</li>
//             <li><strong>Phase 2+:</strong> Click to upgrade to 2, 3, 4 houses, then hotel</li>
//           </ul>
//         </div>
//       </div>
//     </div>
//   );
// };

// interface SpecialCardDialogProps {
//   isOpen: boolean;
//   cardType: "chance" | "community-chest";
//   message: string;
//   onContinue: () => void;
//   onClose?: () => void;
// }

// interface JailDialogProps {
//   isOpen: boolean;
//   playerName: string;
//   playerMoney: number;
//   jailTurns: number;
//   hasJailFreeCard: boolean;
//   onPayFine: () => void;
//   onUseCard: () => void;
//   onRollDice: () => void;
//   onClose?: () => void;
// }

// export const SpecialCardDialog: React.FC<SpecialCardDialogProps> = ({
//   isOpen,
//   cardType,
//   message,
//   onContinue,
//   onClose,
// }) => {
//   if (!isOpen) return null;

//   return (
//     <div
//       className={`fixed inset-0 flex items-center justify-center z-50 transition-all duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
//         }`}
//     >
//       {/* Lighter background overlay */}
//       <div className="absolute inset-0 bg-black opacity-20" />

//       {/* Dialog with slide-up animation */}
//       <div
//         className={`relative bg-white border-2 border-gray-300 p-6 max-w-sm w-full mx-4 transition-all duration-300 ${isOpen ? "translate-y-0 scale-100" : "translate-y-8 scale-95"
//           }`}
//       >
//         <div className="text-center mb-4">
//           <h3 className="text-lg font-medium text-gray-800 mb-2">
//             {cardType === "chance" ? "Chance" : "Community Chest"}
//           </h3>
//           <div className="w-12 h-12 mx-auto mb-3 border-2 border-gray-300 flex items-center justify-center text-lg">
//             {cardType === "chance" ? "?" : "💰"}
//           </div>
//           <p className="text-sm text-gray-700">{message}</p>
//         </div>

//         <button
//           onClick={() => {
//             playSound("button-click", 0.6);
//             onContinue();
//           }}
//           onMouseEnter={() => playSound("button-hover", 0.2)}
//           className="w-full px-3 py-2 bg-gray-800 text-white hover:bg-gray-900 transition-colors text-sm"
//         >
//           Continue
//         </button>
//       </div>
//     </div>
//   );
// };

// export const JailDialog: React.FC<JailDialogProps> = ({
//   isOpen,
//   playerName,
//   playerMoney,
//   jailTurns,
//   hasJailFreeCard,
//   onPayFine,
//   onUseCard,
//   onRollDice,
//   onClose,
// }) => {
//   if (!isOpen) return null;

//   const canAffordFine = playerMoney >= 50;

//   return (
//     <div
//       className={`fixed inset-0 flex items-center justify-center z-50 transition-all duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
//         }`}
//     >
//       {/* Background overlay */}
//       <div className="absolute inset-0 bg-black opacity-20" />

//       {/* Dialog */}
//       <div
//         className={`relative bg-white border-2 border-gray-300 p-6 max-w-sm w-full mx-4 transition-all duration-300 ${isOpen ? "translate-y-0 scale-100" : "translate-y-8 scale-95"
//           }`}
//       >
//         <div className="text-center mb-4">
//           <h3 className="text-lg font-medium text-gray-800 mb-2">
//             {playerName} is in Jail
//           </h3>
//           <div className="w-12 h-12 mx-auto mb-3 border-2 border-gray-300 flex items-center justify-center text-lg bg-orange-100">
//             🏢
//           </div>
//           <p className="text-sm text-gray-700 mb-2">
//             Turn {jailTurns + 1}/3 in jail
//           </p>
//           <p className="text-xs text-gray-600">
//             Choose how to get out of jail:
//           </p>
//         </div>

//         <div className="mb-4 text-sm">
//           <div className="flex justify-between mb-1">
//             <span className="text-gray-600">Your Money:</span>
//             <span className="font-medium">${playerMoney}</span>
//           </div>
//         </div>

//         <div className="space-y-2">
//           {/* Roll for doubles */}
//           <button
//             onClick={() => {
//               playSound("dice-roll", SOUND_CONFIG.volumes.diceRoll, SOUND_CONFIG.durations.diceRoll);
//               onRollDice();
//             }}
//             onMouseEnter={() => playSound("button-hover", SOUND_CONFIG.volumes.buttonHover)}
//             className="w-full px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm"
//           >
//             Roll Dice (Try for doubles)
//           </button>

//           {/* Pay fine */}
//           <button
//             onClick={() => {
//               if (canAffordFine) {
//                 playSound("money-pay", 0.7);
//                 onPayFine();
//               }
//             }}
//             onMouseEnter={() => canAffordFine && playSound("button-hover", 0.2)}
//             disabled={!canAffordFine}
//             className={`w-full px-3 py-2 transition-colors text-sm ${canAffordFine
//               ? "bg-green-600 text-white hover:bg-green-700"
//               : "bg-gray-100 text-gray-400 cursor-not-allowed"
//               }`}
//           >
//             Pay $50 Fine
//           </button>

//           {/* Use Get Out of Jail Free card */}
//           {hasJailFreeCard && (
//             <button
//               onClick={onUseCard}
//               className="w-full px-3 py-2 bg-yellow-600 text-white hover:bg-yellow-700 transition-colors text-sm"
//             >
//               Use "Get Out of Jail Free" Card
//             </button>
//           )}
//         </div>

//         {!canAffordFine && (
//           <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm mt-4">
//             Not enough money to pay fine!
//           </div>
//         )}

//         {jailTurns >= 2 && (
//           <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-3 py-2 text-sm mt-4">
//             Warning: You must pay the fine if you don't roll doubles this turn!
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };
