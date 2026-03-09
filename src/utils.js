import fs from 'fs-extra';

export async function readIfExists(filePath) {
  if (await fs.pathExists(filePath)) {
    return (await fs.readFile(filePath, 'utf-8')).trim();
  }
  return '';
}
