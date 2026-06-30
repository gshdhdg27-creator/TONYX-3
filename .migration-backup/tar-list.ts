import fs from 'fs';
import { execSync } from 'child_process';
console.log(execSync('tar -tvf 06_mini_app.tar.gz').toString());
