/** Largest photo accepted before it is shrunk. */
export const MAX_AVATAR_FILE = 8_000_000;
/** The saved picture is a small square, so it costs a few kilobytes however big the original was. */
const SIZE = 192;

export const isAvatarFile = (f: Pick<File, "name" | "type">) => /^image\/(jpeg|png|webp)$/.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name);

/** Why a file can't be used, in words for the customer; null when it can. */
export function avatarFileProblem(f: Pick<File, "name" | "type" | "size">): string | null {
  if (!isAvatarFile(f)) return "Use a JPG, PNG or WebP photo.";
  if (f.size > MAX_AVATAR_FILE) return "That photo is over 8 MB. Choose a smaller one.";
  return null;
}

const load = (url: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("decode"));
    img.src = url;
  });

/** Crops the middle square of the photo and shrinks it to a small JPEG data URL, ready to keep in the browser. */
export async function photoToAvatar(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await load(url);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error("empty");
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
