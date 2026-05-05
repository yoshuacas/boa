import { NextRequest, NextResponse } from 'next/server';
import {
  ListObjectsV2Command,
  DeleteObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { loadBoaConfig, getBucketName } from '@/lib/boa-config';
import { getAwsClients } from '@/lib/aws-clients';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, prefix, key, expiresIn, configPath } = body;

    const cfg = await loadBoaConfig(configPath);
    if (!cfg) return NextResponse.json({ error: 'No .boa/config.json found' }, { status: 404 });

    const bucket = getBucketName(cfg);
    if (!bucket) return NextResponse.json({ error: 'No S3 bucket in config' }, { status: 400 });

    const { s3 } = getAwsClients(cfg);

    if (action === 'list') {
      const result = await s3.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || '',
        Delimiter: '/',
      }));
      return NextResponse.json({
        folders: (result.CommonPrefixes || []).map(p => p.Prefix),
        files: (result.Contents || []).map(f => ({
          key: f.Key,
          size: f.Size,
          lastModified: f.LastModified,
          etag: f.ETag,
        })),
        isTruncated: result.IsTruncated,
      });
    }

    if (action === 'presign') {
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: expiresIn ?? 3600 }
      );
      return NextResponse.json({ url });
    }

    if (action === 'delete') {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
