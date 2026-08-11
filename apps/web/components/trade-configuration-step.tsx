// // Trade configuration step component  
// "use client";

// import React, { useState, useCallback } from "react";
// import { Button } from "@/components/ui/button";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import { Avatar, AvatarFallback } from "@/components/ui/avatar";
// import { Badge } from "@/components/ui/badge";
// import { Slider } from "@/components/ui/slider";
// import { useGameContext } from "@/components/providers/game-provider";
// import { boardData, colorMap } from "@/configs/board-data";
// import type { PlayerAccount, TradeOffer, PropertyAccount } from "@/types/schema";

// interface TradeConfigurationStepProps {
//   selectedPlayer: PlayerAccount;
//   currentPlayer: PlayerAccount;
//   initiatorOffer: TradeOffer;
//   targetOffer: TradeOffer;
//   onInitiatorOfferChange: (offer: TradeOffer) => void;
//   onTargetOfferChange: (offer: TradeOffer) => void;
//   onCreateTrade: () => void;
//   canCreateTrade: boolean;
// }

// // Formatting money values as currency
// const formatCurrency = (amount: string | number): string => {
//   return `$${amount}`;
// };

// // Helper to get property color group name
// const getColorGroupName = (colorGroup: any): string => {
//   const colorNames: { [key: string]: string } = {
//     Brown: "Brown",
//     LightBlue: "Light Blue", 
//     Pink: "Pink",
//     Orange: "Orange",
//     Red: "Red",
//     Yellow: "Yellow",
//     Green: "Green",
//     DarkBlue: "Dark Blue",
//     Railroad: "Railroad",
//     Utility: "Utility",
//   };
//   return colorNames[colorGroup] || "Unknown";
// };

// // Custom scrollbar styles
// const scrollbarStyles = `
//   .custom-scrollbar::-webkit-scrollbar {
//     width: 6px;
//   }
//   .custom-scrollbar::-webkit-scrollbar-track {
//     background: transparent;
//   }
//   .custom-scrollbar::-webkit-scrollbar-thumb {
//     background-color: rgba(156, 163, 175, 0.5);
//     border-radius: 20px;
//     border: transparent;
//   }
//   .custom-scrollbar::-webkit-scrollbar-thumb:hover {
//     background-color: rgba(156, 163, 175, 0.7);
//   }
// `;

// export function TradeConfigurationStep({
//   selectedPlayer,
//   currentPlayer,
//   initiatorOffer,
//   targetOffer,
//   onInitiatorOfferChange,
//   onTargetOfferChange,
//   onCreateTrade,
//   canCreateTrade,
// }: TradeConfigurationStepProps) {
//   const { properties } = useGameContext();
  
//   // Get properties owned by each player
//   const currentPlayerProperties = properties.filter(
//     prop => prop.owner === currentPlayer.wallet
//   );
  
//   const selectedPlayerProperties = properties.filter(
//     prop => prop.owner === selectedPlayer.wallet
//   );

//   // Memoize the money change handler to prevent re-rendering during dragging
//   const handleMoneyChange = useCallback((
//     value: number[],
//     type: "initiator" | "target"
//   ) => {
//     // Round to integer since we're dealing with dollars
//     // Make sure we have at least one value in the array and it's a valid number
//     const sliderValue = value && value.length > 0 ? value[0] : 0;
//     const numValue = Math.max(0, Math.round(sliderValue)).toString();
    
//     if (type === "initiator") {
//       onInitiatorOfferChange({
//         ...initiatorOffer,
//         money: numValue,
//       });
//     } else {
//       onTargetOfferChange({
//         ...targetOffer,
//         money: numValue,
//       });
//     }
//   }, [initiatorOffer, targetOffer, onInitiatorOfferChange, onTargetOfferChange]);

//   // Memoize property toggle handler for better performance
//   const handlePropertyToggle = useCallback((
//     propertyPosition: number,
//     checked: boolean,
//     type: "initiator" | "target"
//   ) => {
//     if (type === "initiator") {
//       const newProperties = checked
//         ? [...initiatorOffer.properties, propertyPosition]
//         : initiatorOffer.properties.filter((p: number) => p !== propertyPosition);
      
//       onInitiatorOfferChange({
//         ...initiatorOffer,
//         properties: newProperties,
//       });
//     } else {
//       const newProperties = checked
//         ? [...targetOffer.properties, propertyPosition]
//         : targetOffer.properties.filter((p: number) => p !== propertyPosition);
      
//       onTargetOfferChange({
//         ...targetOffer,
//         properties: newProperties,
//       });
//     }
//   }, [initiatorOffer, targetOffer, onInitiatorOfferChange, onTargetOfferChange]);

//   const PlayerOfferCard = React.memo(({
//     player,
//     isCurrentPlayer,
//     offer,
//     playerProperties,
//     onMoneyChange,
//     onPropertyToggle,
//   }: {
//     player: PlayerAccount;
//     isCurrentPlayer: boolean;
//     offer: TradeOffer;
//     playerProperties: PropertyAccount[];
//     onMoneyChange: (value: number[]) => void;
//     onPropertyToggle: (position: number, checked: boolean) => void;
//   }) => {
//     // Use raw dollar amount (not lamports/SOL) for slider
//     const maxDollars = parseInt(player.cashBalance) || 0;
//     // Convert offer money to number for slider and ensure it's a valid number
//     const currentValue = Math.min(parseInt(offer.money) || 0, maxDollars);
    
//     // Local state for real-time slider updates without re-rendering parent
//     const [tempValue, setTempValue] = useState(currentValue);
    
//     // Đồng bộ giá trị từ props khi offer thay đổi từ bên ngoài
//     React.useEffect(() => {
//       setTempValue(currentValue);
//     }, [currentValue]);
    
//     return (
//       <div className="flex-1 flex flex-col">
//         {/* Player Info */}
//         <div className="flex items-center gap-2 mb-4 p-2 rounded-md bg-primary/5 border border-primary/20">
//           <Avatar className="h-8 w-8">
//             <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
//               {player.wallet.slice(0, 2).toUpperCase()}
//             </AvatarFallback>
//           </Avatar>
//           <div>
//             <div className="text-sm font-medium">
//               {isCurrentPlayer ? "You" : `${player.wallet.slice(0, 6)}...`}
//             </div>
//             <div className="text-xs text-muted-foreground">
//               Balance: <span className="text-emerald-600 font-medium">${player.cashBalance}</span>
//             </div>
//           </div>
//         </div>
        
//         {/* Money slider with value bubble */}
//         <div className="mb-6 relative py-4">
//           <div className="flex justify-between text-xs text-muted-foreground mb-2">
//             <span>0</span>
//             <span>${maxDollars}</span>
//           </div>
//           <div className="relative">
//             <Slider 
//               defaultValue={[0]} 
//               min={0}
//               max={maxDollars} 
//               step={1}
//               value={[tempValue]}
//               onValueChange={(val) => setTempValue(val[0])}  // chỉ update local state
//               onValueCommit={(val) => onMoneyChange(val)}    // chỉ gửi khi thả slider
//               aria-label="Money amount"
//               className="cursor-pointer"
//             />
//             {/* Current value bubble - use fixed positioning for smoother dragging */}
//             <div 
//               className="absolute top-[-22px] bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-full font-medium shadow-md z-10 border border-emerald-400/30"
//               style={{ 
//                 left: `${maxDollars > 0 ? Math.min(100, (tempValue / maxDollars) * 100) : 0}%`,
//                 transform: "translateX(-50%)",
//                 willChange: "left" // Hint to browser to optimize this property
//               }}
//             >
//               <span className="flex items-center gap-1">
//                 <span className="text-emerald-100">$</span>
//                 <span className="text-white font-bold">{tempValue}</span>
//               </span>
//             </div>
//           </div>
//         </div>
        
//         {/* Properties list - simplified */}
//         <div>
//           {playerProperties.length > 0 && (
//             <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar" 
//                  style={{
//                    scrollbarWidth: 'thin',
//                    scrollbarColor: 'rgba(156, 163, 175, 0.5) transparent'
//                  }}>
//               {playerProperties.map((property) => {
//                 // Get full property name from board data
//                 const propertyData = boardData.find(b => b.position === property.position);
//                 const propertyName = propertyData?.name || `Property ${property.position}`;
                
//                 // Handle color group for all property types
//                 let colorHex = null;
//                 let propertyType = "";
                
//                 if (propertyData && 'type' in propertyData) {
//                   propertyType = propertyData.type;
                  
//                   if (propertyData.type === 'property') {
//                     // Property with color group
//                     const propertySpace = propertyData as any;
//                     if (propertySpace.colorGroup) {
//                       // Fix: properly handle camelCase colorGroup keys
//                       const colorGroupKey = propertySpace.colorGroup as keyof typeof colorMap;
//                       colorHex = colorMap[colorGroupKey] || null;
//                     }
//                   } else if (propertyData.type === 'railroad') {
//                     // Railroad - use black color
//                     colorHex = '#000000';
//                   } else if (propertyData.type === 'utility') {
//                     // Utility - use a light yellow color
//                     colorHex = '#E8C547';
//                   }
//                 }
                
//                 const isSelected = offer.properties.includes(property.position);
                
//                 return (
//                   <div 
//                     key={property.position} 
//                     onClick={() => onPropertyToggle(
//                       property.position, 
//                       !offer.properties.includes(property.position)
//                     )}
//                     className={`flex items-center justify-between p-2.5 rounded-md cursor-pointer text-xs transition-colors duration-200 ${
//                       isSelected 
//                         ? 'bg-emerald-500/10 border border-emerald-500/30 shadow-sm' 
//                         : 'bg-secondary/20 hover:bg-secondary/30 border border-transparent'
//                     }`}
//                   >
//                     <div className="flex items-center gap-2">
//                       {/* Color indicator with improved visibility */}
//                       <div 
//                         className="w-4 h-4 rounded-sm flex-shrink-0 border border-gray-200 dark:border-gray-700 shadow-sm" 
//                         style={{ 
//                           backgroundColor: colorHex || 'transparent',
//                           display: 'flex',
//                           alignItems: 'center',
//                           justifyContent: 'center'
//                         }}
//                       >
//                         {propertyType === 'railroad' && (
//                           <span className="text-white text-[8px] font-bold">RR</span>
//                         )}
//                         {propertyType === 'utility' && (
//                           <span className="text-[8px] font-bold">⚡</span>
//                         )}
//                       </div>
//                       <div className={`w-4 h-4 rounded-sm flex items-center justify-center transition-colors ${isSelected ? 'bg-emerald-500 text-white' : 'border border-gray-400/40'}`}>
//                         {isSelected && <span className="text-[8px]">✓</span>}
//                       </div>
//                       <span className={`${isSelected ? 'font-medium text-gray-900 dark:text-gray-100' : ''} truncate max-w-[120px]`}>{propertyName}</span>
//                     </div>
//                     <span className={`${isSelected ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}`}>${property.price}</span>
//                   </div>
//                 );
//               })}
//             </div>
//           )}
//         </div>
//       </div>
//     );
//   });

//   return (
//     <div className="bg-background py-2 flex flex-col">
//       <style>{scrollbarStyles}</style>
//       {/* Title with simplified UI */}
//       <div className="flex justify-between items-center mb-5 pb-2 ">
//         <div className="font-medium text-base text-primary">Trade Offer</div>
//       </div>
      
//       {/* Trade offers in simplified layout */}
//       <div className="grid grid-cols-2 gap-6">
//         <PlayerOfferCard
//           player={currentPlayer}
//           isCurrentPlayer={true}
//           offer={initiatorOffer}
//           playerProperties={currentPlayerProperties}
//           onMoneyChange={useCallback((value) => handleMoneyChange(value, "initiator"), [handleMoneyChange])}
//           onPropertyToggle={useCallback((position, checked) => 
//             handlePropertyToggle(position, checked, "initiator"), [handlePropertyToggle])}
//         />
        
//         <PlayerOfferCard
//           player={selectedPlayer}
//           isCurrentPlayer={false}
//           offer={targetOffer}
//           playerProperties={selectedPlayerProperties}
//           onMoneyChange={useCallback((value) => handleMoneyChange(value, "target"), [handleMoneyChange])}
//           onPropertyToggle={useCallback((position, checked) => 
//             handlePropertyToggle(position, checked, "target"), [handlePropertyToggle])}
//         />
//       </div>

//       {/* Action button */}
//       <div className="flex justify-center mt-6">
//         <Button
//           onClick={onCreateTrade}
//           disabled={!canCreateTrade}
//           variant="default"
//           className={`px-8 py-2.5 text-sm font-medium transition-all ${canCreateTrade ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg' : 'opacity-70'}`}
//         >
//           Send Trade
//         </Button>
//       </div>
//     </div>
//   );
// }
