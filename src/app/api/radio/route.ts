// The car radio's stations with today's stream addresses (server/radio.ts). Public: the same for everyone.
import { radioStations } from "@/server/radio";
import { route } from "@/server/http";

export const GET = route(async () => ({ stations: await radioStations() }));
