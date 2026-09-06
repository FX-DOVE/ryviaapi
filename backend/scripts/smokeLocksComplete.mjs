/**
 * Smoke test for locksCompleteForPlan (no DB / Redis).
 * Run: node scripts/smokeLocksComplete.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { locksCompleteForPlan } from '../src/services/lockCompleteness.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ryvia-lock-'));
const img = path.join(tmp, 'hero_reference.jpg');
fs.writeFileSync(img, 'fake');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log('OK:', msg);
}

const plan = {
  acts: [{ scenes: [{}] }],
  characters: [{ name: 'Hero' }, { name: 'Villain' }],
  environments: [{ locationId: 'loc_kitchen', name: 'Kitchen' }],
};

assert(locksCompleteForPlan({ directorPlan: plan, characterLocks: {}, environmentLocks: {} }) === false, 'empty maps incomplete');
assert(locksCompleteForPlan({
  directorPlan: plan,
  characterLocks: { Hero: { lockPrompt: 'x', referenceImagePath: null }, Villain: { lockPrompt: 'y' } },
  environmentLocks: {},
}) === false, 'empty stubs incomplete (prior bug regression)');
assert(locksCompleteForPlan({
  directorPlan: plan,
  characterLocks: { Hero: { referenceImagePath: img }, Villain: { lockPrompt: 'only text' } },
  environmentLocks: { loc_kitchen: { referenceImagePath: img } },
}) === false, 'partial character locks incomplete');
assert(locksCompleteForPlan({
  directorPlan: plan,
  characterLocks: { Hero: { referenceImagePath: img }, Villain: { referenceImagePath: img } },
  environmentLocks: { loc_kitchen: { referenceImagePath: img } },
}) === true, 'all real on-disk locks complete');
assert(locksCompleteForPlan({
  directorPlan: plan,
  characterLocks: { Hero: { referenceImagePath: img }, Villain: { referenceImagePath: '/no/such/file.jpg' } },
  environmentLocks: { loc_kitchen: { referenceImagePath: img } },
}) === false, 'stale missing path incomplete');
assert(locksCompleteForPlan({
  directorPlan: { acts: [], characters: [], environments: [] },
  characterLocks: {},
  environmentLocks: {},
}) === true, 'empty plan vacuously complete');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\nAll smoke checks passed.');
