const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function getApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY in .env');
  return key;
}

export async function generate(prompt, model) {
  const url = `${API_BASE}/${model}:streamGenerateContent?alt=sse&key=${getApiKey()}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${body}`);
  }

  const chunks = [];

  for await (const raw of res.body) {
    const text = new TextDecoder().decode(raw);
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const json = JSON.parse(trimmed.slice(6));
      const token = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (token) {
        process.stdout.write(token);
        chunks.push(token);
      }
    }
  }

  process.stdout.write('\n');
  return chunks.join('');
}
