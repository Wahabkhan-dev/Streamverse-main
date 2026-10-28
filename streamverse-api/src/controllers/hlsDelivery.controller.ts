import type { Request, Response } from "express";
import { getHlsPlaylist, getHlsSegmentRedirect } from "../services/media/hlsDelivery.service";

/** Public origin + API prefix used when a playlist points back at this API. */
export const apiBaseOf = (req: Request) => `${req.protocol}://${req.get("host")}/api/v1`;

export async function serve(req: Request, res: Response) {
  const contentId = req.params["contentId"]!;
  const rel = (req.params as Record<string, string>)["0"] ?? "";
  const token = typeof req.query["t"] === "string" ? req.query["t"] : undefined;

  if (rel === "" || /\.m3u8$/i.test(rel)) {
    const body = await getHlsPlaylist(contentId, rel, token, apiBaseOf(req));
    res.status(200).set({ "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "private, no-store" }).send(body);
    return;
  }
  res.redirect(302, await getHlsSegmentRedirect(contentId, rel, token));
}
