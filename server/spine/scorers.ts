import * as v100 from './models/confidence_1_0_0.js';
import * as current from './confidenceModel.js';
import type { ConfidenceInput, ConfidenceResult } from './confidenceModel.js';

/**
 * M1 (Brad, 25 Oct 2026; C3, 26 Oct 2026): every model version's scorer is kept, so a sealed run is always
 * recomputed under the model it was sealed with, whatever version is current. A new version is a new file
 * (or the current one) registered here; a registered scorer is never edited.
 */
export interface Scorer { version: string; fingerprint: string; computeConfidence: (input: ConfidenceInput) => ConfidenceResult }

export const SCORERS: Readonly<Record<string, Scorer>> = {
  [v100.MODEL_VERSION]: { version: v100.MODEL_VERSION, fingerprint: v100.MODEL_FINGERPRINT, computeConfidence: v100.computeConfidence as (i: ConfidenceInput) => ConfidenceResult },
  [current.MODEL_VERSION]: { version: current.MODEL_VERSION, fingerprint: current.MODEL_FINGERPRINT, computeConfidence: current.computeConfidence },
};

/** The scorer a run was sealed with, when its version and fingerprint are both registered; else null. */
export function scorerFor(version: string | undefined, fingerprint: string | undefined): Scorer | null {
  const s = version ? SCORERS[version] : undefined;
  return s && s.fingerprint === fingerprint ? s : null;
}
