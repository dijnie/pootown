"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { CheckIcon, CopyIcon } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

interface DepositDialogProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
}

export function DepositDialog({ isOpen, onClose, walletAddress }: DepositDialogProps) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [copyToClipboard, isCopied] = useCopyToClipboard();

  useEffect(() => {
    if (isOpen && walletAddress) {
      // Generate QR code for the wallet address
      QRCode.toDataURL(walletAddress, {
        width: 200,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      })
        .then((url) => {
          setQrCodeDataUrl(url);
        })
        .catch((error) => {
          console.error("Failed to generate QR code:", error);
        });
    }
  }, [isOpen, walletAddress]);

  const handleCopyAddress = () => {
    copyToClipboard(walletAddress);
    toast.success("Address copied to clipboard!");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader >
          <DialogTitle className="text-center">Deposit SOL to Game Wallet</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* QR Code - Centered and prominent */}
          <div className="flex flex-col items-center space-y-3">
            <div className="flex justify-center p-2 bg-white rounded-lg">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="Wallet Address QR Code"
                  className="size-52"
                />
              ) : (
                <div className="size-52 flex items-center justify-center text-gray-500">
                  Generating QR Code...
                </div>
              )}
            </div>
            <p className="text-sm text-gray-600 text-center">Your Game Wallet Address</p>
          </div>

          {/* Wallet Address - Below QR code */}
          <div className="space-y-3">
            <div className="p-4 bg-gray-50 rounded-lg border text-sm font-mono break-all text-center">
              {walletAddress}
            </div>
            
            {/* Copy Button - Separate and prominent */}
            <Button
              onClick={handleCopyAddress}
              className="w-full"
              variant="neutral"
            >
              {isCopied ? (
                <>
                  <CheckIcon className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <CopyIcon className="h-4 w-4 mr-2" />
                  Copy Address
                </>
              )}
            </Button>
          </div>

          {/* Instructions */}
          <div className="text-sm text-gray-600 space-y-1 text-center">
            <p>Send SOL to this address to fund your game wallet</p>
            <p>Balance will update automatically</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
