/**
 * positional-encoding 의 IR — 두지 않는다.
 *
 * 까닭: 이 완제품의 셈은 sin · cos 위에 서 있는데, 삼각함수는 IR 어휘 밖이다. IR 의 수학 이름은
 * exp · log · sqrt · abs · max · min · floor 뿐이고(IR_MATH_BUILTINS), sin · cos 는 exp 로 펴지지 않는다.
 * 테일러 급수로 흉내 내면 코드 패널이 화면과 다른 셈을 보이게 되므로 코드 패널을 두지 않는다.
 * 그래서 phase 이벤트도 없다 (C3 — phase 집합이 IR 과 같게 둘 다 빈 집합).
 */

import type { IR } from '@ffacet/core';

export const positionalEncodingIRs: IR[] = [];
