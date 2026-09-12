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
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { tokensPerLanguageAlgorithm, type TokensPerLanguageData } from './algorithm.js';
import { tokensPerLanguageProjector } from './projector.js';
import { tokensPerLanguageIRs } from './irs.js';
import { tokensPerLanguageStageView } from './tokens-per-language-stage.js';
import { tokensPerLanguageFacet } from './facet.js';
import { tokensPerLanguageDescription } from './description.js';

export function registerTokensPerLanguage(): void {
  // 조각은 스스로 시작하고 걸음 간격을 스스로 정해야 하므로 reactive 다 (S-piece).
  registerAlgorithm<TokensPerLanguageData>('tokensPerLanguage', tokensPerLanguageAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('tokensPerLanguageProjector', tokensPerLanguageProjector);
  for (const ir of tokensPerLanguageIRs) registerIR(ir.id, ir);
  registerView('tokens-per-language-stage', tokensPerLanguageStageView);
  registerFacets([tokensPerLanguageFacet]);
  registerDescription(tokensPerLanguageFacet.id, tokensPerLanguageDescription);
}

export {
  tokensPerLanguageAlgorithm,
  tokensPerLanguageProjector,
  tokensPerLanguageIRs,
  tokensPerLanguageStageView,
  tokensPerLanguageFacet,
  tokensPerLanguageDescription,
};
export type { TokensPerLanguageData };
