// "use client";

// import React from "react";

// interface PropertyIndicatorProps {
//     position: number;
//     ownerId?: number;
//     ownerColor?: string;
//     houses: number;
//     hasHotel: boolean;
//     hasFlag: boolean;
//     isMortgaged: boolean;
// }

// export const PropertyIndicator: React.FC<PropertyIndicatorProps> = ({
//     position,
//     ownerId,
//     ownerColor,
//     houses,
//     hasHotel,
//     hasFlag,
//     isMortgaged
// }) => {
//     if (!ownerId) return null;

//     // Position indicators based on board position (40 spaces)
//     const getIndicatorPosition = (pos: number) => {
//         // 14x14 grid with 2x2 corner spaces and 2x2 side spaces
//         // Each grid cell is approximately 7.14% wide (100% / 14)
//         const cellSize = 7.14;
//         const cornerCenter = 10.71; // Center of 2x2 corner (1.5 cells from edge)
//         const sideSpaceCenter = 17.86; // Center position for 2x2 side spaces

//         // Offset for property indicators (slightly inside the spaces)
//         const indicatorOffset = 1.5; // 1.5% offset towards center

//         if (pos === 0) {
//             // GO corner (bottom-right) - no indicator needed for corner
//             return { left: `${100 - cornerCenter}%`, top: `${100 - cornerCenter}%` };
//         } else if (pos >= 1 && pos <= 9) {
//             // Bottom row (right to left from GO) - center of 2x2 side spaces
//             const spaceIndex = pos - 1;
//             const left = 100 - sideSpaceCenter - (spaceIndex * (cellSize * 10 / 9));
//             return { left: `${left}%`, top: `${100 - cornerCenter + indicatorOffset}%` };
//         } else if (pos === 10) {
//             // JAIL corner (bottom-left) - no indicator needed for corner
//             return { left: `${cornerCenter}%`, top: `${100 - cornerCenter}%` };
//         } else if (pos >= 11 && pos <= 19) {
//             // Left column (bottom to top) - center of 2x2 side spaces
//             const spaceIndex = pos - 11;
//             const top = 100 - sideSpaceCenter - (spaceIndex * (cellSize * 10 / 9));
//             return { left: `${cornerCenter - indicatorOffset}%`, top: `${top}%` };
//         } else if (pos === 20) {
//             // Free Parking corner (top-left) - no indicator needed for corner
//             return { left: `${cornerCenter}%`, top: `${cornerCenter}%` };
//         } else if (pos >= 21 && pos <= 29) {
//             // Top row (left to right) - center of 2x2 side spaces
//             const spaceIndex = pos - 21;
//             const left = sideSpaceCenter + (spaceIndex * (cellSize * 10 / 9));
//             return { left: `${left}%`, top: `${cornerCenter - indicatorOffset}%` };
//         } else if (pos === 30) {
//             // Go To Jail corner (top-right) - no indicator needed for corner
//             return { left: `${100 - cornerCenter}%`, top: `${cornerCenter}%` };
//         } else if (pos >= 31 && pos <= 39) {
//             // Right column (top to bottom) - center of 2x2 side spaces
//             const spaceIndex = pos - 31;
//             const top = sideSpaceCenter + (spaceIndex * (cellSize * 10 / 9));
//             return { left: `${100 - cornerCenter + indicatorOffset}%`, top: `${top}%` };
//         } else {
//             // Default fallback
//             return { left: '50%', top: '50%' };
//         }
//     };

//     const indicatorPos = getIndicatorPosition(position);

//     return (
//         <div
//             className="absolute pointer-events-none"
//             style={{
//                 left: indicatorPos.left,
//                 top: indicatorPos.top,
//                 transform: 'translate(-50%, -50%)',
//                 zIndex: 900
//             }}
//         >
//             {/* Owner indicator */}
//             <div
//                 className="w-2 h-2 rounded-full border border-white shadow-sm"
//                 style={{ backgroundColor: ownerColor }}
//             />

//             {/* Mortgage indicator */}
//             {isMortgaged && (
//                 <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full border border-white" />
//             )}

//             {/* Flag */}
//             {hasFlag && houses === 0 && !hasHotel && (
//                 <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2">
//                     <div
//                         className="w-1.5 h-1.5 bg-yellow-500 border border-white text-white text-xs flex items-center justify-center font-bold shadow-sm"
//                         title="Flag"
//                         style={{ fontSize: '6px' }}
//                     >
//                         🚩
//                     </div>
//                 </div>
//             )}

//             {/* Houses */}
//             {houses > 0 && !hasHotel && (
//                 <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 flex gap-0.5">
//                     {Array.from({ length: houses }).map((_, i) => (
//                         <div
//                             key={i}
//                             className="w-1 h-1 bg-green-600 border border-white shadow-sm"
//                             title={`${houses} house${houses > 1 ? 's' : ''}`}
//                         />
//                     ))}
//                 </div>
//             )}

//             {/* Hotel */}
//             {hasHotel && (
//                 <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2">
//                     <div
//                         className="w-1.5 h-1.5 bg-red-600 border border-white text-white text-xs flex items-center justify-center font-bold shadow-sm"
//                         title="Hotel"
//                     >
//                         H
//                     </div>
//                 </div>
//             )}
//         </div>
//     );
// };

// interface PropertyIndicatorsContainerProps {
//     propertyOwnership: { [position: number]: number };
//     players: Array<{ id: number; color: string }>;
//     propertyBuildings: { [position: number]: { houses: number; hasHotel: boolean; hasFlag: boolean } };
//     mortgagedProperties: number[];
// }

// export const PropertyIndicatorsContainer: React.FC<PropertyIndicatorsContainerProps> = ({
//     propertyOwnership,
//     players,
//     propertyBuildings,
//     mortgagedProperties
// }) => {
//     return (
//         <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 900 }}>
//             {Object.entries(propertyOwnership).map(([positionStr, ownerId]) => {
//                 const position = parseInt(positionStr);
//                 const owner = players.find(p => p.id === ownerId);
//                 const buildings = propertyBuildings[position] || { houses: 0, hasHotel: false, hasFlag: false };
//                 const isMortgaged = mortgagedProperties.includes(position);

//                 if (!owner) return null;

//                 return (
//                     <PropertyIndicator
//                         key={position}
//                         position={position}
//                         ownerId={ownerId}
//                         ownerColor={owner.color}
//                         houses={buildings.houses}
//                         hasHotel={buildings.hasHotel}
//                         hasFlag={buildings.hasFlag}
//                         isMortgaged={isMortgaged}
//                     />
//                 );
//             })}
//         </div>
//     );
// };
