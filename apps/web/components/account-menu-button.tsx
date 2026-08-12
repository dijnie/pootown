"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogoutIcon } from "@/components/ui/icons";
import { UserAvatar } from "@/components/user-avatar";
import { useAccountCoins } from "@/hooks/use-account-coins";
import { useAuth } from "@/components/providers/auth-provider";
import { formatAddress } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

export function AccountMenuButton() {
  const { authenticated, logout, openLogin, ready, user: authUser } = useAuth();
  const { balance, error, loading, refresh, user } = useAccountCoins();

  if (!authenticated) {
    return <Button size="lg" disabled={!ready} onClick={openLogin}>Sign in</Button>;
  }

  const userId = user?.userId ?? "account";
  return (
    <div className="flex items-center gap-3">
      <Button variant="neutral" disabled className="max-w-64 min-w-0">
        <span className="truncate">
          {loading ? "Loading account coin..." : error ? "Account coin unavailable" : `${balance?.availableCoin ?? "0"} Account Coin`}
        </span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="Open account menu">
            <UserAvatar walletAddress={userId} size="xs" />
            {formatAddress(userId)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent sideOffset={12} className="w-72" align="end" side="bottom">
          <div className="border-b px-2 py-2 text-xs">
            <p className="font-medium">Account identity</p>
            <p className="break-all">{authUser?.email}</p>
            <p className="break-all font-mono">{userId}</p>
          </div>
          <div className="border-b px-2 py-2 text-xs">
            <p>Available: <span className="break-all font-semibold">{balance?.availableCoin ?? "0"} Account Coin</span></p>
            <p>Reserved in sessions: <span className="break-all font-semibold">{balance?.reservedCoin ?? "0"} Account Coin</span></p>
            <p className="mt-1 text-muted-foreground">Account Coin is in-app and cannot be withdrawn.</p>
          </div>
          <DropdownMenuItem onClick={() => void refresh()} disabled={loading}>
            <RefreshCw /> Refresh balance
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void logout()}>
            <LogoutIcon /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
