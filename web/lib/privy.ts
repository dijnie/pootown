"use server";

import envConfig from "@/configs/env";
import { generateAuthorizationSignature } from "@privy-io/server-auth/wallet-api";

interface SignTransactionParams {
  transaction: string;
  encoding: "base64";
}

interface SignTransactionRequest {
  method: "signTransaction";
  params: SignTransactionParams;
}

interface SignTransactionResponse {
  method: "signTransaction";
  data: {
    signed_transaction: string;
    encoding: "base64";
  };
}

export async function signTransactionWithPrivy(
  walletId: string,
  transaction: string
): Promise<SignTransactionResponse> {
  const url = `https://api.privy.io/v1/wallets/${walletId}/rpc`;

  const credentials = Buffer.from(
    `${envConfig.NEXT_PUBLIC_PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`
  ).toString("base64");

  const input = {
    version: 1,
    url: url,
    method: "POST",
    headers: {
      "privy-app-id": envConfig.NEXT_PUBLIC_PRIVY_APP_ID,
    },
    body: {
      method: "signTransaction",
      params: {
        transaction,
        encoding: "base64",
      },
    },
  } as const;

  const authorizationSignature = generateAuthorizationSignature({
    input,
    authorizationPrivateKey: process.env.PRIVY_AUTHORIZATION_SIGNATURE!,
  });

  const response = await fetch(input.url, {
    method: input.method,
    // @ts-expect-error
    headers: {
      ...input.headers,
      Authorization: `Basic ${credentials}`,
      "privy-authorization-signature": authorizationSignature,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.body),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json() as Promise<SignTransactionResponse>;
}
