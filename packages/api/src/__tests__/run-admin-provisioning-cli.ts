import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(here, '../..');

export function runAdminProvisioningCli(
  env: NodeJS.ProcessEnv,
  options: { assertNetworkPolicyBeforeConnect?: boolean } = {},
): Promise<{
  code: number | null;
  stderr: string;
  stdout: string;
}> {
  const childEnv = options.assertNetworkPolicyBeforeConnect
    ? {
        ...env,
        HARPA_ADMIN_CLI_NETWORK_ASSERT: '1',
        NODE_OPTIONS: [
          env.NODE_OPTIONS,
          `--require=${resolve(here, 'assert-admin-cli-network.cjs')}`,
        ]
          .filter(Boolean)
          .join(' '),
      }
    : env;

  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/set-admin-password.ts',
        '--email',
        'operator@harpapro.com',
        '--password-stdin',
      ],
      {
        cwd: apiRoot,
        env: childEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      resolvePromise({ code, stderr, stdout });
    });
    child.stdin.end('a deliberately long administrator password\n');
  });
}
