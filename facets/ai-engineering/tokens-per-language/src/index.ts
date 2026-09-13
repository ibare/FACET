/**
 * tokens-per-language 등록 진입점.
 *
 * 부르는 것은 호스트 앱이다 — 이 파일이 스스로 부르지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { tokensPerLanguageAlgorithm, type TokensPerLanguageData } from './algorithm.js';
import { tokensPerLanguageScene } from './scene.js';
import { tokensPerLanguageIRs } from './irs.js';
import { tokensPerLanguageStageView } from './tokens-per-language-stage.js';
import { tokensPerLanguageFacet } from './facet.js';
import { tokensPerLanguageDescription } from './description.js';

export function registerTokensPerLanguage(): void {
  // 조각은 스스로 시작하고 걸음 간격을 스스로 정해야 하므로 reactive 다 (S-piece).
  registerAlgorithm<TokensPerLanguageData>('tokensPerLanguage', tokensPerLanguageAlgorithm, {
    mechanismKind: 'reactive',
  });
  // algorithm 과 같은 이름으로 등록하지 않는다 — `module:` 참조가 어느 쪽인지
  // 말하지 못하게 된다 (C4).
  registerScenePlan('tokensPerLanguageScene', tokensPerLanguageScene);
  for (const ir of tokensPerLanguageIRs) registerIR(ir.id, ir);
  registerView('tokens-per-language-stage', tokensPerLanguageStageView);
  registerFacets([tokensPerLanguageFacet]);
  registerDescription(tokensPerLanguageFacet.id, tokensPerLanguageDescription);
}

export {
  tokensPerLanguageAlgorithm,
  tokensPerLanguageScene,
  tokensPerLanguageIRs,
  tokensPerLanguageStageView,
  tokensPerLanguageFacet,
  tokensPerLanguageDescription,
};
export type { TokensPerLanguageData };
