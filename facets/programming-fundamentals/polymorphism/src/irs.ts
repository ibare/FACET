/**
 * polymorphism — IR 을 두지 않는다. 그래서 facet 의 `blocks` 에도 코드 패널이 없다.
 *
 * 까닭 둘:
 *
 * 1. IR 어휘에 클래스 · 상속 · 메서드 부르기 · 가상 호출이 없다 (`packages/core/src/types/ir.ts` —
 *    함수 · 정수/실수/목록 · 반복 · 갈래가 전부다).
 * 2. 어휘가 있더라도 한 IR 로 여섯 언어의 **같은 뜻**을 옮길 수 없다. C++ 은 `virtual` 이 없으면 부모 형으로
 *    부를 때 부모 몸이 돈다(정적 결정). C# 은 `virtual`/`override` 없이 같은 이름을 쓰면 `new` 로 **가린다.**
 *    나머지 넷(자바 · 파이썬 · 자바스크립트 · 타입스크립트)은 늘 동적이다. 찾기를 표 걷기로 IR 에 흉내 내면
 *    코드 패널이 "사용자 프로그램" 이 아니라 "런타임의 찾기 루틴" 을 보이게 된다.
 *
 * 프로그램 글자는 화면(stage)이 가상 표기로 가진다 (`tasks/pseudo-notation.md`).
 */
import type { IR } from '@ffacet/core';

export const polymorphismIRs: IR[] = [];
