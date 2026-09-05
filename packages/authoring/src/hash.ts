/**
 * definition 콘텐츠 해시.
 *
 * 용도는 단 하나 — 호스트가 "이 개념의 이 언어 definition 이 지난번 임베딩
 * 이후 바뀌었는가" 를 판정하는 것이다. FACET 버전이 올랐다고 전체를 재임베딩할
 * 이유가 없고, 개념이 수천 개로 늘면 그 비용이 실제 문제가 된다.
 *
 * 비교 대상이 언제나 "같은 개념 · 같은 언어의 이전 해시" 하나뿐이라 전역
 * 유일성이 필요 없다. 그래서 32비트 FNV-1a 로 충분하다 — 암호학적 성질도,
 * 서로 다른 개념 사이의 충돌 회피도 요구되지 않는다.
 *
 * node:crypto 대신 TextEncoder 를 쓰는 이유는 이 패키지의 의존 0 원칙 때문이다
 * (concept-types.ts 상단 참조). 브라우저·Node 양쪽에서 같은 값이 나온다.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const encoder = new TextEncoder();

/** UTF-8 바이트 기준 FNV-1a 32비트. 8자리 소문자 16진수. */
export function contentHash(text: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of encoder.encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
