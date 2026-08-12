import { Module } from "@nestjs/common";

import { UserAccessTokenVerifier } from "./access-token.verifier";
import { ACCESS_TOKEN_VERIFIER } from "./auth.types";
import { EmailAuthController } from "./email-auth.controller";
import { EmailAuthService } from "./email-auth.service";
import { InternalAuthGuard } from "./internal-auth.guard";
import { INTERNAL_CALLER_VERIFIER } from "./internal-caller.types";
import { InternalServiceTokenVerifier } from "./internal-service-token.verifier";
import { UserAuthGuard } from "./user-auth.guard";
import { EconomyModule } from "../economy/economy.module";
import { IdentityModule } from "../identity/identity.module";

@Module({
  imports: [IdentityModule, EconomyModule],
  controllers: [EmailAuthController],
  providers: [
    UserAuthGuard,
    InternalAuthGuard,
    UserAccessTokenVerifier,
    EmailAuthService,
    InternalServiceTokenVerifier,
    { provide: ACCESS_TOKEN_VERIFIER, useExisting: UserAccessTokenVerifier },
    { provide: INTERNAL_CALLER_VERIFIER, useExisting: InternalServiceTokenVerifier },
  ],
  exports: [UserAuthGuard, InternalAuthGuard, ACCESS_TOKEN_VERIFIER, INTERNAL_CALLER_VERIFIER],
})
export class AuthModule {}
