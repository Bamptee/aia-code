const API_URL = 'https://api.openai.com/v1/chat/completions';

function getApiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Missing OPENAI_API_KEY in .env');
  return key;
}

export async function generate(prompt, model) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body}`);
  }

  const chunks = [];

  for await (const raw of res.body) {
    const text = new TextDecoder().decode(raw);
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') break;

      const json = JSON.parse(payload);
      const token = json.choices?.[0]?.delta?.content;
      if (token) {
        process.stdout.write(token);
        chunks.push(token);
      }
    }
  }

  process.stdout.write('\n');
  return chunks.join('');
}
