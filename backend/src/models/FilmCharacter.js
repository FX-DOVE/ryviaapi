import mongoose from 'mongoose';

/**
 * FilmCharacter — a persistent character definition for use across film scenes.
 * Stores physical description, wardrobe, voice, and animation style data
 * to enable consistent visual identity across all 500+ scenes of a feature film.
 */
const filmCharacterSchema = new mongoose.Schema(
  {
    workspaceId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    projectId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Identity
    name:         { type: String, required: true, trim: true },
    role:         { type: String, enum: ['protagonist', 'antagonist', 'supporting', 'minor'], default: 'supporting' },
    age:          { type: Number, default: null },
    gender:       { type: String, enum: ['male', 'female', 'non-binary', 'unspecified'], default: 'unspecified' },
    ethnicity:    { type: String, default: '' },  // e.g. "Nigerian Yoruba", "Japanese", "African American"

    // Physical description — the core of consistency
    physicalDescription: { type: String, default: '' },
    // e.g. "tall athletic build, dark brown skin, short natural hair, strong jawline, brown eyes, usually serious expression"

    // Clothing / Wardrobe
    clothingDefault:     { type: String, default: '' },
    // e.g. "red and gold ankara dress with matching headwrap"
    clothingByAct: {
      type: Map,
      of: String,
      default: {}
    },
    // e.g. { "1": "warrior armor", "2": "civilian clothes", "3": "royal robes" }

    // Personality (used by screenplay AI to write consistent dialogue)
    personality:  { type: String, default: '' },
    // e.g. "brave, stubborn, protective of family, speaks in short sentences"
    backstory:    { type: String, default: '' },

    // The key prompt injected into every scene image generation call
    // Auto-generated from the fields above, or manually overridden
    seedPrompt:   { type: String, default: '' },
    // e.g. "Adaeze: 28-year-old Nigerian woman, dark brown skin, high cheekbones..."

    // Reference image for IP-Adapter / InstantID face consistency
    referenceImageUrl: { type: String, default: null },
    referenceImageKey: { type: String, default: null },

    // Multimodal vision analysis of the uploaded photo (face, world, lighting)
    visualAnalysis: { type: mongoose.Schema.Types.Mixed, default: null },

    // Voice settings (ElevenLabs)
    voiceId:      { type: String, default: null },  // ElevenLabs voice ID
    voiceName:    { type: String, default: '' },    // Human-readable label

    // Animation style override (inherits from film if null)
    animationStyle: {
      type: String,
      enum: ['2d_anime', 'pixar', '3d_cgi_hollywood', 'nollywood_drama', 'realistic', null],
      default: null
    },

    // Auto-generated fields
    appearsInScenes: [{ type: Number }],  // scene numbers this character appears in
  },
  { timestamps: true }
);

filmCharacterSchema.index({ workspaceId: 1, projectId: 1 });
filmCharacterSchema.index({ workspaceId: 1, name: 1 });

export default mongoose.model('FilmCharacter', filmCharacterSchema);
