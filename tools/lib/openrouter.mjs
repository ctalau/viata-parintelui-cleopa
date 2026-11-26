// Minimal OpenRouter client: text-to-speech (Gemini TTS), music (Lyria), transcription (Gemini).
import { apiKey } from './common.mjs';

const BASE = 'https://openrouter.ai/api/v1';
const headers = () => ({ Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json', 'X-Title': 'lego-shorts' });

async function retry(fn, tries = 4) {
  let err;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { err = e; await new Promise((r) => setTimeout(r, 1500 * 2 ** i)); }
  }
  throw err;
}

/** Returns raw PCM s16le mono 24 kHz. */
export async function tts({ model, voice, input, instructions }) {
  return retry(async () => {
    const r = await fetch(`${BASE}/audio/speech`, { method: 'POST', headers: headers(), body: JSON.stringify({ model, voice, input, instructions, response_format: 'pcm' }) });
    const buf = Buffer.from(await r.arrayBuffer());
    if (!r.ok || (r.headers.get('content-type') || '').includes('json')) throw new Error(`TTS ${r.status}: ${buf.toString().slice(0, 300)}`);
    if (buf.length < 4800) throw new Error('TTS returned almost no audio');
    return { pcm: buf, rate: parseInt(/rate=(\d+)/.exec(r.headers.get('content-type') || '')?.[1] || '24000') };
  });
}

/** Lyria music clip (~30 s). Returns MP3 bytes. */
export async function music({ prompt, model = 'google/lyria-3-clip-preview' }) {
  return retry(async () => {
    const r = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers: headers(),
      body: JSON.stringify({ model, stream: true, modalities: ['text', 'audio'], messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) throw new Error(`music ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const text = await r.text();
    const chunks = [];
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
      try { const d = JSON.parse(line.slice(6)); for (const c of d.choices || []) if (c.delta?.audio?.data) chunks.push(Buffer.from(c.delta.audio.data, 'base64')); } catch {}
    }
    if (!chunks.length) throw new Error('no audio in music response');
    return Buffer.concat(chunks);
  }, 2);
}

/** Transcribe a WAV file (QA for TTS). */
export async function transcribe(wavBuf, { model = 'google/gemini-2.5-flash', language = 'română' } = {}) {
  return retry(async () => {
    const r = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers: headers(), body: JSON.stringify({ model, messages: [{ role: 'user', content: [
      { type: 'text', text: `Transcrie exact, verbatim, ce se aude (limba ${language}). Răspunde doar cu transcrierea.` },
      { type: 'input_audio', input_audio: { data: wavBuf.toString('base64'), format: 'wav' } }] }] }) });
    const d = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(d).slice(0, 300));
    return d.choices[0].message.content.trim();
  });
}

/** An image from an image model (default GPT Image 2), optionally from reference pictures. Returns the image bytes. */
export async function image({ prompt, refs = [], model = 'openai/gpt-5.4-image-2', aspect = '16:9', size = null }) {   // size: '1K' | '2K' | '4K' (Gemini image models)
  const fs = await import('node:fs');
  const url = (f) => `data:${/\.png$/i.test(f) ? 'image/png' : 'image/jpeg'};base64,${fs.readFileSync(f).toString('base64')}`;
  return retry(async () => {
    const content = [{ type: 'text', text: prompt }, ...refs.map((f) => ({ type: 'image_url', image_url: { url: url(f) } }))];
    const r = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers: headers(),
      body: JSON.stringify({ model, modalities: ['image', 'text'], image_config: { aspect_ratio: aspect, ...(size ? { image_size: size } : {}) }, usage: { include: true }, messages: [{ role: 'user', content }] }) });
    const d = await r.json();
    if (!r.ok) throw new Error(`image ${r.status}: ${JSON.stringify(d).slice(0, 300)}`);
    const im = d.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!im) throw new Error('no image in response: ' + JSON.stringify(d).slice(0, 300));
    if (d.usage) console.log(`image: ${model}, ${d.usage.prompt_tokens} in + ${d.usage.completion_tokens} out tokens, cost ${d.usage.cost != null ? '$' + (+d.usage.cost).toFixed(4) : '?'}`);
    if (im.startsWith('data:')) return Buffer.from(im.split(',')[1], 'base64');
    return Buffer.from(await (await fetch(im)).arrayBuffer());
  }, 2);
}
