import { Module } from "@nestjs/common";

import { ACCESS_TOKEN_VERIFIER } from "./auth.types";
import { InternalAuthGuard } from "./internal-auth.guard";
import { INTERNAL_CALLER_VERIFIER } from "./internal-caller.types";
import { InternalServiceTokenVerifier } from "./internal-service-token.verifier";
import { PrivyAccessTokenVerifier } from "./privy-access-token.verifier";
import { PrivyAuthGuard } from "./privy-auth.guard";

@Module({
  providers: [
    PrivyAuthGuard,
    InternalAuthGuard,
    PrivyAccessTokenVerifier,
    InternalServiceTokenVerifier,
    { provide: ACCESS_TOKEN_VERIFIER, useExisting: PrivyAccessTokenVerifier },
    { provide: INTERNAL_CALLER_VERIFIER, useExisting: InternalServiceTokenVerifier },
  ],
  exports: [PrivyAuthGuard, InternalAuthGuard, ACCESS_TOKEN_VERIFIER, INTERNAL_CALLER_VERIFIER],
})
export class AuthModule {}
