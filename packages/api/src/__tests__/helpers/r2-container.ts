/**
 * MinIO Testcontainers helper. Boots a hermetic S3-compatible object
 * store so the `R2Storage` default-wiring (Pitfall 13 layer 2) is
 * actually exercised against the real signed-PUT protocol — not the
 * `FixtureStorage` short-circuit every other test uses.
 *
 * Returns the connection details the integration test needs to:
 *   1. Reload `env.ts` against MinIO (R2_FIXTURE_MODE=live + creds).
 *   2. Pre-create the target bucket so signed PUTs succeed.
 */
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';

export interface MinioFixture {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** S3 client pre-wired for direct assertions (HEAD object, etc.). */
  client: S3Client;
  stop: () => Promise<void>;
}

const ACCESS_KEY = 'minio_test_ak';
const SECRET_KEY = 'minio_test_sk_long_enough_for_aws_sdk';

export async function startMinio(bucket = 'harpa-test'): Promise<MinioFixture> {
  const container: StartedTestContainer = await new GenericContainer(
    'minio/minio:latest',
  )
    .withCommand(['server', '/data'])
    .withEnvironment({
      MINIO_ROOT_USER: ACCESS_KEY,
      MINIO_ROOT_PASSWORD: SECRET_KEY,
    })
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forLogMessage(/API: http/i))
    .withStartupTimeout(60_000)
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(9000);
  const endpoint = `http://${host}:${port}`;

  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    forcePathStyle: true,
  });

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }

  return {
    endpoint,
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    bucket,
    client,
    stop: async () => {
      client.destroy();
      await container.stop();
    },
  };
}
