import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateToolData } from '@tapython-tool-hub/tooling';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

generateToolData({
  root,
  toolDataRoot: path.join(root, 'data', 'tools'),
  toolDocsRoot: path.join(root, 'data', 'tool-docs'),
  apiRoot: path.join(root, 'apps', 'web', 'public', 'api', 'tools'),
  downloadRoot: path.join(root, 'apps', 'web', 'public', 'downloads')
})
  .then(({ toolCount }) => {
    console.log(`Generated ${toolCount} tool API record(s).`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });