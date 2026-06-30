import { execSync } from 'child_process';
try {
  console.log(execSync('tar -xzf 06_mini_app.tar.gz').toString());
  console.log('done');
} catch (e) {
  console.error(e.message);
}
