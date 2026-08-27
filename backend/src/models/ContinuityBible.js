import mongoose from 'mongoose';

const continuityCharacterSchema = new mongoose.Schema({
  filmCharacterId: { type: mongoose.Schema.Types.ObjectId, ref: 'FilmCharacter' },
  name: { type: String, required: true },
  physicalDescription: { type: String },
  age: { type: Number },
  gender: { type: String },
  hairstyle: { type: String },
  clothing: { type: String },
  accessories: [{ type: String }],
  currentState: { type: String },
  emotionalState: { type: String },
  voiceId: { type: String },
  currentLocationId: { type: String },
  spatialPosition: { type: String }, // e.g. "left of frame", "seated at table"
  eyeline: { type: String } // e.g. "looking right at Mary"
}, { _id: false });

const continuityObjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  type: { type: String, enum: ['vehicle', 'furniture', 'prop', 'weapon', 'document', 'jewelry', 'tool', 'other'] },
  currentLocationId: { type: String },
  spatialPosition: { type: String },
  state: { type: String } // e.g. "broken", "open", "running"
}, { _id: false });

const continuityLocationSchema = new mongoose.Schema({
  locationId: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['interior', 'exterior'] },
  timeOfDay: { type: String },
  weather: { type: String },
  lighting: { type: String },
  description: { type: String }
}, { _id: false });

const continuitySchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  screenplayId: { type: mongoose.Schema.Types.ObjectId, ref: 'Screenplay' },
  characters: [continuityCharacterSchema],
  objects: [continuityObjectSchema],
  locations: [continuityLocationSchema],
  globalRules: [{ type: String }], // Overarching continuity rules
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.models.ContinuityBible || mongoose.model('ContinuityBible', continuitySchema);