const API_URL = 'https://api.anthropic.com/v1/messages';

function getApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Missing ANTHROPIC_API_KEY in .env');
  return key;
}

export async function generate(prompt, model) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const chunks = [];

  for await (const raw of res.body) {
    const text = new TextDecoder().decode(raw);
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const json = JSON.parse(trimmed.slice(6));
      if (json.type === 'content_block_delta') {
        const token = json.delta?.text;
        if (token) {
          process.stdout.write(token);
          chunks.push(token);
        }
      }
    }
  }

  process.stdout.write('\n');
  return chunks.join('');
}
