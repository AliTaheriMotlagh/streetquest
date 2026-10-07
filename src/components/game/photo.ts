"use client";
// Shrink a camera photo on the device before upload: ≤1024 px, JPEG, under ~380 KB.
// Phones produce 3–12 MB images; uploading those would be slow and costly.
export async function resizePhoto(file: File, maxSide = 1024, maxBytes = 380 * 1024): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Pick an image");
  const bitmap = await createImageBitmap(file).catch(() => null);
  const img: CanvasImageSource & { width: number; height: number } =
    bitmap ??
    (await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Couldn't read that image"));
      i.src = URL.createObjectURL(file);
    }));
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  bitmap?.close();
  for (const q of [0.8, 0.65, 0.5, 0.38]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if ((url.length * 3) / 4 <= maxBytes) return url;
  }
  throw new Error("That photo is too detailed — try another one");
}
