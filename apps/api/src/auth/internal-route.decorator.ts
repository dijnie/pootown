import { SetMetadata } from "@nestjs/common";

export const INTERNAL_ROUTE = "pootown:internal-route";
export const InternalRoute = () => SetMetadata(INTERNAL_ROUTE, true);
