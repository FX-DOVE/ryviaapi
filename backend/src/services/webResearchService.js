import { generateWithFallback } from '../providers/reasoningProvider.js';

/**
 * Perform live web research using DuckDuckGo and Wikipedia with timeout.
 * Zero external dependencies — uses standard fetch and regex.
 */
export async function fetchWebResearch(searchQuery, { timeoutMs = 4000 } = {}) {
  const snippets = [];
  const query = String(searchQuery || '').trim();
  if (!query) return snippets;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 1. DuckDuckGo HTML search for current trends and articles
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const ddgPromise = fetch(ddgUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      }
    }).then(async res => {
      if (!res.ok) return;
      const html = await res.text();
      const regex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/g;
      let m;
      while ((m = regex.exec(html)) !== null && snippets.length < 6) {
        const clean = m[1].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
        if (clean && clean.length > 25) snippets.push(clean);
      }
    }).catch(() => {});

    // 2. Wikipedia Search API for factual context and real-world parallels
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=`;
    const wikiPromise = fetch(wikiUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AIFilmStudio/1.0' }
    }).then(async res => {
      if (!res.ok) return;
      const data = await res.json();
      const searchResults = data?.query?.search || [];
      for (const item of searchResults.slice(0, 3)) {
        const clean = item.snippet.replace(/<[^>]+>/g, '').trim();
        if (clean) snippets.push(`[Wikipedia: ${item.title}] ${clean}`);
      }
    }).catch(() => {});

    await Promise.allSettled([ddgPromise, wikiPromise]);
  } catch (err) {
    // Graceful fallback — research should never block generation
  } finally {
    clearTimeout(timer);
  }

  return snippets;
}

/**
 * Format-specific narrative instructions for the 8 Video Types
 */
const FORMAT_SPECIFIC_DIRECTIVES = {
  documentary: `VIDEO TYPE: DOCUMENTARY
- Style: Factual narration with cinematic B-roll and captions.
- Storycraft: Ground the premise in real-world sociological, historical, or psychological truth.
- Directing: Focus on authentic real-life observations, investigative curiosity, compelling documentary voiceover lines, on-screen interview beats, and cinematic visual B-roll descriptions (macro close-ups, handheld truth, natural ambient lighting).`,

  drama: `VIDEO TYPE: DRAMA
- Style: Emotional acting: characters cry, argue, love, betray.
- Storycraft: High emotional stakes, deep human vulnerabilities, interpersonal friction, and powerful moral dilemmas.
- Directing: Intense close-up acting moments, raw emotional confrontations where characters reveal secrets, break down in tears, fight for their relationships, and experience transformative heartbreak or redemption.`,

  movie: `VIDEO TYPE: MOVIE / FEATURE FILM
- Style: Full cinematic production with acting, coverage, and grand pacing.
- Storycraft: Classic three-act Hollywood architecture with strong inciting incident, mid-point turning point, dark night of the soul, and climactic confrontation.
- Directing: Multi-camera cinematic coverage (drone establishing, over-shoulder dialogue, intense reaction shots, cinematic lighting).`,

  explainer: `VIDEO TYPE: EXPLAINER
- Style: Clear teaching video, clean lighting, punchy visual hooks.
- Storycraft: Engaging educational narrative that hooks the viewer in the first 5 seconds and breaks down concepts into memorable, illuminating visual metaphors.
- Directing: Crisp, clean high-key lighting, structured progression, relatable real-world demonstrations, and clear spoken delivery.`,

  commercial: `VIDEO TYPE: COMMERCIAL / AD
- Style: Short punchy product-hero visuals, viral pacing.
- Storycraft: 3-second hook, problem identification, emotional escalation, product/message hero transformation, and high-converting payoff.
- Directing: Sleek modern color grading, dynamic camera moves, vibrant lighting, aspirational tone, and memorable punchlines.`,

  music_video: `VIDEO TYPE: MUSIC VIDEO
- Style: Beat-synced stylised visuals, surreal or rhythmic metaphors.
- Storycraft: Mood-driven visual poetry that syncs with musical tempo, recurring symbolic motifs, and emotional crescendo.
- Directing: Expressive color shifts (neon, moody dusk, high contrast), rhythmic choreography, atmospheric set-pieces, and abstract narrative transitions.`,

  cinematic_trailer: `VIDEO TYPE: CINEMATIC TRAILER
- Style: High-tension montage, epic pacing, dramatic crescendo.
- Storycraft: Teaser architecture with iconic voiceover taglines, escalating stakes, rapid montage cuts, and dramatic silence beats before the final reveal.
- Directing: Inception-style cinematic tension, wide epic shots, dramatic contrast, and heart-pounding audio-visual sync.`,

  anime: `VIDEO TYPE: ANIME / CARTOON
- Style: Style-locked animated performance, vibrant dramatic intensity.
- Storycraft: Japanese anime storytelling with inner monologues, expressive emotional extremes, signature visual quirks, and dynamic narrative peaks.
- Directing: Dynamic anime angles (extreme perspective, speed lines, Dutch tilts, dramatic glowing eyes), intense character expressions, and stylized transitions.`
};

/**
 * Research and expand a brief user synopsis into a full, trending, production-ready script concept.
 */
export async function researchAndExpandConcept({
  title = '',
  synopsis = '',
  videoType = 'drama',
  jobId = '',
}) {
  const typeKey = String(videoType || 'drama').toLowerCase();
  const formatDirective = FORMAT_SPECIFIC_DIRECTIVES[typeKey] || FORMAT_SPECIFIC_DIRECTIVES.drama;

  // 1. Build targeted search query based on prompt keywords
  const cleanSynopsis = synopsis.replace(/[^\w\s]/g, ' ').slice(0, 100);
  const searchQuery = `${cleanSynopsis} ${typeKey} trending stories storytelling themes`.trim();

  // 2. Fetch live web snippets
  console.log(`[WebResearchService] Researching web trends for: "${searchQuery}"...`);
  const webSnippets = await fetchWebResearch(searchQuery, { timeoutMs: 3500 });
  console.log(`[WebResearchService] Gathered ${webSnippets.length} web research insights.`);

  const researchContext = webSnippets.length > 0
    ? `LIVE WEB RESEARCH & REAL-WORLD CONTEXT:\n${webSnippets.map((s, i) => `[${i + 1}] ${s}`).join('\n')}\n`
    : 'Rely on your vast knowledge of viral cultural storytelling and trending cinematic tropes.\n';

  // 3. Ask reasoning model to synthesize and expand
  const systemPrompt = `You are an elite Hollywood showrunner, story researcher, and creative director.
Your mission is to take a user's raw, brief idea (even if it is just one sentence or rough like "a man guy who act goods and love everybody") and research, elevate, and expand it into a compelling, viral, TRENDING production script premise.

CRITICAL DIRECTIVES:
1. STRICT FORMAT ADHERENCE: You must tailor the script PRECISELY to the chosen video type:
${formatDirective}

2. DEEPEN THE PREMISE: Do NOT write generic fluff. Find the emotional core, the conflict, the trending hook, and the human truth. (For example, a man who acts good and loves everybody isn't just nice—what is his backstory? What price does radical kindness demand? Who is threatened by his goodness? What is the heartbreaking or uplifting turning point?).

3. OUTPUT FORMAT: Output ONLY valid raw JSON with no surrounding markdown or explanation.`;

  const userPrompt = `Elevate and expand the following film concept into a trending, production-ready script premise:

USER'S TITLE: "${title || 'Untitled'}"
USER'S RAW SYNOPSIS: "${synopsis}"
VIDEO TYPE: ${videoType}

${researchContext}

Return a JSON object with EXACTLY these fields:
{
  "suggestedTitle": "A powerful, catchy, cinematic title (preserve user's title if strong, or polish it)",
  "expandedSynopsis": "3 detailed, compelling paragraphs capturing the complete story premise, core conflict, key dramatic moments matching the video type (${videoType}), and the emotional payoff. Written ready to produce.",
  "themes": ["3 to 5 trending thematic keywords matching the story"],
  "suggestedCharacters": [
    {
      "name": "Character Name",
      "role": "protagonist|antagonist|supporting",
      "age": 35,
      "physicalDescription": "Vivid visual description suitable for AI image generation",
      "backstory": "Brief psychological motivation and character flaw/arc"
    }
  ],
  "videoTypeDirectives": "2-3 sentences explaining how this script was tailored to ${videoType} (e.g. specific camera, emotional acting, B-roll, or trailer cues)",
  "researchHighlights": "1-2 sentences summarizing the real-world truth or trending storytelling angle incorporated"
}

Output ONLY raw JSON.`;

  try {
    const { text } = await generateWithFallback({
      systemPrompt,
      userPrompt,
      jobId,
      purpose: 'concept-research-expansion',
      temperature: 0.75,
    });

    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const result = JSON.parse(cleaned);

    return {
      suggestedTitle: result.suggestedTitle || title || 'The Good Soul',
      expandedSynopsis: result.expandedSynopsis || synopsis,
      themes: Array.isArray(result.themes) ? result.themes : [],
      suggestedCharacters: Array.isArray(result.suggestedCharacters) ? result.suggestedCharacters : [],
      videoTypeDirectives: result.videoTypeDirectives || '',
      researchHighlights: result.researchHighlights || '',
    };
  } catch (err) {
    console.error('[WebResearchService] Expansion LLM failed, using fallback:', err.message);
    return {
      suggestedTitle: title || 'Untitled Story',
      expandedSynopsis: synopsis,
      themes: ['Hope', 'Human Spirit', 'Drama'],
      suggestedCharacters: [],
      videoTypeDirectives: '',
      researchHighlights: '',
    };
  }
}
