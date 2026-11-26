import { put } from '@vercel/blob';
import { pathFor, receiveFeedback } from '../studio/feedback.mjs';

export default async function feedback(req, res) {
  // Vercel may parse JSON before invoking a Node handler.
  const parsed = req.body;
  const body = parsed === undefined ? req : [typeof parsed === 'string' ? parsed : JSON.stringify(parsed)];
  const [status, response] = await receiveFeedback({ method: req.method, headers: req.headers, body },
    (note) => put(pathFor(note.id), JSON.stringify(note), {
      access: 'private', contentType: 'application/json', addRandomSuffix: false,
    }));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (status === 405) res.setHeader('Allow', 'POST');
  res.statusCode = status;
  res.end(JSON.stringify(response));
}
