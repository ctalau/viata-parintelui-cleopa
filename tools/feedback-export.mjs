import { get, list } from '@vercel/blob';
import { readFile, readdir } from 'node:fs/promises';

let notes = [];
if (process.argv.includes('--local')) {
  const dir = new URL('../.feedback/', import.meta.url);
  const files = await readdir(dir).catch((err) => {
    if (err.code === 'ENOENT') return [];
    throw err;
  });
  notes = await Promise.all(files.filter((file) => file.endsWith('.json')).map(async (file) => (
    JSON.parse(await readFile(new URL(file, dir), 'utf8'))
  )));
} else {
  let cursor;
  do {
    const page = await list({ prefix: 'feedback/', cursor });
    for (const blob of page.blobs) {
      const result = await get(blob.pathname, { access: 'private' });
      if (result?.statusCode === 200) notes.push(await new Response(result.stream).json());
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}
notes.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
console.log(JSON.stringify(notes, null, 2));
