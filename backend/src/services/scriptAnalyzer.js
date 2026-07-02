import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { generateWithFallback } from '../providers/reasoningProvider.js';

/**
 * Extract raw text from various file types.
 * Supports: .txt, .pdf, .docx, .md
 */
async function extractTextFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.txt':
    case '.md': {
      return fs.promises.readFile(filePath, 'utf8');
    }

    case '.pdf': {
      const buffer = await fs.promises.readFile(filePath);
      const data   = await pdfParse(buffer);
      return data.text;
    }

    case '.docx': {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    }

    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

/**
 * Separate style guide from narration using LINE-INDEX CLASSIFICATION.
 *
 * HOW IT WORKS (and why previous approaches failed):
 * ─────────────────────────────────────────────────
 * Previous approach: ask Gemini to "return the narration text" → model
 * paraphrases/summarizes, producing a shorter version. WRONG.
 *
 * Previous approach v2: ask Gemini to "return the style guide text verbatim",
 * then remove those lines from the original. STILL WRONG — Gemini would
 * accidentally include narration sentences in its styleGuide output (treating
 * example script text inside a style guide block as style content), causing
 * those narration lines to be stripped too.
 *
 * THIS APPROACH:
 * 1. Number every non-blank line in the original text (0-indexed).
 * 2. Send the numbered lines to Gemini. Ask it to return ONLY a JSON array
 *    of the line INDICES that are style-guide/instructions — never the content.
 * 3. Reconstruct narration by keeping lines whose index is NOT in that array.
 * 4. Reconstruct style guide by keeping lines whose index IS in that array.
 *
 * The model never touches narration content. Narration is preserved verbatim,
 * at any length, with zero risk of summarization.
 *
 * @param {string} text  Full original input text (no length limit)
 * @returns {Promise<{ cleanScript: string, styleGuide: string }>}
 */
async function extractScriptAndStyle(text, jobId = '') {
  // Fast path: if there are no style-guide markers, skip the Gemini call entirely.
  // Pure narration scripts (no headers, no markdown, no instruction keywords) go
  // straight through unchanged — no API cost, no latency.
  const hasStyleMarkers = /^#+\s|^\*\*|^---|^\s*[-*]\s+\*\*|\bSTYLE\b|\bGUIDELINE|\bINSTRUCTION|\bOUTPUT RULE|\bSETTING|\bSYSTEM ROLE/im.test(text);

  if (!hasStyleMarkers) {
    console.log('[ScriptAnalyzer] No style guide markers detected — treating entire input as narration.');
    return { cleanScript: text.trim(), styleGuide: '' };
  }

  // Split into lines, keeping their original index position.
  const allLines = text.split('\n');

  // Build a numbered representation to send to Gemini.
  // We only send lines with actual content to reduce token count, but we keep
  // the original index so we can map back.
  const numberedLines = allLines
    .map((content, idx) => ({ idx, content }))
    .filter(({ content }) => content.trim().length > 0);

  const numberedText = numberedLines
    .map(({ idx, content }) => `[${idx}] ${content}`)
    .join('\n');

  const systemPrompt = `You are classifying lines of text as either NARRATION (spoken script) or STYLE_GUIDE (instructions, rules, settings, headers, formatting directives, directorial notes — anything that is NOT meant to be spoken aloud in the video).`;
  const userPrompt = `The lines below are numbered with [index]. Return ONLY a JSON array of the integer indices of lines that are STYLE_GUIDE content. Do not include narration line indices.

If ALL lines are narration (no style guide present), return an empty array: []

Return ONLY the raw JSON array. No markdown fences, no explanation, nothing else.

Example output: [0, 1, 2, 5, 6, 7, 12]

Lines to classify:
${numberedText}`;

  try {
    const { text: response } = await generateWithFallback({
      systemPrompt,
      userPrompt,
      jobId,
      purpose: 'script-analysis'
    });

    // Strip markdown fences if present
    const cleaned = response.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    let styleIndices = [];
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        styleIndices = parsed.filter(i => typeof i === 'number');
      }
    } catch (parseErr) {
      // Fallback: extract numbers from the response
      const nums = cleaned.match(/\d+/g);
      styleIndices = nums ? nums.map(Number) : [];
      console.warn(`[ScriptAnalyzer] JSON parse failed, extracted indices via regex: [${styleIndices.join(', ')}]`);
    }

    const styleIndexSet = new Set(styleIndices);

    // Reconstruct both parts by keeping/removing lines by their original index.
    // We operate on allLines (the full array including blank lines) so we preserve
    // paragraph spacing in the narration.
    const narrationLines = [];
    const styleLines     = [];

    for (let idx = 0; idx < allLines.length; idx++) {
      if (styleIndexSet.has(idx)) {
        styleLines.push(allLines[idx]);
      } else {
        narrationLines.push(allLines[idx]);
      }
    }

    const cleanScript = narrationLines.join('\n').trim();
    const styleGuide  = styleLines.join('\n').trim();

    // Safety: if classification removed everything (shouldn't happen), return original
    if (!cleanScript.trim()) {
      console.warn('[ScriptAnalyzer] Classification left no narration — returning full original as safety fallback.');
      return { cleanScript: text.trim(), styleGuide: '' };
    }

    console.log(`[ScriptAnalyzer] Line classification: ${numberedLines.length} total lines, ${styleIndices.length} style-guide lines removed, ${narrationLines.filter(l => l.trim()).length} narration lines kept.`);
    return { cleanScript, styleGuide };

  } catch (err) {
    console.error('[ScriptAnalyzer] Gemini classification failed:', err.message);

    // Classify error: only mark as ConfigurationError if it is a permanent authorization/key issue
    const status = err.status || err.response?.status;
    const msg = (err.message || '').toLowerCase();
    const isPermanent = status === 400 || status === 401 || status === 403 || 
                        msg.includes('api_key_invalid') || msg.includes('invalid api key') || msg.includes('unauthorized');

    const error = new Error(`Script analysis failed: ${err.message}`);
    if (isPermanent) {
      error.name = 'ConfigurationError';
    }
    throw error;
  }
}

/**
 * Main entry point — accepts script text, uploaded file paths, or both,
 * and untangles them into pure narration and a style guide.
 *
 * @param {object} input
 * @param {string} [input.script]          Raw script text
 * @param {string} [input.prompt]          Short creative prompt (used if no script)
 * @param {string} [input.styleGuide]      Explicitly provided style guide
 * @param {string[]} [input.uploadedFiles] File paths to parse
 */
export async function analyzeScript({ script, prompt, styleGuide = '', uploadedFiles = [], jobId = '' }) {
  let fullText = '';

  // Gather text from uploaded files (which might contain script OR style guide)
  for (const filePath of uploadedFiles) {
    if (fs.existsSync(filePath)) {
      const text = await extractTextFromFile(filePath);
      fullText  += `\n\n${text}`;
    }
  }

  // Append manual script / prompt
  if (script) fullText += `\n\n${script}`;
  if (!fullText.trim() && prompt) fullText = prompt;

  if (!fullText.trim()) {
    throw new Error('No content provided — supply a script, prompt, or upload a document');
  }

  // Use line-index classification to separate style guide from narration.
  // The narration text is NEVER regenerated or paraphrased by the model.
  const extracted = await extractScriptAndStyle(fullText.trim(), jobId);

  // Combine extracted style guide with any explicitly provided style guide field
  const combinedStyleGuide = [styleGuide, extracted.styleGuide].filter(Boolean).join('\n\n');

  if (!extracted.cleanScript.trim()) {
    throw new Error('Could not extract any narration script from the provided content');
  }

  console.log(`[ScriptAnalyzer] ✅ Final narration: ${extracted.cleanScript.length} chars | Style guide: ${combinedStyleGuide.length} chars`);

  return {
    cleanScript: extracted.cleanScript,
    styleGuide:  combinedStyleGuide,
  };
}

export default { analyzeScript };
