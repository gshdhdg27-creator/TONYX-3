import fs from 'fs';
import path from 'path';

const workspaceYaml = fs.readFileSync('pnpm-workspace.yaml', 'utf8');
const catalogMap = new Map();

const lines = workspaceYaml.split('\n');
let inCatalog = false;
for (const line of lines) {
  if (line.startsWith('catalog:')) {
    inCatalog = true;
    continue;
  }
  if (inCatalog && line.trim().startsWith('"')) {
    const parts = line.split(':');
    const pkg = parts[0].trim().replace(/"/g, '');
    const ver = parts.slice(1).join(':').trim().replace(/"/g, '');
    catalogMap.set(pkg, ver);
  }
}

const packages = ['api-server', 'mini-app', 'db', 'api-client-react', 'api-zod', 'api-spec'];

for (const pkg of packages) {
  const file = path.join(process.cwd(), pkg, 'package.json');
  if (fs.existsSync(file)) {
    const pkgJson = JSON.parse(fs.readFileSync(file, 'utf8'));
    
    for (const deps of ['dependencies', 'devDependencies']) {
      if (pkgJson[deps]) {
        for (const [name, version] of Object.entries(pkgJson[deps])) {
          if (version === 'catalog:') {
            if (catalogMap.has(name)) {
              pkgJson[deps][name] = catalogMap.get(name);
            } else {
              pkgJson[deps][name] = 'latest';
            }
          } else if ((version as string).startsWith('workspace:')) {
            pkgJson[deps][name] = '*';
          }
        }
      }
    }
    fs.writeFileSync(file, JSON.stringify(pkgJson, null, 2));
  }
}
