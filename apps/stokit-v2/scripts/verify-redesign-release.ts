import { execFileSync } from 'node:child_process';
import { assertRedesignReleaseConfig } from './redesignReleaseGuard';

const raw = execFileSync('npx', ['expo', 'config', '--type', 'public', '--json'], {
  encoding: 'utf8',
  env: process.env,
});
const config = JSON.parse(raw);

assertRedesignReleaseConfig(process.env.APP_VARIANT, config);
console.log(JSON.stringify({
  name: config.name,
  bundleId: config.ios?.bundleIdentifier,
  channel: config.updates?.requestHeaders?.['expo-channel-name'],
  runtime: typeof config.runtimeVersion === 'string' ? config.runtimeVersion : config.version,
}));
