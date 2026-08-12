import { useMemo } from "react";
// import { generatePlayerIcon } from "@/lib/utils";
import { PropertyAccount } from "@/types/schema";

export const useSpaceOwner = (propertyState?: PropertyAccount | null) => {
  return useMemo(() => {
    const ownerId =
      propertyState && propertyState.owner ? propertyState.owner : null;

    // const ownerMeta = ownerId ? generatePlayerIcon(ownerId) : null;

    return {
      ownerId,
      // ownerMeta,
      isOwned: !!ownerId,
    };
  }, [propertyState]);
};
