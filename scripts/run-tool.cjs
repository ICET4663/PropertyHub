const { existsSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
// Windows 32-bit Node cannot load Expo's Lightning CSS native dependency.
// A local runtime also lets npm started by an older terminal use 64-bit Node.
const candidates = [
  ...(process.arch !== 'ia32' ? [process.execPath] : []),
  path.join(root, '.tools', 'node.exe'),
  ...(process.platform === 'win32' ? [path.join(process.env.ProgramW6432 || 'C:\\Program Files', 'nodejs', 'node.exe')] : []),
];
const runtime = candidates.find((file) => {
  if (!existsSync(file)) return false;
  const check = spawnSync(file, ['-p', "process.arch !== 'ia32' && Number(process.versions.node.split('.')[0]) >= 22"], { encoding: 'utf8' });
  return check.status === 0 && check.stdout.trim() === 'true';
});
if (!runtime) {
  console.error('Expo requires 64-bit Node.js 22 or newer. Install 64-bit Node.js, reopen your terminal, and run npm install --include=optional, then npm start.');
  process.exit(1);
}
const tools = {
  expo: 'expo/bin/cli',
  tsc: 'typescript/bin/tsc',
};
const [tool, ...args] = process.argv.slice(2);
if (!tools[tool]) throw new Error(`Unknown tool: ${tool}`);
const env = { ...process.env, PATH: `${path.dirname(runtime)}${path.delimiter}${process.env.PATH || ''}` };
const result = spawnSync(runtime, [require.resolve(tools[tool]), ...args], { cwd: root, env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
