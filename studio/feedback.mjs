import { randomUUID } from 'node:crypto';
import { episode } from './episode.mjs';

export const bodyLimit = 8 * 1024;

export function parseNote(body) {
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const time = body?.time;
  if (body?.episode !== episode.id || !Number.isFinite(time) || time < 0 || time > episode.duration) {
    return null;
  }
  if (!message || message.length > 1200 || body.website) return null;
  return {
    id: randomUUID(), episode: episode.id, time: Math.round(time * 100) / 100,
    message, createdAt: new Date().toISOString(),
  };
}

export async function receiveFeedback({ method, headers, body }, save) {
  if (method !== 'POST') return [405, { error: 'Metodă indisponibilă.' }];
  if (headers['sec-fetch-site'] === 'cross-site') return [403, { error: 'Trimite observația din pagina episodului.' }];
  if (headers['content-type']?.split(';')[0]?.trim() !== 'application/json') {
    return [415, { error: 'Formatul observației este invalid.' }];
  }
  let size = 0;
  const chunks = [];
  for await (const data of body) {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
    size += chunk.length;
    if (size > bodyLimit) return [413, { error: 'Observația este prea lungă.' }];
    chunks.push(chunk);
  }
  let decoded;
  try {
    decoded = JSON.parse(Buffer.concat(chunks));
  } catch {
    return [400, { error: 'Formatul observației este invalid.' }];
  }
  const note = parseNote(decoded);
  if (!note) return [422, { error: 'Verifică textul și secunda din episod.' }];
  try {
    await save(note);
    return [201, { id: note.id }];
  } catch (error) {
    console.error('Salvarea observației a eșuat', error.name);
    return [503, { error: 'Observația nu s-a salvat. Încearcă din nou.' }];
  }
}

export function pathFor(id) {
  return `feedback/${id}.json`;
}
