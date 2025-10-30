// "use client";

// import React from "react";

// interface MessageDisplayProps {
//     message?: {
//         text: string;
//         type: 'info' | 'warning' | 'success' | 'error';
//         duration?: number;
//     };
// }

// export const MessageDisplay: React.FC<MessageDisplayProps> = ({ message }) => {
//     if (!message) return null;

//     const getMessageStyles = () => {
//         switch (message.type) {
//             case 'success':
//                 return 'bg-green-500 text-white border-green-600';
//             case 'warning':
//                 return 'bg-orange-500 text-white border-orange-600';
//             case 'error':
//                 return 'bg-red-500 text-white border-red-600';
//             default:
//                 return 'bg-blue-500 text-white border-blue-600';
//         }
//     };

//     const getIcon = () => {
//         switch (message.type) {
//             case 'success':
//                 return '✅';
//             case 'warning':
//                 return '⚠️';
//             case 'error':
//                 return '❌';
//             default:
//                 return 'ℹ️';
//         }
//     };

//     return (
//         <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-bounce">
//             <div className={`px-6 py-3 rounded-lg border-2 shadow-lg ${getMessageStyles()} 
//                             flex items-center gap-3 min-w-72 max-w-md`}>
//                 <span className="text-xl">{getIcon()}</span>
//                 <span className="font-semibold text-lg">{message.text}</span>
//             </div>
//         </div>
//     );
// };
