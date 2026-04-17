import {
  getCatalog,
  registerCatalog,
  registerLens,
  validateCatalog,
} from '@facet/core';
import { loopContainer } from '@facet/container-loop';
import { bubbleSortBundle } from '@facet/algorithm-bubblesort';
import { mainstreamTranspilers } from '@facet/transpilers-mainstream';
import { circuitLens } from '@facet/lens-circuit';
import { codeLens } from '@facet/lens-code';

let initialized = false;

export function bootstrapFacet(): void {
  if (initialized) return;
  initialized = true;

  registerCatalog({
    containers: [loopContainer],
    algorithms: [bubbleSortBundle.algorithm],
    bodies: [bubbleSortBundle.body],
    irs: bubbleSortBundle.irs,
    transpilers: mainstreamTranspilers,
  });

  registerLens('circuit', circuitLens);
  registerLens('code', codeLens);

  const warnings = validateCatalog(getCatalog());
  if (warnings.length > 0) {
    console.warn('[facet] catalog validation warnings:', warnings);
  }
}
