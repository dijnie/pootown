"use client";

import { TradeView } from "./trade-view";
import { BankruptcyButton } from "./bankruptcy-button";
// import envConfig from "@/configs/env";
// import { DebugUI } from "./debug-ui";
import { OwnedProperties } from "./owned-properties";
import { BonusItems } from "./bonus-items";

export function RightPanel() {
  return (
    <div className="p-4 pl-2 lg:pl-4 space-y-4 md:space-y-6 h-full overflow-auto">
      <TradeView />
      <BankruptcyButton />
      <OwnedProperties />
      <BonusItems />

      {/* {envConfig.IS_DEVELOPMENT && <DebugUI />} */}
    </div>
  );
}
