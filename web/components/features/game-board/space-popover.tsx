// import type React from "react";
// import type { PropertyAccount } from "@/types/schema";
// import { Card, CardContent, CardHeader } from "@/components/ui/card";
// import { Badge } from "@/components/ui/badge";
// import { Separator } from "@/components/ui/separator";
// import {
//   Popover,
//   PopoverContent,
//   PopoverTrigger,
// } from "@/components/ui/popover";
// import { isSome } from "@solana/kit";
// import { getBoardSpaceData } from "@/lib/board-utils";
// import { BoardSpace } from "@/configs/board-data";

// interface SpaceTooltipProps {
//   position: number;
//   property?: PropertyAccount | null;
//   playerName?: string;
//   children: React.ReactNode;
// }

// const isPropertyOwned = (property?: PropertyAccount | null): boolean => {
//   return !!property && isSome(property.owner);
// };

// export const SpaceTooltip: React.FC<SpaceTooltipProps> = ({
//   position,
//   property,
//   playerName,
//   children,
// }) => {
//   const propertyData = getBoardSpaceData(position);
//   if (!propertyData) return <>{children}</>;

//   const renderPropertyTooltip = (data: BoardSpace) => {
//     const isOwned = isPropertyOwned(property);
//     const houses = property?.houses || 0;
//     const hasHotel = property?.hasHotel || false;
//     const isMortgaged = property?.isMortgaged || false;

//     return (
//       <Card className="w-80">
//         <CardHeader className="pb-3">
//           <div className="flex items-center justify-between">
//             <h3 className="font-semibold text-sm">{data.name}</h3>
//             <div
//               className={`w-4 h-4 ${data.colorClass} border border-border rounded-sm`}
//             ></div>
//           </div>
//         </CardHeader>

//         <CardContent className="space-y-2">
//           <div className="flex justify-between text-sm">
//             <span className="text-muted-foreground">Price:</span>
//             <span className="font-medium">${data.price}</span>
//           </div>

//           {data.flagCost && (
//             <div className="flex justify-between text-sm">
//               <span className="text-muted-foreground">Flag Cost:</span>
//               <span className="font-medium">${data.flagCost}</span>
//             </div>
//           )}

//           <div className="flex justify-between text-sm">
//             <span className="text-muted-foreground">Base Rent:</span>
//             <span className="font-medium">${data.baseRent}</span>
//           </div>

//           {data.rentWithColorGroup && (
//             <div className="flex justify-between text-sm">
//               <span className="text-muted-foreground">Rent (Color Group):</span>
//               <span className="font-medium">${data.rentWithColorGroup}</span>
//             </div>
//           )}

//           {data.rentWith1House && (
//             <div className="flex justify-between text-sm">
//               <span className="text-muted-foreground">Rent (1 House):</span>
//               <span className="font-medium">${data.rentWith1House}</span>
//             </div>
//           )}

//           {data.rentWith2Houses && (
//             <div className="flex justify-between text-sm">
//               <span className="text-muted-foreground">Rent (2 Houses):</span>
//               <span className="font-medium">${data.rentWith2Houses}</span>
//             </div>
//           )}

//           {data.rentWith3Houses && (
//             <div className="flex justify-between text-sm">
//               <span className="text-muted-foreground">Rent (3 Houses):</span>
//               <span className="font-medium">${data.rentWith3Houses}</span>
//             </div>
//           )}

//           {data.rentWith4Houses && (
//             <div className="flex justify-between text-sm">
//               <span className="text-muted-foreground">Rent (4 Houses):</span>
//               <span className="font-medium">${data.rentWith4Houses}</span>
//             </div>
//           )}

//           {data.rentWithHotel && (
//             <div className="flex justify-between text-sm">
//               <span className="text-muted-foreground">Rent (Hotel):</span>
//               <span className="font-medium">${data.rentWithHotel}</span>
//             </div>
//           )}

//           {data.houseCost && (
//             <div className="flex justify-between text-sm">
//               <span className="text-muted-foreground">House Cost:</span>
//               <span className="font-medium">${data.houseCost}</span>
//             </div>
//           )}

//           {data.mortgageValue && (
//             <div className="flex justify-between text-sm">
//               <span className="text-muted-foreground">Mortgage Value:</span>
//               <span className="font-medium">${data.mortgageValue}</span>
//             </div>
//           )}

//           <Separator className="my-3" />

//           <div className="flex justify-between items-center text-sm">
//             <span className="text-muted-foreground">Owner:</span>
//             <Badge variant={isOwned ? "default" : "secondary"}>
//               {isOwned ? playerName || "Unknown" : "Unowned"}
//             </Badge>
//           </div>

//           {isOwned && (
//             <>
//               <div className="flex justify-between text-sm">
//                 <span className="text-muted-foreground">Houses:</span>
//                 <Badge variant="outline">{houses}</Badge>
//               </div>

//               <div className="flex justify-between text-sm">
//                 <span className="text-muted-foreground">Hotel:</span>
//                 <Badge variant={hasHotel ? "default" : "outline"}>
//                   {hasHotel ? "Yes" : "No"}
//                 </Badge>
//               </div>

//               {isMortgaged && (
//                 <div className="text-center mt-2">
//                   <Badge variant="destructive">MORTGAGED</Badge>
//                 </div>
//               )}
//             </>
//           )}
//         </CardContent>
//       </Card>
//     );
//   };

//   const renderRailroadTooltip = (data: UnifiedPropertyData) => {
//     const isOwned = isPropertyOwned(property);

//     return (
//       <Card className="w-80">
//         <CardHeader className="pb-3">
//           <div className="flex items-center justify-between">
//             <h3 className="font-semibold text-sm">{data.name}</h3>
//             <div className="text-2xl">🚂</div>
//           </div>
//         </CardHeader>

//         <CardContent className="space-y-2">
//           <div className="flex justify-between text-sm">
//             <span className="text-muted-foreground">Price:</span>
//             <span className="font-medium">${data.price}</span>
//           </div>

//           {data.railroadRent && (
//             <>
//               <div className="flex justify-between text-sm">
//                 <span className="text-muted-foreground">
//                   Rent (1 Railroad):
//                 </span>
//                 <span className="font-medium">${data.railroadRent[0]}</span>
//               </div>
//               <div className="flex justify-between text-sm">
//                 <span className="text-muted-foreground">
//                   Rent (2 Railroads):
//                 </span>
//                 <span className="font-medium">${data.railroadRent[1]}</span>
//               </div>
//               <div className="flex justify-between text-sm">
//                 <span className="text-muted-foreground">
//                   Rent (3 Railroads):
//                 </span>
//                 <span className="font-medium">${data.railroadRent[2]}</span>
//               </div>
//               <div className="flex justify-between text-sm">
//                 <span className="text-muted-foreground">
//                   Rent (4 Railroads):
//                 </span>
//                 <span className="font-medium">${data.railroadRent[3]}</span>
//               </div>
//             </>
//           )}

//           {data.mortgageValue && (
//             <div className="flex justify-between text-sm">
//               <span className="text-muted-foreground">Mortgage Value:</span>
//               <span className="font-medium">${data.mortgageValue}</span>
//             </div>
//           )}

//           <Separator className="my-3" />

//           <div className="flex justify-between items-center text-sm">
//             <span className="text-muted-foreground">Owner:</span>
//             <Badge variant={isOwned ? "default" : "secondary"}>
//               {isOwned ? playerName || "Unknown" : "Unowned"}
//             </Badge>
//           </div>
//         </CardContent>
//       </Card>
//     );
//   };

//   // const renderBeachTooltip = (data: UnifiedPropertyData) => {
//   //   const isOwned = isPropertyOwned(property);

//   //   return (
//   //     <Card className="w-80">
//   //       <CardHeader className="pb-3">
//   //         <div className="flex items-center justify-between">
//   //           <h3 className="font-semibold text-sm">{data.name}</h3>
//   //           <div className="text-2xl">🏖️</div>
//   //         </div>
//   //       </CardHeader>

//   //       <CardContent className="space-y-2">
//   //         <div className="flex justify-between text-sm">
//   //           <span className="text-muted-foreground">Price:</span>
//   //           <span className="font-medium">${data.price}</span>
//   //         </div>

//   //         {data.beachRent && (
//   //           <>
//   //             <div className="flex justify-between text-sm">
//   //               <span className="text-muted-foreground">Rent (1 Beach):</span>
//   //               <span className="font-medium">${data.beachRent[0]}</span>
//   //             </div>
//   //             <div className="flex justify-between text-sm">
//   //               <span className="text-muted-foreground">Rent (2 Beaches):</span>
//   //               <span className="font-medium">${data.beachRent[1]}</span>
//   //             </div>
//   //             <div className="flex justify-between text-sm">
//   //               <span className="text-muted-foreground">Rent (3 Beaches):</span>
//   //               <span className="font-medium">${data.beachRent[2]}</span>
//   //             </div>
//   //             <div className="flex justify-between text-sm">
//   //               <span className="text-muted-foreground">Rent (4 Beaches):</span>
//   //               <span className="font-medium">${data.beachRent[3]}</span>
//   //             </div>
//   //           </>
//   //         )}

//   //         {data.mortgageValue && (
//   //           <div className="flex justify-between text-sm">
//   //             <span className="text-muted-foreground">Mortgage Value:</span>
//   //             <span className="font-medium">${data.mortgageValue}</span>
//   //           </div>
//   //         )}

//   //         <Separator className="my-3" />

//   //         <div className="flex justify-between items-center text-sm">
//   //           <span className="text-muted-foreground">Owner:</span>
//   //           <Badge variant={isOwned ? "default" : "secondary"}>
//   //             {isOwned ? playerName || "Unknown" : "Unowned"}
//   //           </Badge>
//   //         </div>
//   //       </CardContent>
//   //     </Card>
//   //   );
//   // };

//   const renderUtilityTooltip = (data: UnifiedPropertyData) => {
//     const isOwned = isPropertyOwned(property);

//     return (
//       <Card className="w-80">
//         <CardHeader className="pb-3">
//           <div className="flex items-center justify-between">
//             <h3 className="font-semibold text-sm">{data.name}</h3>
//             <div className="text-2xl">
//               {data.name.includes("Electric") ? "💡" : "💧"}
//             </div>
//           </div>
//         </CardHeader>

//         <CardContent className="space-y-2">
//           <div className="flex justify-between text-sm">
//             <span className="text-muted-foreground">Price:</span>
//             <span className="font-medium">${data.price}</span>
//           </div>

//           {data.utilityMultiplier && (
//             <>
//               <div className="flex justify-between text-sm">
//                 <span className="text-muted-foreground">Rent (1 Utility):</span>
//                 <span className="font-medium">
//                   {data.utilityMultiplier[0]}x dice roll
//                 </span>
//               </div>
//               <div className="flex justify-between text-sm">
//                 <span className="text-muted-foreground">
//                   Rent (2 Utilities):
//                 </span>
//                 <span className="font-medium">
//                   {data.utilityMultiplier[1]}x dice roll
//                 </span>
//               </div>
//             </>
//           )}

//           {data.mortgageValue && (
//             <div className="flex justify-between text-sm">
//               <span className="text-muted-foreground">Mortgage Value:</span>
//               <span className="font-medium">${data.mortgageValue}</span>
//             </div>
//           )}

//           <Separator className="my-3" />

//           <div className="flex justify-between items-center text-sm">
//             <span className="text-muted-foreground">Owner:</span>
//             <Badge variant={isOwned ? "default" : "secondary"}>
//               {isOwned ? playerName || "Unknown" : "Unowned"}
//             </Badge>
//           </div>
//         </CardContent>
//       </Card>
//     );
//   };

//   const renderTaxTooltip = (data: UnifiedPropertyData) => {
//     return (
//       <Card className="w-80">
//         <CardHeader className="pb-3">
//           <div className="flex items-center justify-between">
//             <h3 className="font-semibold text-sm">{data.name}</h3>
//             <div className="text-2xl">💎</div>
//           </div>
//         </CardHeader>

//         <CardContent className="space-y-2">
//           <div className="flex justify-between text-sm">
//             <span className="text-muted-foreground">Tax Amount:</span>
//             <span className="font-medium">${data.taxAmount}</span>
//           </div>

//           {data.instructions && (
//             <div className="text-sm text-muted-foreground mt-3 p-2 bg-muted rounded-md">
//               {data.instructions}
//             </div>
//           )}
//         </CardContent>
//       </Card>
//     );
//   };

//   const renderSpecialTooltip = (data: UnifiedPropertyData) => {
//     const getSpecialIcon = (name: string) => {
//       if (name === "GO") return "→";
//       if (name === "JAIL") return "🔒";
//       if (name === "Free Parking") return "🅿️";
//       if (name === "Go To Jail") return "👮";
//       if (name === "Chance") return "?";
//       if (name === "Community Chest") return "📦";
//       return "❓";
//     };

//     const getSpecialDescription = (name: string) => {
//       if (name === "GO") return "Collect $200 when you pass or land here";
//       if (name === "JAIL") return "Just visiting or serving time";
//       if (name === "Free Parking") return "Free resting space";
//       if (name === "Go To Jail") return "Go directly to jail";
//       if (name === "Chance") return "Draw a Chance card";
//       if (name === "Community Chest") return "Draw a Community Chest card";
//       return "Special space";
//     };

//     return (
//       <Card className="w-80">
//         <CardHeader className="pb-3">
//           <div className="flex items-center justify-between">
//             <h3 className="font-semibold text-sm">{data.name}</h3>
//             <div className="text-2xl">{getSpecialIcon(data.name)}</div>
//           </div>
//         </CardHeader>

//         <CardContent>
//           <div className="text-sm text-muted-foreground p-2 bg-muted rounded-md">
//             {getSpecialDescription(data.name)}
//           </div>
//         </CardContent>
//       </Card>
//     );
//   };

//   const renderTooltipContent = () => {
//     switch (propertyData.type) {
//       case "property":
//         return renderPropertyTooltip(propertyData);
//       case "railroad":
//         return renderRailroadTooltip(propertyData);
//       // case "beach":
//       // return renderBeachTooltip(propertyData);
//       case "utility":
//         return renderUtilityTooltip(propertyData);
//       case "tax":
//         return renderTaxTooltip(propertyData);
//       case "corner":
//       case "chance":
//       case "community-chest":
//         return renderSpecialTooltip(propertyData);
//       default:
//         return null;
//     }
//   };

//   return (
//     <Popover>
//       <PopoverTrigger asChild>{children}</PopoverTrigger>
//       <PopoverContent
//         side="top"
//         className="p-0 border-0 bg-transparent shadow-lg w-auto"
//       >
//         {renderTooltipContent()}
//       </PopoverContent>
//     </Popover>
//   );
// };
