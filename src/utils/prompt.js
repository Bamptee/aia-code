import readline from 'node:readline';

export function isInteractive() {
  return process.stdin.isTTY === true;
}

export function ask(question, defaultValue = '') {
  if (!isInteractive()) {
    return Promise.resolve(defaultValue);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

export async function askRequired(question) {
  if (!isInteractive()) {
    return '';
  }

  let answer = '';
  while (!answer) {
    answer = await ask(question);
    if (!answer) {
      console.log('This field is required.');
    }
  }
  return answer;
}
