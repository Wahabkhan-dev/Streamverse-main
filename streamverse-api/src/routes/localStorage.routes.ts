import express, { Router } from "express";
import { getStorageProvider } from "../services/storage";
import type { StorageProvider } from "../services/storage/storage.provider";

type DevStorage = StorageProvider & { _verifyToken: (payload: string, signature: string) => boolean; _writePart: (id: string, part: number, body: Buffer) => void };

/**
 * Section 85: dev-only static serving for the local filesystem storage adapter. `createApp()` mounts
 * this ONLY when `STORAGE_PROVIDER=local` and `NODE_ENV !== "production"` (Section 84) — in any real
 * deployment, uploads/downloads go straight to S3-compatible storage and this router doesn't exist.
 */
export const localStorageRouter = Router();

localStorageRouter.put("/:key", express.raw({ type: "*/*", limit: "5gb" }), async (req, res) => {
  const key = decodeURIComponent(req.params["key"]!);
  const { expires, token } = req.query as { expires?: string; token?: string };
  const storage = getStorageProvider() as DevStorage;
  if (!expires || !token || Date.now() > Number(expires) || !storage._verifyToken(`PUT:${key}:${expires}`, token)) {
    res.status(403).json({ success: false, message: "Upload link expired or invalid" });
    return;
  }
  await storage.putObject(key, req.body as Buffer, req.get("content-type") ?? "application/octet-stream");
  res.status(200).end();
});

localStorageRouter.get("/multipart/:uploadId/:partNumber", express.raw({ type: "*/*", limit: "5gb" }), async (req, res) => {
  res.status(405).json({ success: false, message: "Use PUT to upload a part" });
});

localStorageRouter.put("/multipart/:uploadId/:partNumber", express.raw({ type: "*/*", limit: "5gb" }), async (req, res) => {
  const { uploadId, partNumber } = req.params as { uploadId: string; partNumber: string };
  const { key, expires, token } = req.query as { key?: string; expires?: string; token?: string };
  const storage = getStorageProvider() as DevStorage;
  if (!key || !expires || !token || Date.now() > Number(expires) || !storage._verifyToken(`PART:${key}:${uploadId}:${partNumber}:${expires}`, token)) {
    res.status(403).json({ success: false, message: "Upload link expired or invalid" });
    return;
  }
  storage._writePart(uploadId, Number(partNumber), req.body as Buffer);
  res.status(200).json({ etag: `dev-${uploadId}-${partNumber}` });
});

localStorageRouter.get("/:key", async (req, res) => {
  const key = decodeURIComponent(req.params["key"]!);
  const { expires, token, public: isPublic } = req.query as { expires?: string; token?: string; public?: string };
  const storage = getStorageProvider() as DevStorage;
  if (!isPublic) {
    if (!expires || !token || Date.now() > Number(expires) || !storage._verifyToken(`GET:${key}:${expires}`, token)) {
      res.status(403).json({ success: false, message: "Download link expired or invalid" });
      return;
    }
  }
  const head = await storage.headObject(key);
  if (!head.exists) {
    res.status(404).json({ success: false, message: "Not found" });
    return;
  }
  const bytes = await storage.getObjectRange(key, 0, (head.sizeBytes ?? 1) - 1);
  res.status(200).send(bytes);
});
