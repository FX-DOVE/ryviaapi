/**
 * Send one prompt to the configured reasoning provider (Google Gemini).
 *
 *   node scripts/ask-kimi.mjs "What is the film pipeline?"
 */
import '../backend/env.js';
import { listTransports } from '../backend/src/providers/reasoningProvider.js';

const userPrompt = process.argv.slice(2).join(' ').trim() || 'What is the film pipeline?';

const primary = listTransports()[0];
if (!primary) {
  console.log('No reasoning transport configured — GEMINI_API_KEY unset.');
  process.exit(1);
}

console.log(`POST ${primary.endpoint}   (model ${primary.model})`);
console.log(`system: "You are an expert film director."`);
console.log(`user:   ${JSON.stringify(userPrompt)}`);
console.log('submitting…\n');

const t0 = Date.now();
try {
  const text = await primary.run(
    [
      { role: 'system', content: 'You are an expert film director.' },
      { role: 'user', content: userPrompt },
    ],
    { maxTokens: 2048, temperature: 0.7 },
  );
  console.log(`\x1b[32m── Replied in ${Math.round((Date.now() - t0) / 1000)}s ──\x1b[0m\n${text}`);
  process.exitCode = 0;
} catch (err) {
  console.log(`\x1b[31mFailed after ${Math.round((Date.now() - t0) / 1000)}s:\x1b[0m ${err.message}`);
  process.exitCode = 1;
}
