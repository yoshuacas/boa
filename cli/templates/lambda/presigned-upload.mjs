import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";

// Strip any directory component, replace anything not safe for S3
// keys with '_', and cap length. The download check uses
// key.startsWith(`uploads/${userId}/`), which only holds if the
// filename is a flat basename — so rejecting path traversal here
// is load-bearing, not cosmetic.
function sanitizeFilename(raw) {
  if (typeof raw !== "string") return "";
  const flat = basename(raw);
  const cleaned = flat.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  // Strip leading dots so the key never starts with '.' or '..'.
  return cleaned.replace(/^\.+/, "");
}

const BUCKET_NAME = process.env.BUCKET_NAME;
const REGION_NAME = process.env.REGION_NAME;

const s3 = new S3Client({ region: REGION_NAME });

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
];

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const URL_EXPIRATION_SECONDS = 3600; // 1 hour

// See cors-origin.mjs for rationale and the localhost auto-allow
// rule. Production deploys should set AllowedOrigins explicitly.
import { parseAllowedOrigins, isAllowedOrigin } from "./cors-origin.mjs";

const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

const STATIC_CORS = {
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Vary": "Origin",
};

function corsHeadersFor(origin) {
  if (!isAllowedOrigin(origin, ALLOWED_ORIGINS)) return {};
  return {
    ...STATIC_CORS,
    "Access-Control-Allow-Origin": origin,
  };
}

function respond(statusCode, body, origin) {
  return {
    statusCode,
    headers: {
      ...corsHeadersFor(origin),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  const origin =
    event.headers?.origin || event.headers?.Origin || "";

  if (event.httpMethod === "OPTIONS") {
    return respond(200, { message: "OK" }, origin);
  }

  const method = event.httpMethod;
  const path = event.resource || event.path;
  const userId =
    event.requestContext?.authorizer?.userId || "anonymous";

  try {
    // POST /upload — generate a presigned upload URL
    if (method === "POST" && path === "/upload") {
      const body = JSON.parse(event.body || "{}");
      const { filename, contentType } = body;

      if (!filename || !contentType) {
        return respond(400, {
          error: "Missing required fields: filename, contentType",
        }, origin);
      }

      if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
        return respond(400, {
          error: `Content type not allowed. Supported: ${ALLOWED_CONTENT_TYPES.join(", ")}`,
        }, origin);
      }

      const safeFilename = sanitizeFilename(filename);
      if (!safeFilename) {
        return respond(400, {
          error: "Invalid filename",
        });
      }

      const key = `uploads/${userId}/${randomUUID()}-${safeFilename}`;

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(s3, command, {
        expiresIn: URL_EXPIRATION_SECONDS,
      });

      return respond(200, {
        uploadUrl,
        key,
        expiresIn: URL_EXPIRATION_SECONDS,
        maxSizeBytes: MAX_SIZE_BYTES,
        message: `Upload your file via PUT to the uploadUrl. Max size: ${MAX_SIZE_BYTES / (1024 * 1024)}MB.`,
      }, origin);
    }

    // GET /download?key=... — generate a presigned download URL
    if (method === "GET" && path === "/download") {
      const key = event.queryStringParameters?.key;

      if (!key) {
        return respond(400, { error: "Missing required query parameter: key" }, origin);
      }

      // Ensure users can only download their own files
      if (!key.startsWith(`uploads/${userId}/`)) {
        return respond(403, { error: "Access denied" }, origin);
      }

      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });

      const downloadUrl = await getSignedUrl(s3, command, {
        expiresIn: URL_EXPIRATION_SECONDS,
      });

      return respond(200, {
        downloadUrl,
        expiresIn: URL_EXPIRATION_SECONDS,
      }, origin);
    }

    return respond(404, { error: "Route not found" }, origin);
  } catch (err) {
    console.error("Presigned URL error:", err);
    return respond(500, { error: "Internal server error" }, origin);
  }
}
