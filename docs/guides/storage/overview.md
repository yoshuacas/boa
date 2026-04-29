# File Storage

Upload and download files through presigned URLs. Files live in a private S3 bucket -- never public, always authenticated, time-limited access.

## The lifecycle

Every file operation follows the same pattern: your frontend asks the backend for a presigned URL, then talks directly to S3 using that URL. Files are tracked in your database by key.

```
1. Frontend requests presigned URL from BOA
2. BOA Lambda generates signed URL (valid 1 hour)
3. Frontend uploads/downloads directly to S3
4. File key is stored in your database for later retrieval
```

## Upload a file

### 1. Request a presigned upload URL

```javascript
const { data, error } = await supabase.functions.invoke('upload', {
  body: { filename: 'photo.jpg', contentType: 'image/jpeg' }
})
const { uploadUrl, fileKey } = data
```

### 2. Validate file size on the client

Check before uploading to avoid wasting bandwidth:

```javascript
const MAX_SIZE = 10 * 1024 * 1024  // 10 MB

function handleFileSelect(event) {
  const file = event.target.files[0]
  if (file.size > MAX_SIZE) {
    alert('File must be under 10 MB')
    return
  }
  uploadFile(file)
}
```

### 3. Upload directly to S3

```javascript
await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': file.type },
  body: file  // File object from <input type="file">
})
```

### 4. Save the file key to the database

```javascript
await supabase.from('posts').insert({
  content: 'My post',
  image_key: fileKey,
  user_id: user.id
})
```

The file key (e.g., `uploads/user-id/abc123-photo.jpg`) is what you store. Never store the presigned URL -- it expires.

## Download and display a file

```javascript
// Get a presigned download URL
const { data } = await supabase.functions.invoke('download', {
  body: { fileKey: post.image_key }
})

// Display the image
const img = document.createElement('img')
img.src = data.downloadUrl
document.getElementById('post-image').appendChild(img)
```

For React:

```jsx
const [imageUrl, setImageUrl] = useState(null)

useEffect(() => {
  async function loadImage() {
    const { data } = await supabase.functions.invoke('download', {
      body: { fileKey: post.image_key }
    })
    setImageUrl(data.downloadUrl)
  }
  loadImage()
}, [post.image_key])

return imageUrl ? <img src={imageUrl} alt={post.title} /> : null
```

Download URLs expire after 1 hour. For frequently accessed images, consider caching the URL in your app state and refreshing it before expiry.

## Delete a file

Always delete the S3 object when deleting the associated database record:

```javascript
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

// In your delete handler
const post = await getPost(postId, userId);
await db.query('DELETE FROM posts WHERE id = $1 AND user_id = $2', [postId, userId]);
if (post.image_key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: post.image_key }));
}
```

If you delete the database record but not the S3 object, the file becomes an orphan. It still costs storage but is unreachable.

## File organization

Files are organized by user ID to enforce ownership:

```
s3://my-app-storage-123456/
├── uploads/
│   ├── user-id-1/
│   │   ├── abc123-photo.jpg
│   │   └── def456-document.pdf
│   └── user-id-2/
│       └── ghi789-avatar.png
└── exports/
    └── 2026-04-11-report.csv
```

The presigned URL handler scopes uploads to the authenticated user's directory automatically. A user cannot overwrite another user's files.

## The presigned URL handler

BOA's Lambda function that generates presigned URLs:

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

export async function getUploadUrl(userId, body) {
  const { filename, contentType } = body;

  if (!ALLOWED_TYPES.includes(contentType)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Content type not allowed' }) };
  }

  const fileKey = `uploads/${userId}/${randomUUID()}-${filename}`;

  const url = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: BUCKET,
    Key: fileKey,
    ContentType: contentType,
  }), { expiresIn: 3600 });

  return { statusCode: 200, body: JSON.stringify({ uploadUrl: url, fileKey }) };
}
```

To allow additional content types, add them to the `ALLOWED_TYPES` array. If a user uploads a type not in the list, they get a 400 error.

## Bucket configuration

BOA creates the S3 bucket with all public access blocked:

```yaml
StorageBucket:
  Type: AWS::S3::Bucket
  Properties:
    PublicAccessBlockConfiguration:
      BlockPublicAcls: true
      BlockPublicPolicy: true
      IgnorePublicAcls: true
      RestrictPublicBuckets: true
    CorsConfiguration: !If
      - HasAllowedOrigins
      - CorsRules:
          - AllowedHeaders: ['*']
            AllowedMethods: [GET, PUT]
            AllowedOrigins: !Ref AllowedOrigins
            MaxAge: 3600
      - !Ref AWS::NoValue
```

CORS is opt-in via the `AllowedOrigins` CloudFormation parameter. Default (empty list) omits the rules entirely, so same-origin works and every cross-origin PUT/GET is blocked at the browser. To allow uploads from your web app, add the origin to `.boa/config.json` under `allowedOrigins` and redeploy:

```json
{
  "allowedOrigins": ["https://app.example.com", "https://staging.example.com"]
}
```

**Never set `AllowedOrigins` to `'*'`.** And never remove `PublicAccessBlockConfiguration`. If the bucket becomes public, any file is accessible to anyone with the URL. Presigned URLs are the only safe access pattern.

**Filenames are sanitized.** The presigned upload handler strips path components (`basename`), replaces anything outside `[a-zA-Z0-9._-]` with underscore, caps length at 200 chars, and rejects empty results with 400. The resulting S3 key is always `uploads/<userId>/<uuid>-<safeFilename>`, which keeps the `key.startsWith("uploads/<userId>/")` download guard sound.

## Limits

| Limit | Default | Notes |
|-------|---------|-------|
| Presigned URL expiry | 1 hour | Configurable in `expiresIn` |
| Max file size | 10 MB | Enforced in the handler, configurable |
| S3 free tier | 5 GB storage, 20K GET + 2K PUT/month | Standard AWS free tier |

## Troubleshooting

**CORS error on upload?** The bucket's CORS configuration must allow PUT from your frontend's origin. The default allows `*`, but if you've restricted it, add your domain.

**403 on presigned URL?** The URL has expired (default: 1 hour), or the content type in the PUT request doesn't match the content type in the presigned URL.

**File uploaded but can't download?** Make sure you stored the `fileKey`, not the `uploadUrl`. The upload URL expires. Use the file key to request a new download URL.

## Next step

[Custom Functions](/docs/functions/overview) -- write business logic, integrations, and scheduled jobs.
