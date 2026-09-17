/**
 * 등록 진입점. 부르는 책임은 호스트 앱에 있다 — 이 모듈은 사이드 이펙트로
 * 스스로 등록하지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { severalHashesOneValueAlgorithm, type SeveralHashesOneValueData } from './algorithm.js';
import { severalHashesOneValueScene } from './scene.js';
import { severalHashesOneValueIRs } from './irs.js';
import { severalHashesOneValueStageView } from './several-hashes-one-value-stage.js';
import { severalHashesOneValueFacet } from './facet.js';
import { severalHashesOneValueDescription } from './description.js';

export {
  severalHashesOneValueAlgorithm,
  severalHashesOneValueScene,
  severalHashesOneValueIRs,
  severalHashesOneValueStageView,
  severalHashesOneValueFacet,
  severalHashesOneValueDescription,
};
export { hashesOf, type KeyHashes } from './algorithm.js';
export type {
  SeveralHashesOneValueScene,
  HashRow,
  HashStep,
  HashCaption,
} from './scene.js';
export type { SeveralHashesOneValueData };

export function registerSeveralHashesOneValue(): void {
  registerAlgorithm<SeveralHashesOneValueData>(
    'severalHashesOneValue',
    severalHashesOneValueAlgorithm,
    { mechanismKind: 'reactive' },
  );
  registerScenePlan('severalHashesOneValueScene', severalHashesOneValueScene);
  for (const ir of severalHashesOneValueIRs) registerIR(ir.id, ir);
  registerView('several-hashes-one-value-stage', severalHashesOneValueStageView);
  registerFacets([severalHashesOneValueFacet]);
  registerDescription(severalHashesOneValueFacet.id, severalHashesOneValueDescription);
}
