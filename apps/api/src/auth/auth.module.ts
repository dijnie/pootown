import { Module } from "@nestjs/common";

import { ACCESS_TOKEN_VERIFIER } from "./auth.types";
import { PrivyAccessTokenVerifier } from "./privy-access-token.verifier";
import { PrivyAuthGuard } from "./privy-auth.guard";

@Module({
  providers: [
    PrivyAuthGuard,
    PrivyAccessTokenVerifier,
    { provide: ACCESS_TOKEN_VERIFIER, useExisting: PrivyAccessTokenVerifier },
  ],
  exports: [PrivyAuthGuard, ACCESS_TOKEN_VERIFIER],
})
export class AuthModule {}
