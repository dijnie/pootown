// "use client";

// import { useState } from "react";
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog";
// import { Button } from "@/components/ui/button";
// import { ArrowLeft } from "lucide-react";
// // import { PlayerSelectionStep } from "./player-selection-step";
// // import { TradeConfigurationStep } from "./trade-configuration-step";
// import { useGameContext } from "@/components/providers/game-provider";
// import type { PlayerAccount, TradeOffer } from "@/types/schema";
// // import { TradeConfigurationStep } from "./trade-configuration-step";
// import { PlayerSelectionStep } from "./player-selection-step";

// interface TradeDialogProps {
//   isOpen: boolean;
//   onClose: () => void;
// }

// type TradeStep = "player-selection" | "trade-configuration";

// export function TradeDialog({ isOpen, onClose }: TradeDialogProps) {
//   const [currentStep, setCurrentStep] = useState<TradeStep>("player-selection");
//   const [selectedPlayer, setSelectedPlayer] = useState<PlayerAccount | null>(
//     null
//   );
//   const [initiatorOffer, setInitiatorOffer] = useState<TradeOffer>({
//     money: "0",
//     properties: [],
//   });
//   const [targetOffer, setTargetOffer] = useState<TradeOffer>({
//     money: "0",
//     properties: [],
//   });

//   const { players, currentPlayerState, createTrade } = useGameContext();

//   const handlePlayerSelect = (player: PlayerAccount) => {
//     setSelectedPlayer(player);
//     setCurrentStep("trade-configuration");
//   };

//   const handleBack = () => {
//     if (currentStep === "trade-configuration") {
//       setCurrentStep("player-selection");
//       setSelectedPlayer(null);
//       // Reset offers when going back
//       setInitiatorOffer({ money: "0", properties: [] });
//       setTargetOffer({ money: "0", properties: [] });
//     }
//   };

//   const handleCreateTrade = async () => {
//     if (!selectedPlayer || !currentPlayerState) return;

//     try {
//       await createTrade(selectedPlayer.wallet, initiatorOffer, targetOffer);

//       onClose();
//       handleReset();
//     } catch (error) {
//       console.error("Error creating trade:", error);
//     }
//   };

//   const handleReset = () => {
//     setCurrentStep("player-selection");
//     setSelectedPlayer(null);
//     setInitiatorOffer({ money: "0", properties: [] });
//     setTargetOffer({ money: "0", properties: [] });
//   };

//   const handleClose = () => {
//     onClose();
//     handleReset();
//   };

//   const canCreateTrade = () => {
//     const hasInitiatorOffer =
//       parseInt(initiatorOffer.money) > 0 ||
//       initiatorOffer.properties.length > 0;
//     const hasTargetOffer =
//       parseInt(targetOffer.money) > 0 || targetOffer.properties.length > 0;

//     return hasInitiatorOffer || hasTargetOffer;
//   };

//   // Filter out current player from available players
//   const availablePlayers = players.filter(
//     (player) => player.wallet !== currentPlayerState?.wallet
//   );

//   return (
//     <Dialog open={isOpen} onOpenChange={handleClose}>
//       {/* <DialogContent className="max-w-md overflow-y-auto p-6 bg-background border-none rounded-lg shadow-xl"> */}
//       <DialogContent className="max-w-md overflow-y-auto">
//         <DialogHeader
//         // className="pb-3 border-b border-black dark:border-gray-800"
//         >
//           <div className="flex items-center gap-2 justify-between">
//             {currentStep === "trade-configuration" && (
//               <Button
//                 variant="default"
//                 size="icon"
//                 onClick={handleBack}
//                 className="h-8 w-8 rounded-full bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900 dark:hover:bg-emerald-800 text-emerald-600 dark:text-emerald-300"
//               >
//                 <ArrowLeft className="h-4 w-4" />
//               </Button>
//             )}
//             <DialogTitle className="text-base font-semibold flex-grow text-gray-900 dark:text-gray-100">
//               {currentStep === "player-selection"
//                 ? "Select Trading Partner"
//                 : "Trade Properties & Money"}
//             </DialogTitle>
//             {/* <Button
//               variant="default"
//               size="icon"
//               onClick={handleClose}
//               className="h-8 w-8 rounded-full bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-300"
//             >
//               <span className="text-lg">×</span>
//             </Button> */}
//           </div>
//         </DialogHeader>

//         {currentStep === "player-selection" && (
//           <PlayerSelectionStep
//             players={availablePlayers}
//             onPlayerSelect={handlePlayerSelect}
//           />
//         )}

//         {currentStep === "trade-configuration" && selectedPlayer && (
//           <TradeConfigurationStep
//             selectedPlayer={selectedPlayer}
//             currentPlayer={currentPlayerState!}
//             initiatorOffer={initiatorOffer}
//             targetOffer={targetOffer}
//             onInitiatorOfferChange={setInitiatorOffer}
//             onTargetOfferChange={setTargetOffer}
//             onCreateTrade={handleCreateTrade}
//             canCreateTrade={canCreateTrade()}
//           />
//         )}
//       </DialogContent>
//     </Dialog>
//   );
// }
