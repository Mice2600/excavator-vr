// Publishes dist/ to the gh-pages branch of this repository's "origin" (GitHub Pages serves that branch).
//
//   npm run deploy        (builds first)
//
// The site's files are committed as one fresh commit each time, so the branch stays small.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
const root = process.cwd();
const dist = path.join(root, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/ is missing: run "npm run build" first');
  process.exit(1);
}
const origin = run('git', ['remote', 'get-url', 'origin'], root);
const name = run('git', ['config', 'user.name'], root);
const email = run('git', ['config', 'user.email'], root);

fs.writeFileSync(path.join(dist, '.nojekyll'), ''); // GitHub must serve the folders as they are
fs.rmSync(path.join(dist, '.git'), { recursive: true, force: true });
run('git', ['init', '-q', '-b', 'gh-pages'], dist);
run('git', ['config', 'user.name', name], dist);
run('git', ['config', 'user.email', email], dist);
run('git', ['add', '-A'], dist);
run('git', ['commit', '-q', '-m', `Publish the site (${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC)`], dist);
run('git', ['push', '-q', '-f', origin, 'gh-pages'], dist);
fs.rmSync(path.join(dist, '.git'), { recursive: true, force: true });
console.log(`published to the gh-pages branch of ${origin}`);
