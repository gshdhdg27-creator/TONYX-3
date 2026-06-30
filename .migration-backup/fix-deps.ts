import fs from 'fs';
import path from 'path';

const packages = ['api-server', 'mini-app', 'db', 'api-client-react', 'api-zod', 'api-spec'];

for (const pkg of packages) {
  const file = path.join(process.cwd(), pkg, 'package.json');
  if (fs.existsSync(file)) {
    const pkgJson = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const deps of ['dependencies', 'devDependencies']) {
      if (pkgJson[deps]) {
        for (const [name, version] of Object.entries(pkgJson[deps])) {
          if (name.startsWith('@workspace/')) {
            pkgJson[deps][name] = 'workspace:*';
          }
        }
      }
    }
    fs.writeFileSync(file, JSON.stringify(pkgJson, null, 2));
  }
}
