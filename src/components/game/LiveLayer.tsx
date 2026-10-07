"use client";
// Everything that moves on the map, animated locally from deterministic data:
// marching squads, raider waves (creeps, tower tracers, airstrikes) and squadmates
// during a squad run. Has its own ticker so the rest of the map doesn't re-render.
import { useEffect, useState } from "react";
import { Circle, Marker, Polyline } from "react-leaflet";
import {
  creepPos,
  CREEPS,
  GUARD_RANGE_M,
  squadPos,
  STRIKE_RADIUS_M,
  type Strike,
} from "@/lib/td";
import type { LobbyView, Me, Selected, World } from "./client";
import { useLiveWaves } from "./waves";
import { SUPERWEAPONS } from "@/lib/superweapons";
import { esc, icon } from "./mapIcons";

const squadColor = (s: { mine: boolean; friend: boolean }) => (s.mine ? "#22e3ff" : s.friend ? "#3dff8f" : "#ff4d4d");

export function LiveLayer({ world, me, runners, onSelect }: { world: World | null; me: Me | null; runners?: LobbyView["players"]; onSelect: (s: Selected) => void }) {
  const [now, setNow] = useState(Date.now());
  const live = useLiveWaves(world);
  // Tick fast only while something is actually fighting; marching squads are fine at 1 Hz.
  const fighting =
    !!world &&
    (live.some(({ w }) => now >= w.startAt - 5000 && now <= w.endAt + 3000) ||
      world.strikes.some((x) => !x.resolved || now - x.impactAt < 5000) ||
      world.flags.some((f) => f.capture && f.capture.endsAt > now - 2000));
  const moving = !!world && (world.squads.some((s) => s.status === "MARCH" && s.arriveAt > now) || !!runners?.length || live.some(({ w }) => now < w.startAt && w.startAt - now < 600_000));
  const every = fighting ? 250 : moving ? 1000 : 0;
  useEffect(() => {
    if (!every) return;
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  if (!world) return null;

  return (
    <>
      {/* ---------- squads */}
      {world.squads.map((s) => {
        const p = s.status === "HOLD" ? { lat: s.toLat, lng: s.toLng } : squadPos(s, now);
        const color = squadColor(s);
        const marching = s.status === "MARCH" && now < s.arriveAt;
        const tag = s.order === "attack" ? "⚔️" : s.order === "return" ? "↩️" : marching ? "➜" : "🛡️";
        return (
          <span key={`sq${s.id}`}>
            {marching && (
              <Polyline positions={[[p.lat, p.lng], [s.toLat, s.toLng]]} pathOptions={{ color, weight: 2, opacity: 0.7, dashArray: s.order === "attack" ? "6 6" : "2 8" }} />
            )}
            {!marching && s.order === "guard" && <Circle center={[p.lat, p.lng]} radius={GUARD_RANGE_M} pathOptions={{ color, weight: 1, opacity: 0.4, fillOpacity: s.mine || s.friend ? 0.03 : 0.07 }} />}
            <Marker
              position={[p.lat, p.lng]}
              zIndexOffset={700}
              icon={icon(`<span class="ring" style="color:${color}"></span>${s.icon}<span class="cnt" style="background:${color}">${s.size}</span><span class="ord">${tag}</span>`, `squad ${marching ? "moving" : ""}`, 36)}
              eventHandlers={{ click: () => onSelect({ type: "squad", data: s }) }}
            />
          </span>
        );
      })}

      {/* ---------- raider waves */}
      {live.map(({ w, def, out, defenders }) => {
        const upcoming = now < w.startAt && w.startAt - now < 600_000;
        const running = now >= w.startAt && now <= w.endAt + 2000 && !w.resolved;
        if (!upcoming && !running) return null;
        const sec = Math.floor((now - w.startAt) / 1000) * 1000 + w.startAt;
        return (
          <span key={`wv${w.id}`}>
            <Polyline positions={[[def.from.lat, def.from.lng], [w.baseLat, w.baseLng]]} pathOptions={{ color: "#ff4d4d", weight: 3, opacity: running ? 0.35 : 0.6, dashArray: "2 10" }} />
            <Marker position={[def.from.lat, def.from.lng]} zIndexOffset={650} icon={icon(`🏴‍☠️${upcoming ? `<span class="nm">${Math.ceil((w.startAt - now) / 1000)}s</span>` : ""}`, "raidcamp", 36)} />
            {running &&
              def.creeps.map((c, i) => {
                const dead = out.deathAt[i] != null && out.deathAt[i]! <= now;
                const at = creepPos(def, c, now);
                if (!at || at.f >= 1 || dead) {
                  // Fresh kills leave a puff of smoke for a moment.
                  if (dead && now - out.deathAt[i]! < 1200 && at) return <Marker key={`cd${w.id}${i}`} position={[at.pos.lat, at.pos.lng]} icon={icon("💥", "creep dead", 26)} interactive={false} />;
                  return null;
                }
                return <Marker key={`cr${w.id}${i}`} position={[at.pos.lat, at.pos.lng]} zIndexOffset={800} icon={icon(CREEPS[c.kind].emoji, `creep ${c.kind}`, 26)} interactive={false} />;
              })}
            {running &&
              out.shots
                .filter((s) => s.t === sec)
                .map((s) => {
                  const d = defenders[s.d];
                  const at = d && creepPos(def, def.creeps[s.c], now);
                  if (!d || !at || at.f >= 1) return null;
                  return <Polyline key={`sh${w.id}${s.d}`} positions={[[d.lat, d.lng], [at.pos.lat, at.pos.lng]]} pathOptions={{ color: "#ffd23f", weight: 2, opacity: 0.85 }} interactive={false} />;
                })}
            {((w.strikes as Strike[]) ?? [])
              .filter((s) => now >= s.t && now - s.t < 2500)
              .map((s, i) => (
                <span key={`st${w.id}${i}`}>
                  <Circle center={[s.lat, s.lng]} radius={STRIKE_RADIUS_M} pathOptions={{ color: "#ff8a00", weight: 2, fillOpacity: 0.35 }} interactive={false} />
                  <Marker position={[s.lat, s.lng]} icon={icon(`✈️<span class="nm">${esc(s.name ?? "")}</span>`, "strike", 36)} interactive={false} />
                </span>
              ))}
          </span>
        );
      })}

      {/* ---------- superweapons: countdown over the target, then the blast */}
      {world.strikes.map((x) => {
        const def = SUPERWEAPONS[x.kind];
        const left = Math.ceil((x.impactAt - now) / 1000);
        if (left > 0)
          return (
            <Marker
              key={`swc${x.id}`}
              position={[x.lat, x.lng]}
              zIndexOffset={2000}
              icon={icon(`${def.emoji}<span class="sw-count">${left}</span><span class="nm">${esc(x.owner)}</span>`, `sw-target ${x.kind}`, 64)}
              interactive={false}
            />
          );
        if (now - x.impactAt < 4500) return <Marker key={`swb${x.id}`} position={[x.lat, x.lng]} zIndexOffset={2000} icon={icon(x.kind === "particle" ? "🔆" : "💥", `sw-blast ${x.kind}`, 140)} interactive={false} />;
        if (x.hazardUntil && x.hazardUntil > now) return <Marker key={`swh${x.id}`} position={[x.lat, x.lng]} zIndexOffset={300} icon={icon("☣️", "sw-hazard", 40)} interactive={false} />;
        return null;
      })}

      {/* ---------- flags being captured: live timer */}
      {world.flags
        .filter((f) => f.capture && f.capture.endsAt > now)
        .map((f) => (
          <Marker key={`flc${f.id}`} position={[f.lat, f.lng]} zIndexOffset={1500} icon={icon(`<span class="cap-timer">${Math.ceil((f.capture!.endsAt - now) / 1000)}</span>`, "flag-timer", 30)} interactive={false} />
        ))}

      {/* ---------- squadmates on a squad run (exact positions) */}
      {runners
        ?.filter((r) => r.userId !== me?.id && r.lat != null && r.lng != null)
        .map((r) => (
          <Marker
            key={`rn${r.userId}`}
            position={[r.lat!, r.lng!]}
            zIndexOffset={950}
            icon={icon(`${esc(r.avatar)}<span class="nm">${esc(r.name)}${r.run === "DONE" ? ` · ${r.place ? `#${r.place}` : "✓"}` : " 🏃"}</span>`, "player runner", 34)}
          />
        ))}
    </>
  );
}
