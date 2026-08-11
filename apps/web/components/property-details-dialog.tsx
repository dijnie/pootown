// "use client";

// import React from "react";
// import { getPropertyData } from "@/data/unified-monopoly-data";

// interface PropertyDetailsDialogProps {
//     isOpen: boolean;
//     position: number;
//     onClose: () => void;
// }

// export const PropertyDetailsDialog: React.FC<PropertyDetailsDialogProps> = ({
//     isOpen,
//     position,
//     onClose,
// }) => {
//     if (!isOpen) return null;

//     const property = getPropertyData(position);
//     if (!property) return null;

//     // Close when clicking outside the dialog
//     const handleBackdropClick = (e: React.MouseEvent) => {
//         if (e.target === e.currentTarget) {
//             onClose();
//         }
//     };

//     const renderPropertyDetails = () => {
//         if (property.type === "property") {
//             return (
//                 <div className="space-y-2">
//                     {/* Property Purchase Information */}
//                     <div className="bg-green-50 p-3 rounded border-l-4 border-green-400">
//                         <h4 className="font-semibold mb-2 text-green-800">Property Purchase</h4>
//                         <div className="space-y-1 text-sm">
//                             <div className="flex justify-between">
//                                 <span className="font-medium">Purchase Price:</span>
//                                 <span className="font-bold text-green-700">${property.price}</span>
//                             </div>
//                             <div className="flex justify-between">
//                                 <span>Mortgage Value:</span>
//                                 <span>${property.mortgageValue}</span>
//                             </div>
//                         </div>
//                     </div>

//                     {/* Rent Information */}
//                     <div className="bg-gray-50 p-3 rounded">
//                         <h4 className="font-semibold mb-2">Rent Information</h4>
//                         <div className="space-y-1 text-sm">
//                             <div className="flex justify-between">
//                                 <span>Base Rent:</span>
//                                 <span>${property.baseRent}</span>
//                             </div>
//                             <div className="flex justify-between">
//                                 <span>With Color Group:</span>
//                                 <span>${property.rentWithColorGroup}</span>
//                             </div>
//                             <div className="flex justify-between">
//                                 <span>With 1 House:</span>
//                                 <span>${property.rentWith1House}</span>
//                             </div>
//                             <div className="flex justify-between">
//                                 <span>With 2 Houses:</span>
//                                 <span>${property.rentWith2Houses}</span>
//                             </div>
//                             <div className="flex justify-between">
//                                 <span>With 3 Houses:</span>
//                                 <span>${property.rentWith3Houses}</span>
//                             </div>
//                             <div className="flex justify-between">
//                                 <span>With 4 Houses:</span>
//                                 <span>${property.rentWith4Houses}</span>
//                             </div>
//                             <div className="flex justify-between font-semibold">
//                                 <span>With Hotel:</span>
//                                 <span>${property.rentWithHotel}</span>
//                             </div>
//                         </div>
//                     </div>

//                     {/* Building Costs */}
//                     <div className="bg-blue-50 p-3 rounded border-l-4 border-blue-400">
//                         <h4 className="font-semibold mb-2 text-blue-800">Building Costs</h4>
//                         <div className="space-y-1 text-sm">
//                             <div className="flex justify-between">
//                                 <span>House Cost:</span>
//                                 <span className="font-medium text-blue-700">${property.houseCost}</span>
//                             </div>
//                             <div className="flex justify-between">
//                                 <span>Hotel Cost:</span>
//                                 <span className="font-medium text-blue-700">${property.hotelCost}</span>
//                             </div>
//                         </div>
//                         <div className="mt-2 p-2 bg-blue-100 rounded text-xs text-blue-600">
//                             💡 Chi phí này là để xây thêm nhà/khách sạn, không phải giá mua đất
//                         </div>
//                     </div>
//                 </div>
//             );
//         } else if (property.type === "railroad") {
//             return (
//                 <div className="space-y-2">
//                     <div className="bg-gray-50 p-3 rounded">
//                         <h4 className="font-semibold mb-2">Purchase Price: ${property.price}</h4>
//                         <div className="space-y-1 text-sm">
//                             <div className="flex justify-between">
//                                 <span>Rent with 1 Railroad:</span>
//                                 <span>${property.railroadRent?.[0]}</span>
//                             </div>
//                             <div className="flex justify-between">
//                                 <span>Rent with 2 Railroads:</span>
//                                 <span>${property.railroadRent?.[1]}</span>
//                             </div>
//                             <div className="flex justify-between">
//                                 <span>Rent with 3 Railroads:</span>
//                                 <span>${property.railroadRent?.[2]}</span>
//                             </div>
//                             <div className="flex justify-between">
//                                 <span>Rent with 4 Railroads:</span>
//                                 <span>${property.railroadRent?.[3]}</span>
//                             </div>
//                             <div className="flex justify-between">
//                                 <span>Mortgage Value:</span>
//                                 <span>${property.mortgageValue}</span>
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//             );
//         } else if (property.type === "utility") {
//             return (
//                 <div className="space-y-2">
//                     <div className="bg-gray-50 p-3 rounded">
//                         <h4 className="font-semibold mb-2">Purchase Price: ${property.price}</h4>
//                         <div className="space-y-1 text-sm">
//                             <div className="flex justify-between">
//                                 <span>With 1 Utility:</span>
//                                 <span>{property.utilityMultiplier?.[0]}× dice roll</span>
//                             </div>
//                             <div className="flex justify-between">
//                                 <span>With 2 Utilities:</span>
//                                 <span>{property.utilityMultiplier?.[1]}× dice roll</span>
//                             </div>
//                             <div className="flex justify-between">
//                                 <span>Mortgage Value:</span>
//                                 <span>${property.mortgageValue}</span>
//                             </div>
//                         </div>
//                     </div>
//                     <div className="bg-blue-50 p-3 rounded text-sm">
//                         <p>Rent is determined by multiplying the dice roll by the multiplier above.</p>
//                     </div>
//                 </div>
//             );
//         } else if (property.type === "tax") {
//             return (
//                 <div className="space-y-2">
//                     <div className="bg-red-50 p-3 rounded">
//                         <h4 className="font-semibold mb-2">Tax Amount: ${property.taxAmount}</h4>
//                         {property.instructions && (
//                             <p className="text-sm">{property.instructions}</p>
//                         )}
//                     </div>
//                 </div>
//             );
//         } else if (property.type === "chance" || property.type === "community-chest") {
//             return (
//                 <div className="space-y-2">
//                     <div className="bg-yellow-50 p-3 rounded">
//                         <p className="text-sm">
//                             Draw a {property.type === "chance" ? "Chance" : "Community Chest"} card when landing on this space.
//                         </p>
//                     </div>
//                 </div>
//             );
//         } else if (property.type === "corner") {
//             const cornerInfo = {
//                 "GO": "Collect $200 when passing or landing on GO.",
//                 "JAIL": "Just visiting or in jail.",
//                 "Free Parking": "Free space - nothing happens.",
//                 "Go To Jail": "Go directly to jail, do not pass GO, do not collect $200."
//             };

//             return (
//                 <div className="space-y-2">
//                     <div className="bg-gray-50 p-3 rounded">
//                         <p className="text-sm">{cornerInfo[property.name as keyof typeof cornerInfo] || "Special corner space."}</p>
//                     </div>
//                 </div>
//             );
//         }

//         return null;
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
//                         {property.name}
//                     </h3>
//                     <p className="text-sm text-gray-600 mb-2">
//                         Type: {property.type.charAt(0).toUpperCase() + property.type.slice(1).replace('-', ' ')}
//                     </p>
//                     {property.colorGroup && (
//                         <p className="text-sm text-gray-600 mb-2">
//                             Color Group: {property.colorGroup.charAt(0).toUpperCase() + property.colorGroup.slice(1)}
//                         </p>
//                     )}
//                 </div>

//                 {renderPropertyDetails()}

//                 <button
//                     onClick={onClose}
//                     className="w-full px-3 py-2 bg-gray-800 text-white hover:bg-gray-900 transition-colors text-sm mt-4"
//                 >
//                     Close
//                 </button>
//             </div>
//         </div>
//     );
// };