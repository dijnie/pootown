export interface InternalCallerPrincipal {
  readonly serviceId: string;
  readonly jwtId: string;
}

export interface InternalCallerVerifier {
  verify(token: string): Promise<InternalCallerPrincipal>;
}

export const INTERNAL_CALLER_VERIFIER = Symbol("INTERNAL_CALLER_VERIFIER");
