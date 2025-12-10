import * as fs from 'fs';
import * as path from 'path';

export function discoverTests(folderPath: string): string[] {
  if (!fs.existsSync(folderPath)) {
    throw new Error(`Directory does not exist: ${folderPath}`);
  }

  const stat = fs.statSync(folderPath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${folderPath}`);
  }

  const entries = fs.readdirSync(folderPath, { withFileTypes: true });

  const mdFiles: string[] = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      mdFiles.push(path.resolve(folderPath, entry.name));
    }
  }

  return mdFiles;
}
