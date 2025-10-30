"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogoutIcon, WalletIcon } from "@/components/ui/icons";
import { useWallet } from "@/hooks/use-wallet";
import { formatAddress } from "@/lib/utils";
import { useLogin, useLogout } from "@privy-io/react-auth";
import { CheckIcon, CopyIcon, Download } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useExportWallet } from "@privy-io/react-auth/solana";
import { BalanceButton } from "./balance-button";
import { UserAvatar } from "./user-avatar";

function WalletAddressWithCopy({
  address,
  label,
}: {
  address: string;
  label: string;
}) {
  const [copyToClipboard, isCopied] = useCopyToClipboard();

  return (
    <div className="px-2 py-1.5 text-xs text-primary border-b">
      <div className="font-medium text-primary">{label}</div>
      <div className="flex items-center gap-2">
        <div className="font-mono text-xs flex-1">{formatAddress(address)}</div>
        <div
          className="cursor-pointer hover:bg-gray-100 p-1 rounded"
          onClick={() => copyToClipboard(address)}
          title="Copy address"
        >
          {isCopied ? (
            <CheckIcon className="h-3 w-3 text-green-600" />
          ) : (
            <CopyIcon className="h-3 w-3 text-primary" />
          )}
        </div>
      </div>
    </div>
  );
}

export function ConnectWalletButton({
  onCreateGameWallet,
}: {
  onCreateGameWallet: () => void;
}) {
  const { ready, authenticated, user, wallet } = useWallet();

  const { exportWallet } = useExportWallet();

  const { login } = useLogin();
  const { logout } = useLogout();

  const disableLogin = !ready || (ready && authenticated);

  return (
    <div className="flex items-center gap-4">
      {authenticated ? (
        <>
          {wallet && wallet.delegated ? (
            <BalanceButton walletAddress={wallet.address} />
          ) : (
            <Button onClick={onCreateGameWallet}>Create Game Wallet</Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <UserAvatar
                  walletAddress={wallet?.address || user?.wallet?.address || ""}
                  size="xs"
                />
                {wallet
                  ? formatAddress(wallet.address)
                  : user?.wallet?.address
                  ? formatAddress(user?.wallet?.address)
                  : "--"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              sideOffset={12}
              className="w-64"
              align="end"
              side="bottom"
            >
              {/* Connected Wallet Info */}
              {user?.wallet?.address && (
                <WalletAddressWithCopy
                  address={user.wallet.address}
                  label="Connected Wallet"
                />
              )}

              {/* Game Wallet Info */}
              {wallet && (
                <WalletAddressWithCopy
                  address={wallet.address}
                  label="Game Wallet"
                />
              )}

              {/* Actions */}
              {wallet && (
                <DropdownMenuItem
                  onClick={() => exportWallet()}
                  className="mt-2 flex justify-between"
                >
                  <span>Export Wallet</span>
                  <Download />
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => logout()}
                className="flex justify-between"
              >
                <span>Disconnect</span>
                <LogoutIcon />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : (
        <Button size="lg" disabled={disableLogin} onClick={() => login()}>
          <WalletIcon />
          Connect Wallet
        </Button>
      )}
    </div>
  );
}

function UserMenu({
  onDisconnect,
  walletAddress,
}: {
  onDisconnect: () => void;
  walletAddress?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button>
          <Avatar className="rounded-lg">
            <AvatarImage walletAddress={walletAddress} alt="User Avatar" />
            <AvatarFallback walletAddress={walletAddress} />
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" side="bottom">
        <DropdownMenuItem onClick={onDisconnect}>
          <LogoutIcon />
          <DropdownMenuShortcut>Disconnect</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
