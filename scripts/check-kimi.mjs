/**
 * Isolated liveness check for the primary reasoning transport (Google Gemini).
 *
 *   node scripts/check-kimi.mjs
 */
import '../backend/env.js';
import { listTransports } from '../backend/src/providers/reasoningProvider.js';

const primary = listTransports()[0];

if (!primary) {
  console.log('\x1b[33mNOT CONFIGURED\x1b[0m — no reasoning transport.');
  console.log('  GEMINI_API_KEY is unset.');
  process.exit(0);
}

console.log(`Testing ${primary.id} / ${primary.model}`);
console.log(`  endpoint: ${primary.endpoint}`);
console.log('  submitting a 16-token completion…');

const t0 = Date.now();
try {
  const text = await primary.run(
    [{ role: 'user', content: 'Reply with the single word: ok' }],
    { maxTokens: 16, temperature: 0 },
  );
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`\n\x1b[32mWORKING\x1b[0m — replied in ${secs}s: ${JSON.stringify(String(text).slice(0, 80))}`);
  process.exitCode = 0;
} catch (err) {
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`\n\x1b[31mNOT WORKING\x1b[0m — failed after ${secs}s`);
  console.log(`  ${err.message}`);
  process.exitCode = 1;
}
