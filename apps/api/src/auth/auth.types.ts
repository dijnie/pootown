export interface AuthenticatedPrincipal {
  readonly privyDid: string;
  readonly privySessionId: string;
}

export interface AccessTokenVerifier {
  verify(token: string): Promise<AuthenticatedPrincipal>;
}

export const ACCESS_TOKEN_VERIFIER = Symbol("ACCESS_TOKEN_VERIFIER");
