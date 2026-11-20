#!/usr/bin/env node
import { run } from './cli/run.js';

process.exitCode = run(process.argv.slice(2), {
  stdout: (t) => process.stdout.write(t),
  stderr: (t) => process.stderr.write(t),
});
