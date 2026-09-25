/**
 * rip — IR 을 두지 않는다 (코드 패널 블록도 없다).
 */
import type { IR } from '@ffacet/core';

// No IR on purpose: the four methods exchange different things (one number, a list of router names,
// a copied link-state advert), so a single IR cannot give the same answer as the stage for every knob
// value. Name lists and advert sets are data an IR cannot build. The relaxation code itself is already
// shown in a code panel by the bellman-ford and dijkstra facets.
export const ripIRs: IR[] = [];
