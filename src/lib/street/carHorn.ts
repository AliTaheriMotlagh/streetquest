// Each vehicle's own horn (pure; tests/carHorn.test.ts). The recordings are car horns; a scooter's
// is a thin high beep, a Pride's a little tinny, a bus or a lorry's a low blare — so each kind of
// vehicle gets its take (by its key: the same Peykan always sounds the same) and its pitch.
import type { VehicleKey } from "../vehicles";

/** How high (playback rate) each vehicle's horn is: small = higher, big = lower. */
const PITCH: Partial<Record<VehicleKey, number>> = {
  moto: 1.45, courier: 1.5, streetbike: 1.4,
  pride: 1.14, tiba: 1.12, shahin: 1.06, peykan: 0.96, p206: 1.1, p207: 1.08, pars: 1.02, samand: 1.02, l90: 1.04, xantia: 0.98, taxi: 1.08,
  car: 1, sports: 1.05, suv: 0.92, pickup: 0.9, vanet: 0.94,
  khavar: 0.78, minibus: 0.8, bus: 0.66,
};
/** Big vehicles hold a deeper, louder blare. */
const BIG: VehicleKey[] = ["bus", "khavar", "minibus"];

export type Horn = { take: number; rate: number; vol: number };

export function hornFor(key: VehicleKey): Horn {
  let h = 7;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const big = BIG.includes(key);
  return { take: Math.abs(h), rate: PITCH[key] ?? 1, vol: big ? 0.7 : 0.55 };
}
