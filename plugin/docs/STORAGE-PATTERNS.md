# Storage Patterns

Amazon S3 patterns for the BOA stack. All file access uses presigned URLs. Never make buckets public.

---

## S3 Bucket Configuration

```yaml
StorageBucket:
  Type: AWS::S3::Bucket
  Properties:
    BucketName: !Sub "${ProjectName}-storage-${AWS::AccountId}"
    PublicAccessBlockConfiguration:
      BlockPublicAcls: true
      BlockPublicPolicy: true
      IgnorePublicAcls: true
      RestrictPublicBuckets: true
    CorsConfiguration:
      CorsRules:
        - AllowedHeaders: ['*']
          AllowedMethods: [GET, PUT]
          AllowedOrigins: ['*']
          MaxAge: 3600
```

## Upload Flow (Presigned URL)

### 1. Frontend requests a presigned URL

```javascript
const response = await fetch(`${config.apiUrl}/upload`, {
  method: 'POST',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filename: 'photo.jpg',
    contentType: 'image/jpeg',
  }),
});
const { uploadUrl, fileKey } = await response.json();
```

### 2. Frontend uploads directly to S3

```javascript
await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'image/jpeg' },
  body: file,  // File object from <input type="file">
});
```

### 3. Frontend saves the file key to the database

```javascript
await fetch(`${config.apiUrl}/posts`, {
  method: 'POST',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ content: 'My post', imageKey: fileKey }),
});
```

## Lambda Presigned URL Handler

```javascript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const s3 = new S3Client({ region: process.env.REGION_NAME });
const BUCKET = process.env.BUCKET_NAME;

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'application/json',
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function getUploadUrl(userId, body) {
  const { filename, contentType } = body;

  if (!ALLOWED_TYPES.includes(contentType)) {
    return respond(400, { error: `Content type not allowed: ${contentType}` });
  }

  const fileKey = `uploads/${userId}/${randomUUID()}-${filename}`;

  const url = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: BUCKET,
    Key: fileKey,
    ContentType: contentType,
  }), { expiresIn: 3600 }); // 1 hour

  return respond(200, { uploadUrl: url, fileKey });
}

export async function getDownloadUrl(userId, fileKey) {
  // Verify the file belongs to the user (key starts with uploads/{userId}/)
  if (!fileKey.startsWith(`uploads/${userId}/`)) {
    return respond(403, { error: 'Access denied' });
  }

  const url = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: BUCKET,
    Key: fileKey,
  }), { expiresIn: 3600 });

  return respond(200, { downloadUrl: url });
}
```

## File Organization

```
s3://my-app-storage-123456/
├── uploads/
│   ├── user-id-1/
│   │   ├── abc123-photo.jpg
│   │   └── def456-document.pdf
│   └── user-id-2/
│       └── ghi789-avatar.png
└── exports/                    # For scheduled export jobs
    └── 2026-04-11-report.csv
```

## Download Flow

When displaying a file in the frontend, fetch a download presigned URL:

```javascript
const response = await fetch(`${config.apiUrl}/download?key=${encodeURIComponent(fileKey)}`, {
  headers: { Authorization: token },
});
const { downloadUrl } = await response.json();
// Use downloadUrl as img src or download link
```

## Deleting Files

```javascript
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

async function deleteFile(fileKey) {
  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: fileKey,
  }));
}
```

Always delete the S3 object when deleting the associated database record:

```javascript
// In delete handler
await pool.query('DELETE FROM posts WHERE id = $1 AND user_id = $2', [postId, userId]);
if (post.image_key) {
  await deleteFile(post.image_key);
}
```
