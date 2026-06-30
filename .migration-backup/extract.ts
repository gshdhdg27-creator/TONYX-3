import * as tar from 'tar';
import fs from 'fs';
import path from 'path';

async function extractFiles() {
  const files = [
    '01_root_config.tar.gz',
    '02_db.tar.gz',
    '03_api_zod.tar.gz',
    '04_api_spec_client.tar.gz',
    '05_api_server.tar.gz',
    '06_mini_app.tar.gz'
  ];

  for (const file of files) {
    if (fs.existsSync(file) && fs.statSync(file).size > 0) {
      console.log(`Extracting ${file}...`);
      try {
        await tar.x({
          file: file,
          cwd: process.cwd()
        });
      } catch (err) {
        console.error(`Error extracting ${file}:`, err);
      }
    } else {
      console.log(`Skipping ${file} - does not exist or empty`);
    }
  }
}

extractFiles().then(() => console.log('Done'));
