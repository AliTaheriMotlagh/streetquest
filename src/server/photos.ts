// Photo uploads arrive as data URLs from the client (resized on the device first,
// see components/game/photo.ts). Check the bytes really are an image, not just the label.
import { t } from "../lib/i18n";
import { HttpError } from "./http";

export const MAX_PHOTO_BYTES = 400 * 1024;
/** Longest data URL a ≤ MAX_PHOTO_BYTES photo can produce (base64 + header). */
export const MAX_PHOTO_DATA_URL = Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 64;

/** Decode a data URL and check the bytes really are a JPEG/WebP/PNG (not just the label). */
export function decodePhoto(dataUrl: string) {
  const m = /^data:(image\/(jpeg|webp|png));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new HttpError(400, t("Photos must be JPEG, WebP or PNG"));
  const buf = Buffer.from(m[3], "base64");
  if (buf.length > MAX_PHOTO_BYTES) throw new HttpError(413, t("Photo is too large"));
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const webp = buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  if (!jpeg && !png && !webp) throw new HttpError(400, t("That file isn't an image"));
  return { bytes: buf, type: m[1] };
}
