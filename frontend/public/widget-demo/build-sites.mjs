// Emits site-a/, site-b/, site-c/ from _site-template.html so all three
// pages share one source of truth. Run from this directory:
//
//   node build-sites.mjs
//
// Idempotent: overwrites the three index.html files. Add to npm scripts
// or call before deploy if you want the build to enforce regeneration.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(resolve(here, '_site-template.html'), 'utf8');
const cfg = JSON.parse(readFileSync(resolve(here, 'config.json'), 'utf8'));

cfg.sites.forEach((site, idx) => {
  const dir = resolve(here, site.id);
  mkdirSync(dir, { recursive: true });
  // Inject an index-setting script just before </head> so the
  // bootstrap inside the template reads the right slice of config.json.
  const indexScript = `  <script>window.WIDGET_DEMO_SITE_INDEX = ${idx};</script>\n</head>`;
  const html = template.replace('</head>', indexScript);
  writeFileSync(resolve(dir, 'index.html'), html, 'utf8');
  console.log(`Built ${site.id}/index.html (index=${idx})`);
});
