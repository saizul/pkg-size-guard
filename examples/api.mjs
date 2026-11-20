// Using pkg-size-guard as a library: measure, compare and render yourself.
// Run from the repository root after `npm run build`:
//   node examples/api.mjs
import { fileURLToPath } from 'node:url';
import { compare, loadConfig, measureProject, renderMarkdown } from '../dist/esm/index.js';

const project = fileURLToPath(new URL('../test/fixtures/basic', import.meta.url));
const config = loadConfig(`${project}/size-guard.json`);

const current = measureProject(config, project);
const result = compare(config, current);

for (const row of result.rows) {
  console.log(`${row.status.padEnd(4)} ${row.name} (${row.metric}): ${row.size} bytes`);
}
console.log();
console.log(renderMarkdown(result));
process.exitCode = result.failures ? 1 : 0;
