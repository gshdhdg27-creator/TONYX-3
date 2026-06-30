import { execSync } from 'child_process';
try {
  console.log(execSync('tar -xzf 05_api_server.tar.gz').toString());
  console.log('done');
} catch (e) {
  console.error(e.message);
}
