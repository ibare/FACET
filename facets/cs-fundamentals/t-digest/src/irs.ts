/**
 * t-digest 는 코드 패널을 두지 않는다. 여기 IR 이 없는 것은 빠뜨린 것이 아니라
 * 판정한 것이다.
 *
 * 까닭 — 척도 함수에 `asin` 과 `sin` 이 필요한데 **IR 의 예약 수학 이름에 없다**.
 * 예약된 것은 `exp` · `log` · `sqrt` · `abs` · `max` · `min` · `floor` 뿐이다.
 * 이름을 더하려면 여섯 transpiler (cpp · csharp · java · javascript · python ·
 * typescript) 가 모두 그것을 옮겨야 하고, 그 대가로 얻는 것은 이 facet 하나다.
 *
 * 즉 비용은 여섯 패키지에 걸치고 이득은 한 곳에 맺힌다. 그래서 두지 않는다.
 * `facets/ml-basics/tsne/src/irs.ts` 가 같은 판정의 선례다.
 *
 * 이 판정의 귀결로 `facet.ts` 의 `layout` children 에서 `codePanel` 을 뺀다 —
 * 빈 코드 패널을 띄우는 것은 IR 이 없다는 사실을 숨기는 쪽이지 드러내는 쪽이
 * 아니다.
 *
 * 척도 함수를 IR 로 옮길 길이 생긴다면 (예약 이름에 `asin`/`sin` 이 들어온다면)
 * 그때 이 파일에 `tDigestImperativeIR` 을 세우면 된다. 그 전까지는 빈 배열이
 * 정직한 상태다.
 */

import type { IR } from '@ffacet/core/runtime';

export const tDigestIRs: IR[] = [];
