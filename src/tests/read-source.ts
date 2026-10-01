import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Reads a source file with all comments stripped.
//
// Several assertions check that a broken construct is GONE from the code. Those
// same constructs are quoted verbatim in the explanatory comments beside the
// fix, so a naive read would match the documentation rather than the code and
// the regression test would fail for the wrong reason.
export async function codeOnly(relative: string): Promise<string> {
  const src = await readFile(path.join(process.cwd(), relative), 'utf8');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}