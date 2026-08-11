// "use client";

// import { Button } from "@/components/ui/button";
// import { usePrivy, useSolanaWallets, useSessionSigners } from "@privy-io/react-auth";
// import { Copy, CopyCheck, Download, PlugZap, Unplug, WalletIcon } from "lucide-react";
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuSeparator,
//   DropdownMenuTrigger,
// } from "../ui/dropdown-menu";
// import {
//   Dialog,
//   DialogTrigger,
//   DialogContent,
//   DialogDescription,
//   DialogFooter,
//   DialogHeader,
//   DialogTitle,
//   DialogClose,
// } from "../ui/dialog";
// import { cn, formatAddress } from "@/lib/utils";
// import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
// import { toast } from "sonner";
// import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
// import { Spinner } from "../ui/spinner";
// import Link from "next/link";
// import { useGameWallet } from "@/hooks/use-game-wallet";
// import { playSound, playGameStateSound } from "@/lib/soundUtil";
// import {
//   useExportWallet,
// } from "@privy-io/react-auth/solana";
// import { useState, useEffect } from "react";
// import envConfig from "@/configs/env";

// interface CreateGameWalletDialogProps {
//   trigger?: React.ReactNode;
//   open?: boolean;
//   onOpenChange?: (open: boolean) => void;
// }

// function DelegateWalletDialog({
//   trigger,
//   open,
//   onOpenChange,
// }: CreateGameWalletDialogProps) {
//   const { addSessionSigners } = useSessionSigners();
//   const gameWalletData = useGameWallet();
//   const [isDelegating, setIsDelegating] = useState(false);

//   const gameWalletAddress = gameWalletData?.gameWalletAddress;
//   const isDelegated = gameWalletData?.isDelegated || false;

//   const handleDelegate = async () => {
//     if (!gameWalletAddress) {
//       toast.error("No game wallet found");
//       return;
//     }

//     try {
//       setIsDelegating(true);
//       await addSessionSigners({
//         address: gameWalletAddress,
//         signers: [
//           {
//             signerId: envConfig.NEXT_PUBLIC_AUTH_ID_PRIVY,
//             policyIds: [],
//           },
//         ],
//       });
//       toast.success("Successfully delegated game wallet");
//       setIsDelegating(false);
//       onOpenChange?.(false);
//     } catch (error) {
//       console.error("Error in handleDelegate:", error);
//       toast.error("Failed to delegate game wallet");
//       setIsDelegating(false);
//     }
//   };

//   const getButtonText = () => {
//     if (isDelegating) return "Delegating...";
//     return "Delegate Wallet";
//   };

//   const isLoading = isDelegating;

//   return (
//     <Dialog open={open} onOpenChange={onOpenChange}>
//       <DialogTrigger asChild>{trigger}</DialogTrigger>
//       <DialogContent className="max-w-lg">
//         <DialogHeader>
//           <DialogTitle className="flex items-center gap-2 text-xl">
//             🔐 Delegate Your Game Wallet
//           </DialogTitle>
//           <DialogDescription className="text-left space-y-3 text-base leading-relaxed text-foreground">
//             Delegating your game wallet enables a seamless monopoly experience without
//             interrupting your gameplay for wallet approvals on every move. This
//             allows our system to securely sign transactions on your
//             behalf—no more popups from wallets like Phantom!
//           </DialogDescription>
//         </DialogHeader>

//         <div className="p-3 rounded-lg border bg-muted/30">
//           <div className="flex items-center gap-2 mb-2">
//             <WalletIcon className="h-4 w-4" />
//             <span className="font-medium text-sm">Game Wallet Status</span>
//           </div>
//           <div className="flex items-center justify-between">
//             <span className="text-sm text-muted-foreground">
//               Wallet: {gameWalletAddress?.slice(0, 8)}...
//               {gameWalletAddress?.slice(-8)}
//             </span>
//             <span
//               className={cn(
//                 "text-xs px-2 py-1 rounded",
//                 isDelegated
//                   ? "bg-green-500/20 text-green-500"
//                   : "bg-yellow-500/20 text-yellow-500"
//               )}
//             >
//               {isDelegated ? "Delegated" : "Not Delegated"}
//             </span>
//           </div>
//         </div>

//         <DialogFooter className="flex-col sm:flex-row gap-2">
//           <DialogClose asChild>
//             <Button variant="ghost" disabled={isLoading}>
//               Cancel
//             </Button>
//           </DialogClose>
//           <Button
//             onClick={handleDelegate}
//             disabled={isLoading || isDelegated}
//             className={cn(isDelegated && "bg-green-600 hover:bg-green-700")}
//           >
//             {getButtonText()}
//           </Button>
//         </DialogFooter>
//       </DialogContent>
//     </Dialog>
//   );
// }

// export default function ConnectWalletBtn() {
//   const { ready, authenticated, login, logout } = usePrivy();
//   const { exportWallet } = useExportWallet();
//   const [copy, isCopied] = useCopyToClipboard();
//   const gameWalletData = useGameWallet();
//   const gameWalletAddress = gameWalletData?.gameWalletAddress;
//   const [isDelegationDialogOpen, setIsDelegationDialogOpen] = useState(false);
//   const [hasShownDelegationDialog, setHasShownDelegationDialog] = useState(false);

//   useEffect(() => {
//     if (authenticated && gameWalletAddress && !gameWalletData?.isDelegated && !hasShownDelegationDialog) {
//       const timer = setTimeout(() => {
//         setIsDelegationDialogOpen(true);
//         setHasShownDelegationDialog(true);
//       }, 500);
      
//       return () => clearTimeout(timer);
//     }
//   }, [authenticated, gameWalletAddress, gameWalletData?.isDelegated, hasShownDelegationDialog]);

//   // Reset delegation dialog state when user logs out
//   useEffect(() => {
//     if (!authenticated) {
//       setHasShownDelegationDialog(false);
//       setIsDelegationDialogOpen(false);
//     }
//   }, [authenticated]);
 

//   if (!ready) {
//     return (
//       <Button
//         variant="ghost"
//         className={cn("size-14 aspect-square p-2 md:p-3")}
//         asChild
//       >
//         <Spinner size={12} variant="bars" />
//       </Button>
//     );
//   }

//   const handleCopy = async (address: string) => {
//     const success = await copy(address);
//     if (success) {
//       toast.success("Address copied to clipboard");
//     }
//   };

//   return (
//     <div className="">
//       {!authenticated ? (
//         <Button onClick={() => {
//           playSound("button-click", 0.7);
//           login();
//         }} 
//         onMouseEnter={() => playSound("button-hover", 0.3)}
//         className="h-full">
//           <div className="flex items-center gap-2 group/nav">
//             <span>Connect Wallet</span>
//             <div className="relative z-10 size-4 overflow-hidden flex items-center justify-center">
//               <PlugZap className="-z-10 absolute opacity-100 scale-100 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 group-hover/nav:-translate-y-5 group-hover/nav:translate-x-5 group-hover/nav:opacity-0 group-hover/nav:scale-0 transition-all duration-200" />
//               <PlugZap className="absolute -z-10 -bottom-4 -left-4 opacity-0 scale-0 group-hover/nav:-translate-y-[15px] group-hover/nav:translate-x-4 group-hover/nav:opacity-100 group-hover/nav:scale-100 transition-all duration-200" />
//             </div>
//           </div>
//         </Button>
//       ) : gameWalletAddress ? (
//         <DropdownMenu>
//           <DropdownMenuTrigger className="h-full" asChild>
//             <Button
//               variant="ghost"
//               className={cn("size-14 aspect-square p-2 md:p-3 relative")}
//               asChild
//             >
//               <div className="relative">
//                 <Avatar>
//                   <AvatarImage
//                     src={`https://api.dicebear.com/9.x/pixel-art/svg?seed=${
//                       gameWalletAddress || ""
//                     }`}
//                     alt={gameWalletAddress || "Wallet"}
//                     className="rounded-full bg-accent select-none hover:animate-none hover:scale-105 hover:rotate-[10deg] transition-all duration-300"
//                   />
//                   <AvatarFallback className="rounded-full bg-primary/10 text-primary">
//                     {gameWalletAddress || "?"}
//                   </AvatarFallback>
//                 </Avatar>
//                 {gameWalletData?.isDelegated && (
//                   <div className="absolute -top-1 -right-1 size-3 bg-green-500 rounded-full border-2 border-background"></div>
//                 )}
//               </div>
//             </Button>
//           </DropdownMenuTrigger>
//           <DropdownMenuContent className="w-[300px]" align="end">
//             <div className="flex items-center gap-3 p-2">
//               <Avatar className="size-12 ring-2 ring-primary/10">
//                 <AvatarImage
//                   src={`https://api.dicebear.com/9.x/pixel-art/svg?seed=${
//                     gameWalletAddress || ""
//                   }`}
//                   alt={gameWalletAddress || "Wallet"}
//                   className="rounded-full bg-muted p-1 hover:scale-105 hover:rotate-[10deg] transition-all duration-300"
//                 />
//                 <AvatarFallback className="rounded-full bg-primary/10 text-primary">
//                   {gameWalletAddress?.charAt(0) || "?"}
//                 </AvatarFallback>
//               </Avatar>
//               <div className="w-full">
//                 <div className="flex items-center justify-between w-full">
//                   <div className="flex-1 min-w-0">
//                     <p className="text-sm font-medium truncate">
//                       {formatAddress(gameWalletAddress.toString())}
//                     </p>
//                   </div>
//                   <Button
//                     variant="ghost"
//                     size="icon"
//                     className="size-8"
//                     onClick={(e) => {
//                       e.stopPropagation();
//                       handleCopy(gameWalletAddress.toString());
//                     }}
//                   >
//                     {isCopied ? (
//                       <CopyCheck size={16} className="text-primary" />
//                     ) : (
//                       <Copy size={16} className="text-muted-foreground" />
//                     )}
//                   </Button>
//                 </div >
//                 <div className="flex items-center justify-between">
//                   <p className="text-sm text-muted-foreground">
//                    Embedded wallet <Link href="https://docs.privy.io/wallets/overview" target="_blank" className="text-primary underline">learn more</Link>
//                   </p>
//                   {gameWalletData?.isDelegated && (
//                     <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-500">
//                       Delegated
//                     </span>
//                   )}
//                 </div>
//                 </div>
              
//             </div>
//             {!gameWalletData?.isDelegated && (
//               <>
//                 <DelegateWalletDialog
//                   open={isDelegationDialogOpen}
//                   onOpenChange={setIsDelegationDialogOpen}
//                   trigger={
//                     <DropdownMenuItem
//                       onSelect={(e) => {
//                         e.preventDefault();
//                         setIsDelegationDialogOpen(true);
//                       }}
//                       className="flex items-center justify-between"
//                     >
//                       <span>Delegate Wallet</span>
//                       <WalletIcon size={14} />
//                     </DropdownMenuItem>
//                   }
//                 />
//                 <DropdownMenuSeparator />
//               </>
//             )}
//             <DropdownMenuItem
//               onClick={() => exportWallet({ address: gameWalletAddress })}
//               className="flex items-center justify-between "
//             >
//               <span>Export your embedded wallet</span>
//               <Download size={14} />
//             </DropdownMenuItem>
//             <DropdownMenuSeparator />
            
//             <DropdownMenuItem
//               onClick={() => {
//                 playSound("button-click", 0.6);
//                 logout();
//               }}
//               variant="destructive"
//               className="flex items-center justify-between "
//             >
//               <span>Disconnect</span>
//               <Unplug size={14} />
//             </DropdownMenuItem>
//           </DropdownMenuContent>
//         </DropdownMenu>
//       ) : (
//         <Button
//           variant="ghost"
//           className={cn("size-14 aspect-square p-2 md:p-3")}
//           asChild
//         >
//           <Spinner size={12} variant="bars" />
//         </Button>
//       )}
//     </div>
//   );
// }