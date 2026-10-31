// The street cars made from real 3D models — written by scripts/cars.ts (npm run assets:cars);
// don't edit by hand. Each file's address carries a hash of its bytes (cache it forever).
// Every model is CC BY 4.0: their credits are on /credits (linked from drive mode).
import type { FleetKey } from "./fleet";

export type CarModel = {
  key: FleetKey;
  /** Under /public: <key>.<hash>.glb. */
  file: string;
  bytes: number;
  /** Triangles near and far (wheels counted four times). */
  tris: [number, number];
  credit: { title: string; author: string; url: string; license: string };
};

export const CAR_MODELS: Partial<Record<FleetKey, CarModel>> = {
  "pars": {"key":"pars","file":"/models/cars/pars.22c81efc33.glb","bytes":193920,"tris":[15941,3769],"credit":{"title":"1994 Peugeot 405 GLX (facelift version)","author":"Mehrdad995","url":"https://sketchfab.com/3d-models/1994-peugeot-405-glx-facelift-version-b9b69099434c45bdb3265417dd720752","license":"CC-BY-4.0"}},
  "samand": {"key":"samand","file":"/models/cars/samand.38b1e841c0.glb","bytes":258924,"tris":[23213,7436],"credit":{"title":"IKCO SAMAND X7 (FREE IRANIAN CAR)","author":"Mpgs.studio3DModels","url":"https://sketchfab.com/3d-models/ikco-samand-x7-free-iranian-car-ab580f4bc3c9404d8634bed918d40831","license":"CC-BY-4.0"}},
  "vanet": {"key":"vanet","file":"/models/cars/vanet.c05cc40741.glb","bytes":126076,"tris":[8106,3441],"credit":{"title":"iranian Zamyad","author":"ytayta12","url":"https://sketchfab.com/3d-models/iranian-zamyad-ff757f94da2744d1ab31c1e7e104197f","license":"CC-BY-4.0"}},
  "suv": {"key":"suv","file":"/models/cars/suv.2774a04d3c.glb","bytes":196280,"tris":[17591,3476],"credit":{"title":"Citroen C5 Aircross","author":"Nieve5677","url":"https://sketchfab.com/3d-models/citroen-c5-aircross-c75f13a5d7b144f392c83c20d88d4738","license":"CC-BY-4.0"}},
  "xantia": {"key":"xantia","file":"/models/cars/xantia.0dd0c228b5.glb","bytes":177244,"tris":[17592,4138],"credit":{"title":"Citroen Xantia - سیتروئن زانتیا","author":"Reza","url":"https://sketchfab.com/3d-models/citroen-xantia-f446dacbcfbc48c6870e0f2339987f0f","license":"CC-BY-4.0"}},
  "l90": {"key":"l90","file":"/models/cars/l90.a428edc43f.glb","bytes":214512,"tris":[17669,5597],"credit":{"title":"2009 Dacia Logan","author":"Dave Love SketchFab","url":"https://sketchfab.com/3d-models/2009-dacia-logan-bd250be9928342a9b6f632d80da1fdc3","license":"CC-BY-4.0"}},
  "shahin": {"key":"shahin","file":"/models/cars/shahin.75f9793a61.glb","bytes":193360,"tris":[17592,3944],"credit":{"title":"Saipa 232","author":"akyolefe319","url":"https://sketchfab.com/3d-models/saipa-232-f205582239a64730848fffb4a09881cc","license":"CC-BY-4.0"}}
};
