// "use client";

// import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// import { Button } from "@/components/ui/button";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import { Badge } from "@/components/ui/badge";
// import { Avatar, AvatarFallback } from "@/components/ui/avatar";
// import { ArrowLeftRight, Trash2, Check, X } from "lucide-react";
// import { formatAddress, generatePlayerIcon } from "@/lib/utils";
// import { useGameContext } from "@/components/providers/game-provider";
// import type { TradeData } from "@/types/schema";
// import { TradeStatus } from "@/lib/sdk/generated";
// import { boardData, colorMap } from "@/configs/board-data";

// interface TradeDetailsDialogProps {
//   isOpen: boolean;
//   onClose: () => void;
//   trade: TradeData | null;
// }

// const getTradeStatusText = (status: TradeStatus): string => {
//   switch (status) {
//     case 0: return "Pending";
//     case 1: return "Accepted";
//     case 2: return "Rejected";
//     case 3: return "Cancelled";
//     case 4: return "Expired";
//     default: return "Unknown";
//   }
// };

// const getTradeStatusColor = (status: TradeStatus): string => {
//   switch (status) {
//     case 0: return "bg-yellow-100 text-yellow-800"; // Pending
//     case 1: return "bg-green-100 text-green-800"; // Accepted
//     case 2: return "bg-red-100 text-red-800"; // Rejected
//     case 3: return "bg-gray-100 text-gray-800"; // Cancelled
//     case 4: return "bg-orange-100 text-orange-800"; // Expired
//     default: return "bg-gray-100 text-gray-800";
//   }
// };

// // Format currency as dollars
// const formatCurrency = (amount: string): string => {
//   return `$${amount}`;
// };

// export function TradeDetailsDialog({ isOpen, onClose, trade }: TradeDetailsDialogProps) {
//   const { 
//     currentPlayerState, 
//     properties, 
//     acceptTrade, 
//     rejectTrade, 
//     cancelTrade,
//     players 
//   } = useGameContext();

//   if (!trade) return null;

//   const initiatorInfo = generatePlayerIcon(trade.initiator);
//   const targetInfo = generatePlayerIcon(trade.target);
  
//   const initiatorPlayer = players.find(p => p.wallet === trade.initiator);
//   const targetPlayer = players.find(p => p.wallet === trade.target);

//   const isCurrentPlayerInitiator = currentPlayerState?.wallet === trade.initiator;
//   const isCurrentPlayerTarget = currentPlayerState?.wallet === trade.target;
//   const canInteract = isCurrentPlayerInitiator || isCurrentPlayerTarget;

//   const canAccept = isCurrentPlayerTarget && trade.status === 0;
//   const canReject = isCurrentPlayerTarget && trade.status === 0;
//   const canCancel = isCurrentPlayerInitiator && trade.status === 0;

//   const handleAccept = async () => {
//     try {
//       await acceptTrade(trade.id, trade.initiator);
//       onClose();
//     } catch (error) {
//       console.error("Error accepting trade:", error);
//     }
//   };

//   const handleReject = async () => {
//     try {
//       await rejectTrade(trade.id);
//       onClose();
//     } catch (error) {
//       console.error("Error rejecting trade:", error);
//     }
//   };

//   const handleCancel = async () => {
//     try {
//       await cancelTrade(trade.id);
//       onClose();
//     } catch (error) {
//       console.error("Error cancelling trade:", error);
//     }
//   };

//   return (
//     <Dialog open={isOpen} onOpenChange={onClose}>
//       <DialogContent className="max-w-md overflow-y-auto p-6 bg-background border-none rounded-lg shadow-xl">
//         <DialogHeader className="pb-3 border-b border-back dark:border-gray-800">
//           <div className="flex items-center gap-2 justify-between">
//             <DialogTitle className="text-base font-semibold flex-grow text-gray-900 dark:text-gray-100">
//               Trade Details
//             </DialogTitle>
//             <Button
//               variant="default"
//               size="icon"
//               onClick={onClose}
//               className="h-8 w-8 rounded-full bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-300"
//             >
//               <span className="text-lg">×</span>
//             </Button>
//           </div>
//         </DialogHeader>
              
//         <div className="bg-background py-2 flex flex-col">
//           {/* Status indicator */}
//           <div className="flex justify-end mb-2">
//             <Badge className={`text-xs px-3 py-1 ${getTradeStatusColor(trade.status)} rounded-full font-medium`}>
//               {getTradeStatusText(trade.status)}
//             </Badge>
//           </div>
          
//           {/* Space between status and content */}
//           <div className="mb-5"></div>
          
//           {/* Trade offers in simplified layout */}
//           <div className="grid grid-cols-2 gap-6">
//             {/* Initiator Offers */}
//             <div className="flex-1 flex flex-col">
//               {/* Player Info */}
//               <div className="flex items-center gap-2 mb-4 p-2 rounded-md bg-primary/5 border border-primary/20">
//                 <Avatar className="h-8 w-8">
//                   <AvatarFallback 
//                     style={{ backgroundColor: initiatorInfo.color }} 
//                     className="text-primary-foreground text-xs font-bold"
//                   >
//                     {trade.initiator.slice(0, 2).toUpperCase()}
//                   </AvatarFallback>
//                 </Avatar>
//                 <div>
//                   <div className="text-sm font-medium">
//                     {isCurrentPlayerInitiator ? "You" : `${trade.initiator.slice(0, 6)}...`}
//                     {isCurrentPlayerInitiator && <span className="ml-1 text-xs text-emerald-600 font-bold">(Initiator)</span>}
//                   </div>
//                   <div className="text-xs text-muted-foreground">
//                     Balance: <span className="text-emerald-600 font-medium">${initiatorPlayer?.cashBalance || 0}</span>
//                   </div>
//                 </div>
//               </div>
              
//               {/* Money slider with value bubble - fixed display */}
//               <div className="mb-6 relative py-4">
//                 <div className="flex justify-between text-xs text-muted-foreground mb-2">
//                   <span>0</span>
//                   <span>${initiatorPlayer?.cashBalance || 0}</span>
//                 </div>
//                 <div className="relative">
//                   {/* Display fixed slider based on offered amount */}
//                   <div className="h-2 rounded-full bg-secondary relative">
//                     {parseInt(trade.initiatorOffer.money) > 0 && (
//                       <div 
//                         className="absolute top-0 left-0 h-full bg-emerald-500 rounded-full" 
//                         style={{ 
//                           width: `${Math.min(100, (parseInt(trade.initiatorOffer.money) / (parseInt(initiatorPlayer?.cashBalance || '0') || 1)) * 100)}%` 
//                         }}
//                       ></div>
//                     )}
//                   </div>
                  
//                   {/* Current value bubble */}
//                   {parseInt(trade.initiatorOffer.money) > 0 && (
//                     <div 
//                       className="absolute top-[-22px] bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-full font-medium shadow-md z-10 border border-emerald-400/30"
//                       style={{ 
//                         left: `${Math.min(100, (parseInt(trade.initiatorOffer.money) / (parseInt(initiatorPlayer?.cashBalance || '0') || 1)) * 100)}%`,
//                         transform: "translateX(-50%)"
//                       }}
//                     >
//                       <span className="flex items-center gap-1">
//                         <span className="text-emerald-100">$</span>
//                         <span className="text-white font-bold">{trade.initiatorOffer.money}</span>
//                       </span>
//                     </div>
//                   )}
//                 </div>
//               </div>
              
//               {/* Properties list - Initiator */}
//               <div id="initiator-properties">
//                 <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Properties Offered</div>
//                 <div className="space-y-1 max-h-40 overflow-y-auto">
//                   {trade.initiatorOffer.properties.length > 0 ? (
//                     trade.initiatorOffer.properties.map(position => {
//                       const property = properties.find(p => p.position === position);
//                       const propertyData = boardData.find(b => b.position === position);
//                       const propertyName = propertyData?.name || `Property ${position}`;
                      
//                       // Get color for the property if available
//                       let colorHex = null;
//                       if (propertyData && 'type' in propertyData && propertyData.type === 'property') {
//                         const propertySpace = propertyData as any;
//                         if (propertySpace.colorGroup) {
//                           const colorGroupKey = propertySpace.colorGroup.toLowerCase() as keyof typeof colorMap;
//                           colorHex = colorMap[colorGroupKey] || null;
//                         }
//                       }
                      
//                       return property ? (
//                         <div key={position} className="flex items-center justify-between p-2 text-xs border-b border-gray-100 dark:border-gray-800">
//                           <div className="flex items-center gap-2">
//                             {/* Color indicator */}
//                             {colorHex && (
//                               <div 
//                                 className="w-3 h-3 rounded-sm flex-shrink-0" 
//                                 style={{ backgroundColor: colorHex }}
//                               />
//                             )}
//                             <span className="font-medium truncate max-w-[120px]">{propertyName}</span>
//                           </div>
//                           <span className="font-medium">${property.price}</span>
//                         </div>
//                       ) : null;
//                     })
//                   ) : (
//                     <div className="text-center text-muted-foreground text-sm">
//                       No properties offered
//                     </div>
//                   )}
//                 </div>
//               </div>
//             </div>
            
//             {/* Target Offers */}
//             <div className="flex-1 flex flex-col">
//               {/* Player Info */}
//               <div className="flex items-center gap-2 mb-4 p-2 rounded-md bg-primary/5 border border-primary/20">
//                 <Avatar className="h-8 w-8">
//                   <AvatarFallback 
//                     style={{ backgroundColor: targetInfo.color }} 
//                     className="text-primary-foreground text-xs font-bold"
//                   >
//                     {trade.target.slice(0, 2).toUpperCase()}
//                   </AvatarFallback>
//                 </Avatar>
//                 <div>
//                   <div className="text-sm font-medium">
//                     {isCurrentPlayerTarget ? "You" : `${trade.target.slice(0, 6)}...`}
//                     {isCurrentPlayerTarget && <span className="ml-1 text-xs text-emerald-600 font-bold">(Target)</span>}
//                   </div>
//                   <div className="text-xs text-muted-foreground">
//                     Balance: <span className="text-emerald-600 font-medium">${targetPlayer?.cashBalance || 0}</span>
//                   </div>
//                 </div>
//               </div>
              
//               {/* Money slider with value bubble - fixed display */}
//               <div className="mb-6 relative py-4">
//                 <div className="flex justify-between text-xs text-muted-foreground mb-2">
//                   <span>0</span>
//                   <span>${targetPlayer?.cashBalance || 0}</span>
//                 </div>
//                 <div className="relative">
//                   {/* Display fixed slider based on offered amount */}
//                   <div className="h-2 rounded-full bg-secondary relative">
//                     {parseInt(trade.targetOffer.money) > 0 && (
//                       <div 
//                         className="absolute top-0 left-0 h-full bg-emerald-500 rounded-full" 
//                         style={{ 
//                           width: `${Math.min(100, (parseInt(trade.targetOffer.money) / (parseInt(targetPlayer?.cashBalance || '0') || 1)) * 100)}%` 
//                         }}
//                       ></div>
//                     )}
//                   </div>
                  
//                   {/* Current value bubble */}
//                   {parseInt(trade.targetOffer.money) > 0 && (
//                     <div 
//                       className="absolute top-[-22px] bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-full font-medium shadow-md z-10 border border-emerald-400/30"
//                       style={{ 
//                         left: `${Math.min(100, (parseInt(trade.targetOffer.money) / (parseInt(targetPlayer?.cashBalance || '0') || 1)) * 100)}%`,
//                         transform: "translateX(-50%)"
//                       }}
//                     >
//                       <span className="flex items-center gap-1">
//                         <span className="text-emerald-100">$</span>
//                         <span className="text-white font-bold">{trade.targetOffer.money}</span>
//                       </span>
//                     </div>
//                   )}
//                 </div>
//               </div>
              
//               {/* Properties list - Target */}
//               <div id="target-properties">
//                 <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Properties Offered</div>
//                 <div className="space-y-1 max-h-40 overflow-y-auto">
//                   {trade.targetOffer.properties.length > 0 ? (
//                     trade.targetOffer.properties.map(position => {
//                       const property = properties.find(p => p.position === position);
//                       const propertyData = boardData.find(b => b.position === position);
//                       const propertyName = propertyData?.name || `Property ${position}`;
                      
//                       // Get color for the property if available
//                       let colorHex = null;
//                       if (propertyData && 'type' in propertyData && propertyData.type === 'property') {
//                         const propertySpace = propertyData as any;
//                         if (propertySpace.colorGroup) {
//                           const colorGroupKey = propertySpace.colorGroup.toLowerCase() as keyof typeof colorMap;
//                           colorHex = colorMap[colorGroupKey] || null;
//                         }
//                       }
                      
//                       return property ? (
//                         <div key={position} className="flex items-center justify-between p-2 text-xs border-b border-gray-100 dark:border-gray-800">
//                           <div className="flex items-center gap-2">
//                             {/* Color indicator */}
//                             {colorHex && (
//                               <div 
//                                 className="w-3 h-3 rounded-sm flex-shrink-0" 
//                                 style={{ backgroundColor: colorHex }}
//                               />
//                             )}
//                             <span className="font-medium truncate max-w-[120px]">{propertyName}</span>
//                           </div>
//                           <span className="font-medium">${property.price}</span>
//                         </div>
//                       ) : null;
//                     })
//                   ) : (
//                     <div className="text-center text-muted-foreground text-sm">
//                       No properties offered
//                     </div>
//                   )}
//                 </div>
//               </div>
//             </div>

//           </div>
          
//           {/* Trade metadata in small text */}
//           <div className="grid grid-cols-3 gap-2 my-4 text-xs">
//             <div>
//               <div className="text-muted-foreground mb-1">Created</div>
//               <div className="font-medium">{new Date(trade.createdAt).toLocaleString()}</div>
//             </div>
            
//             {trade.expiresAt && (
//               <div>
//                 <div className="text-muted-foreground mb-1">Expires</div>
//                 <div className="font-medium">{new Date(trade.expiresAt).toLocaleString()}</div>
//               </div>
//             )}
//           </div>
          
//           {/* Action buttons */}
//           {canInteract && trade.status === 0 && (
//             <div className="flex justify-center mt-6 gap-3">
//               {canAccept && (
//                 <Button 
//                   onClick={handleAccept} 
//                   variant="default"
//                   className="px-8 py-2.5 text-sm font-medium transition-all bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg"
//                 >
//                   <Check className="w-4 h-4 mr-2" />
//                   Accept Trade
//                 </Button>
//               )}
              
//               {canReject && (
//                 <Button 
//                   onClick={handleReject} 
//                   variant="default" 
//                   className="px-8 py-2.5 text-sm font-medium transition-all bg-red-500 hover:bg-red-600 text-white shadow-md hover:shadow-lg"
//                 >
//                   <X className="w-4 h-4 mr-2" />
//                   Reject Trade
//                 </Button>
//               )}
              
//               {canCancel && (
//                 <Button 
//                   onClick={handleCancel} 
//                   variant="default"
//                   className="px-8 py-2.5 text-sm font-medium transition-all bg-red-500 hover:bg-red-600 text-white shadow-md hover:shadow-lg"
//                 >
//                   <Trash2 className="w-4 h-4 mr-2" />
//                   Cancel Trade
//                 </Button>
//               )}
//             </div>
//           )}
//         </div>
//       </DialogContent>
//     </Dialog>
//   );
// }
