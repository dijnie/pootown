// "use client";

// import React from "react";
// import { getPropertyData } from "@/data/unified-monopoly-data";

// interface PropertyBuildingDialogProps {
//     isOpen: boolean;
//     position: number;
//     playerMoney: number;
//     currentHouses: number;
//     hasHotel: boolean;
//     onBuildHouses: (housesToBuild: number) => void;
//     onBuildHotel: () => void;
//     onClose: () => void;
// }

// export const PropertyBuildingDialog: React.FC<PropertyBuildingDialogProps> = ({
//     isOpen,
//     position,
//     playerMoney,
//     currentHouses,
//     hasHotel,
//     onBuildHouses,
//     onBuildHotel,
//     onClose,
// }) => {
//     if (!isOpen) return null;

//     const property = getPropertyData(position);
//     if (!property || property.type !== "property") return null;

//     const houseCost = property.houseCost || 0;
//     const hotelCost = property.hotelCost || 0;

//     // Calculate building options
//     const canBuildHouse = currentHouses < 4 && !hasHotel && playerMoney >= houseCost;
//     const canUpgradeHouses = currentHouses > 0 && currentHouses < 4 && !hasHotel;
//     const canBuildHotel = currentHouses === 4 && !hasHotel && playerMoney >= hotelCost;

//     // Calculate maximum houses that can be built at once
//     const maxHousesCanAfford = Math.floor(playerMoney / houseCost);
//     const maxHousesCanBuild = Math.min(4 - currentHouses, maxHousesCanAfford);

//     const handleBackdropClick = (e: React.MouseEvent) => {
//         if (e.target === e.currentTarget) {
//             onClose();
//         }
//     };

//     const getBuildingStatus = () => {
//         if (hasHotel) return "Hotel";
//         if (currentHouses > 0) return `${currentHouses} House${currentHouses > 1 ? 's' : ''}`;
//         return "No buildings";
//     };

//     const getCurrentRent = () => {
//         if (hasHotel) return property.rentWithHotel;
//         if (currentHouses === 4) return property.rentWith4Houses;
//         if (currentHouses === 3) return property.rentWith3Houses;
//         if (currentHouses === 2) return property.rentWith2Houses;
//         if (currentHouses === 1) return property.rentWith1House;
//         return property.baseRent;
//     };

//     const getRentAfterBuilding = (houses: number) => {
//         if (houses === 4 && canBuildHotel) return property.rentWithHotel;
//         if (houses === 4) return property.rentWith4Houses;
//         if (houses === 3) return property.rentWith3Houses;
//         if (houses === 2) return property.rentWith2Houses;
//         if (houses === 1) return property.rentWith1House;
//         return property.baseRent;
//     };

//     return (
//         <div
//             className={`fixed inset-0 flex items-center justify-center z-50 transition-all duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
//                 }`}
//             onClick={handleBackdropClick}
//         >
//             {/* Background overlay */}
//             <div className="absolute inset-0 bg-black opacity-20" />

//             {/* Dialog */}
//             <div
//                 className={`relative bg-white border-2 border-gray-300 p-6 max-w-md w-full mx-4 transition-all duration-300 ${isOpen ? "translate-y-0 scale-100" : "translate-y-8 scale-95"
//                     }`}
//             >
//                 <div className="text-center mb-4">
//                     <h3 className="text-lg font-medium text-gray-800 mb-2">
//                         Build on {property.name}
//                     </h3>
//                     <div className="text-sm text-gray-600 mb-2">
//                         Current: {getBuildingStatus()}
//                     </div>
//                     <div className="text-sm text-gray-600 mb-4">
//                         Current Rent: ${getCurrentRent()}
//                     </div>
//                 </div>

//                 <div className="mb-4 text-sm">
//                     <div className="flex justify-between mb-1">
//                         <span className="text-gray-600">Your Money:</span>
//                         <span className="font-medium">${playerMoney}</span>
//                     </div>
//                     <div className="flex justify-between mb-2">
//                         <span className="text-gray-600">House Cost:</span>
//                         <span className="font-medium">${houseCost}</span>
//                     </div>
//                     {currentHouses === 4 && (
//                         <div className="flex justify-between mb-2">
//                             <span className="text-gray-600">Hotel Cost:</span>
//                             <span className="font-medium">${hotelCost}</span>
//                         </div>
//                     )}
//                 </div>

//                 {/* Building Options - Always show all options */}
//                 <div className="space-y-2 mb-4">
//                     <div className="text-sm text-gray-600 mb-2 text-center">
//                         Building Options:
//                     </div>

//                     {/* House Options (1, 2, 3, 4) - Always show all */}
//                     {[1, 2, 3, 4].map((targetHouses) => {
//                         const housesToBuild = Math.max(0, targetHouses - currentHouses);
//                         const cost = housesToBuild * houseCost;
//                         const newRent = getRentAfterBuilding(targetHouses);

//                         // Determine if this option is available
//                         let isDisabled = false;
//                         let disableReason = "";

//                         if (hasHotel) {
//                             isDisabled = true;
//                             disableReason = "Has hotel";
//                         } else if (targetHouses <= currentHouses) {
//                             isDisabled = true;
//                             disableReason = "Already have";
//                         } else if (currentHouses === 0 && targetHouses > 1) {
//                             isDisabled = true;
//                             disableReason = "Must build 1 first";
//                         } else if (playerMoney < cost) {
//                             isDisabled = true;
//                             disableReason = "Not enough money";
//                         }

//                         return (
//                             <button
//                                 key={targetHouses}
//                                 onClick={() => !isDisabled && onBuildHouses(housesToBuild)}
//                                 disabled={isDisabled}
//                                 className={`w-full px-3 py-2 transition-colors text-sm flex justify-between items-center ${!isDisabled
//                                         ? "bg-blue-600 text-white hover:bg-blue-700"
//                                         : "bg-gray-300 text-gray-500 cursor-not-allowed"
//                                     }`}
//                             >
//                                 <span>
//                                     {targetHouses} House{targetHouses > 1 ? 's' : ''}
//                                     {targetHouses > currentHouses && !isDisabled && ` (+${housesToBuild})`}
//                                     {` - Rent: $${newRent}`}
//                                     {isDisabled && ` (${disableReason})`}
//                                 </span>
//                                 <span>${cost}</span>
//                             </button>
//                         );
//                     })}

//                     {/* Hotel Option - Always show */}
//                     {(() => {
//                         const hotelRent = property.rentWithHotel || 0;
//                         let isDisabled = false;
//                         let disableReason = "";

//                         if (hasHotel) {
//                             isDisabled = true;
//                             disableReason = "Already has hotel";
//                         } else if (currentHouses < 4) {
//                             isDisabled = true;
//                             disableReason = "Need 4 houses first";
//                         } else if (playerMoney < hotelCost) {
//                             isDisabled = true;
//                             disableReason = "Not enough money";
//                         }

//                         return (
//                             <button
//                                 onClick={() => !isDisabled && onBuildHotel()}
//                                 disabled={isDisabled}
//                                 className={`w-full px-3 py-2 transition-colors text-sm flex justify-between items-center ${!isDisabled
//                                         ? "bg-yellow-600 text-white hover:bg-yellow-700"
//                                         : "bg-gray-300 text-gray-500 cursor-not-allowed"
//                                     }`}
//                             >
//                                 <span>
//                                     Hotel - Rent: ${hotelRent}
//                                     {isDisabled && ` (${disableReason})`}
//                                 </span>
//                                 <span>${hotelCost}</span>
//                             </button>
//                         );
//                     })()}
//                 </div>

//                 {/* Info about building rules */}
//                 <div className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 text-xs mb-4">
//                     <p className="mb-1">Building Rules:</p>
//                     <ul className="list-disc list-inside space-y-1">
//                         <li><strong>First time:</strong> Can only build 1 house</li>
//                         <li><strong>Upgrade:</strong> Can upgrade to 2, 3, or 4 houses</li>
//                         <li><strong>Hotel:</strong> Upgrade from 4 houses to hotel</li>
//                         <li>Must own all properties in color group to build</li>
//                     </ul>
//                 </div>

//                 <button
//                     onClick={onClose}
//                     className="w-full px-3 py-2 bg-gray-200 text-gray-800 hover:bg-gray-300 transition-colors text-sm"
//                 >
//                     Close
//                 </button>
//             </div>
//         </div>
//     );
// };
