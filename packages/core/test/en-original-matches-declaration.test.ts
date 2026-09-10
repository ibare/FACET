/**
 * `tr(key, en)` 의 en 원본은 선언의 en 과 글자까지 같아야 한다 — facet 전수.
 *
 * 런타임은 선언(`FacetJson.messages`)이 이기므로 둘이 갈려도 **화면은 멀쩡하다.**
 * 그래서 호출부의 리터럴이 조용히 죽은 문안이 된다 — 다음 사람이 코드를 읽고
 * 화면에 저 문장이 뜬다고 믿는데 실제로는 다른 문장이 뜬다.
 *
 * 두 배치 연속으로 나왔다. 한 번은 한 글자가 갈린 채로 커밋 직전까지 갔고,
 * 한 번은 호출을 래퍼로 감싸 둔 탓에 대조 자체가 되지 않았다. 눈으로 세는 일을
 * 두 번 했으면 검사로 옮길 때다.
 *
 * **이 검사가 보는 것은 갈림 하나뿐이다.** 선언에 아예 없는 키를 부르는 것은
 * 다른 결함이고(문안이 코드에만 있어 저작자가 손댈 수 없다 — C10), 그것까지 여기서
 * 보게 하면 한쪽이 막혀 다른 쪽이 못 들어온다. 지금 저장소에는 그 부류가 여섯 있다 —
 * 완결형 여섯의 stage 가 부르는 `caption.empty` 로, 어느 `facet.ts` 에도 선언이 없다.
 * 그것은 선언 여섯에 열 locale 씩 채우는 별개의 일이다.
 *
 * **래퍼를 쓰면 이 검사가 그 facet 을 못 본다.** `tr()` 을 `say()` 같은 것으로
 * 한 겹 감싸면 en 원본이 변수가 되어 소스에서 읽히지 않는다. 그것이 래퍼를
 * 두지 않는 까닭이다 (C10). 아래 하한이 그 사실을 지킨다 — 검사가 보는 수가
 * 줄면 어딘가 대조에서 빠져나갔다는 뜻이다.
 */
/*
 * 타임아웃을 명시해 둔다. 이 검사는 facet 을 전부 로드하므로 걸리는 시간이
 * facet 수에 비례해 는다. 기본값 5초에 기대 두면 어느 배치에선가 갑자기
 * 터지는데, 그때 실패는 결함이 아니라 성장이다 — 실제로 178 개에서 둘이
 * 그렇게 터졌다.
 */
import { describe, expect, it } from 'vitest';
import type { FacetJson } from '../src/types/facet-json.js';
import { FACET_MODULES, FACET_SOURCES } from './facet-modules.js';

/** `tr('key', 'en original'` — 두 인자가 다 리터럴인 호출만 읽는다. */
const CALL = /\b(?:tr|t)\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'/g;

/** 소스에 적힌 그대로의 이스케이프를 실제 문자로 되돌린다. */
function unescape(raw: string): string {
  return raw.replace(/\\(['"\\nt])/g, (_, c: string) =>
    c === 'n' ? '\n' : c === 't' ? '\t' : c,
  );
}

function dirOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

function facetsOf(mod: Record<string, unknown>): FacetJson[] {
  const out: FacetJson[] = [];
  for (const v of Object.values(mod)) {
    if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') {
      if ((v as { id: string }).id.startsWith('facet:')) out.push(v as FacetJson);
    }
  }
  return out;
}

describe('화면 문안의 두 자리', () => {
  it('호출부의 en 원본이 선언의 en 과 같다', async () => {
    /** 디렉터리 → 그 facet 들이 선언한 en 문안 (같은 키가 여럿이면 다 받는다). */
    const declared = new Map<string, Map<string, Set<string>>>();
    for (const [path, load] of FACET_MODULES) {
      const facets = facetsOf(await load());
      if (facets.length === 0) continue;
      const byKey = new Map<string, Set<string>>();
      for (const facet of facets) {
        for (const [key, loc] of Object.entries(facet.messages ?? {})) {
          const en = (loc as { en?: unknown }).en;
          if (typeof en !== 'string') continue;
          const bucket = byKey.get(key) ?? new Set<string>();
          bucket.add(en);
          byKey.set(key, bucket);
        }
      }
      declared.set(dirOf(path), byKey);
    }

    const drifted: string[] = []; // 선언과 글자가 갈린 것
    let compared = 0;

    for (const [path, src] of Object.entries(FACET_SOURCES)) {
      const byKey = declared.get(dirOf(path));
      if (!byKey) continue;
      for (const m of src.matchAll(CALL)) {
        const key = unescape(m[1]!);
        const en = unescape(m[2]!);
        // 선언에 없는 키는 견줄 상대가 없다 — 위 머리말 참조.
        const declaredEn = byKey.get(key);
        if (!declaredEn) continue;
        compared += 1;
        if (!declaredEn.has(en)) {
          drifted.push(`${path} :: ${key}\n    호출부 ${JSON.stringify(en)}\n    선언   ${JSON.stringify([...declaredEn][0])}`);
        }
      }
    }

    // 검사가 조용히 빈껍데기가 되지 않게 하는 하한. 래퍼로 감싼 facet 이 생기면
    // 이 수가 줄고, 그때 통과가 아니라 실패로 드러난다.
    expect(compared).toBeGreaterThan(900);
    expect(drifted).toEqual([]);
  }, 60_000);
});
