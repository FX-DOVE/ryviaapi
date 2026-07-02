import Project from '../models/Project.js';
import { generateWithFallback } from '../providers/reasoningProvider.js';

export async function updateProjectMemory(project, completedJob) {
  if (!project || !completedJob) return;

  console.log(`[ProjectMemory] Updating memory logs for project ${project._id} from job ${completedJob._id}`);

  const memoryPrompt = `
    Analyze this completed video project style: "${completedJob.styleConfig?.preset || 'cinematic'}"
    with active style settings: ${JSON.stringify(completedJob.styleConfig)}
    and characters: ${JSON.stringify(project.characters.map(c => c.name))}
    and environments: ${JSON.stringify(project.environments.map(e => e.name))}.
    
    Provide a SHORT visual consistency statement (max 2 sentences) that should be
    prepended to every new scene prompt to maintain consistent lighting, framing, and details.
    Output ONLY the statement, nothing else. Do not wrap in quotes or code blocks.
  `.trim();

  let consistencyPrefix = 'Maintain consistent cinematic rendering and lighting across frames.';

  try {
    const { text } = await generateWithFallback({
      systemPrompt: 'You are an expert film consistency advisor.',
      userPrompt: memoryPrompt,
      jobId: String(completedJob._id),
      purpose: 'project-memory'
    });

    if (text?.trim()) {
      consistencyPrefix = text.trim();
    }
  } catch (err) {
    console.warn(`[ProjectMemory] LLM parsing failed: ${err.message}. Using default consistency prefix.`);
  }

  // Update structured memory entries
  project.aiMemory = {
    visualStyle: completedJob.styleConfig || {},
    cameraStyle: { camera: completedJob.styleConfig?.camera || 'hollywood' },
    characterMemory: { names: project.characters.map(c => c.name) },
    environmentMemory: { names: project.environments.map(e => e.name) },
    colorPalette: { grade: completedJob.styleConfig?.colorGrade || 'netflix' },
    negativePrompts: [],
    preferredProviders: [completedJob.provider || 'grok'],
    consistencyPromptPrefix: consistencyPrefix,
    lastUpdated: new Date()
  };

  await project.save();
  console.log(`[ProjectMemory] Successfully saved memory logs: "${consistencyPrefix}"`);
}

export default { updateProjectMemory };
