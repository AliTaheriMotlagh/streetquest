// Every icon in the art kit, by key.
import type { Shape } from "../kit";
import { combat } from "./combat";
import { economy } from "./economy";
import { empire } from "./empire";
import { living } from "./living";
import { objects } from "./objects";
import { world } from "./world";

export const ICONS: Record<string, Shape[]> = { ...economy, ...combat, ...world, ...objects, ...living, ...empire };
