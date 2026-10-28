// Buy the next money level from the wallet (bigger money on the map). See server/money.ts.
import { requireUser } from "@/server/auth";
import { actionRoute } from "@/server/http";
import { buyMoneyTier } from "@/server/money";

export const POST = actionRoute(async () => buyMoneyTier(await requireUser()));
