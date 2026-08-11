import { useMemo } from "react";
// import { generatePlayerIcon } from "@/lib/utils";
import { PropertyAccount } from "@/types/schema";

export const useSpaceOwner = (onChainProperty?: PropertyAccount | null) => {
  return useMemo(() => {
    const ownerAddress =
      onChainProperty && onChainProperty.owner ? onChainProperty.owner : null;

    // const ownerMeta = ownerAddress ? generatePlayerIcon(ownerAddress) : null;

    return {
      ownerAddress,
      // ownerMeta,
      isOwned: !!ownerAddress,
    };
  }, [onChainProperty]);
};
