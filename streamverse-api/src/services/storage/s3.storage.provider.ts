import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../../config/env";
import type { HeadResult, MultipartPart, PresignedUpload, StorageProvider } from "./storage.provider";

/**
 * Section 2/3: works against AWS S3, Cloudflare R2, Backblaze B2 and DigitalOcean Spaces unchanged — all
 * four speak the S3 API. `AWS_ENDPOINT` + `AWS_FORCE_PATH_STYLE` are what differ between them; everything
 * else in this file is provider-agnostic.
 */
export function createS3StorageProvider(): StorageProvider {
  const client = new S3Client({
    region: env.AWS_REGION ?? "auto",
    endpoint: env.AWS_ENDPOINT,
    forcePathStyle: env.AWS_FORCE_PATH_STYLE ?? !!env.AWS_ENDPOINT,
    credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID!, secretAccessKey: env.AWS_SECRET_ACCESS_KEY! },
  });
  const bucket = env.AWS_BUCKET!;

  return {
    async createUploadUrl(key, contentType, ttlSeconds): Promise<PresignedUpload> {
      const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
      const url = await getSignedUrl(client, command, { expiresIn: ttlSeconds });
      return { url, method: "PUT", headers: { "Content-Type": contentType }, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
    },

    async createDownloadUrl(key, ttlSeconds, responseContentType) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentType: responseContentType });
      return getSignedUrl(client, command, { expiresIn: ttlSeconds });
    },

    async headObject(key): Promise<HeadResult> {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { exists: true, sizeBytes: res.ContentLength, contentType: res.ContentType, etag: res.ETag };
      } catch (err) {
        if (isNotFound(err)) return { exists: false };
        throw err;
      }
    },

    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async objectExists(key) {
      return (await this.headObject(key)).exists;
    },

    async copyObject(sourceKey, destKey) {
      await client.send(new CopyObjectCommand({ Bucket: bucket, Key: destKey, CopySource: `${bucket}/${sourceKey}` }));
    },

    async getObjectRange(key, start, end) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=${start}-${end}` }));
      const chunks: Buffer[] = [];
      for await (const chunk of res.Body as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    },

    async putObject(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    },

    getPublicUrl(key) {
      if (env.MEDIA_BASE_URL) return `${env.MEDIA_BASE_URL.replace(/\/$/, "")}/${key}`;
      return env.AWS_ENDPOINT ? `${env.AWS_ENDPOINT.replace(/\/$/, "")}/${bucket}/${key}` : `https://${bucket}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
    },

    async initiateMultipartUpload(key, contentType) {
      const res = await client.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType }));
      return { providerUploadId: res.UploadId! };
    },

    async signMultipartPart(key, providerUploadId, partNumber, ttlSeconds) {
      const command = new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: providerUploadId, PartNumber: partNumber });
      return getSignedUrl(client, command, { expiresIn: ttlSeconds });
    },

    async completeMultipartUpload(key, providerUploadId, parts: MultipartPart[]) {
      const res = await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: providerUploadId,
          MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
        }),
      );
      return { etag: res.ETag };
    },

    async abortMultipartUpload(key, providerUploadId) {
      await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: providerUploadId }));
    },
  };
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404;
}
