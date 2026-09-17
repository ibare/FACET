import type { IR } from '@ffacet/core/runtime';

/**
 * 조각은 코드 패널을 두지 않는다.
 *
 * 한 주장만 말하고 멈추는 물건이라 여섯 언어로 갈라 보일 소스가 없다 (S-piece).
 * 그래도 파일을 남기는 것은 S-facet 의 5파일 구성을 지키기 위해서다 — 자리를
 * 비워 두면 다음 사람이 빠뜨린 것으로 읽는다.
 */
export const spaceIsPartOfItIRs: IR[] = [];
