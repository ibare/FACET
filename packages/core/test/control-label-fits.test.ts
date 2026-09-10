/**
 * 컨트롤바의 라벨이 한 줄에 서는가 — facet 전수.
 *
 * control-bar 는 flex 로 늘어서는데, 라벨에 `white-space: nowrap` 이 없으면
 * 폭이 모자랄 때 **글자가 한 자씩 세로로 떨어진다.** 한국어처럼 어디서나
 * 끊기는 글에서 특히 그렇다. 단추 하나가 세로로 길어지면 컨트롤바가 통째로
 * 무너지고, 그 아래 코드 패널까지 밀린다.
 *
 * 실제로 났다 — `hierarchical` 과 `dbscan` 에서 "재생" · "단계" · "속도" 가
 * 세로로 쪼개졌고, 컨트롤 영역이 화면 절반을 차지했다. 사용자가 스크린샷으로
 * 알려 주었다.
 *
 * 고친 것은 둘이다. 코어 쪽은 `nowrap` 이고(그것은 이 파일이 아니라 브라우저가
 * 지킨다), 여기서 재는 것은 **라벨 자체가 그렇게 길지 않은가** 다. `nowrap` 은
 * 글자가 쪼개지는 것을 막을 뿐, 라벨이 길면 컨트롤바가 가로로 넘친다.
 *
 * **컨트롤 라벨은 손잡이의 이름이다.** 무엇을 뜻하는지는 캡션과 글이 말한다.
 * "연결 방식 — 두 무리가 얼마나 먼가" 는 이름이 아니라 설명이고, 그런 것이
 * 둘 있었다.
 */
/*
 * 타임아웃을 명시해 둔다. 이 검사는 facet 을 전부 로드하므로 걸리는 시간이
 * facet 수에 비례해 는다. 기본값 5초에 기대 두면 어느 배치에선가 갑자기
 * 터지는데, 그때 실패는 결함이 아니라 성장이다 — 실제로 178 개에서 둘이
 * 그렇게 터졌다.
 */
import { describe, expect, it } from 'vitest';
import type { FacetJson } from '../src/types/facet-json.js';
import { FACET_MODULES } from './facet-modules.js';

/**
 * 라벨 길이의 상한.
 *
 * 처음 18 로 잡았다가 다섯이 걸렸는데 전부 로망스어와 인도네시아어였다 —
 * `Tasa de aprendizaje`(19) 는 "학습률"(3) 이고 `Taux d'apprentissage`(20) 도
 * 같은 말이다. **길이만으로는 이름과 설명을 못 가른다.** 언어마다 같은 뜻을
 * 쓰는 길이가 다르기 때문이다.
 *
 * 그래서 상한은 넉넉히 두고, 진짜로 가르는 것은 아래 `EXPLAINS` 다.
 */
const MAX = 24;

/**
 * 이름 뒤에 설명을 붙인 모양.
 *
 * 실제로 걸린 둘이 이랬다 — `Linkage — how far apart two groups are` 와
 * `C — how hard it tries`. 대시나 콜론으로 이름과 설명을 잇는 것이 그 표시다.
 * 손잡이의 **이름**만 적고, 무엇을 뜻하는지는 캡션과 글이 말한다.
 */
const EXPLAINS = /\s[—–:]\s/;

/** 화면에 뜨는 라벨을 가진 위젯. 단추는 프리셋 문안이라 여기 없다. */
const LABELLED = new Set(['segmented-slider', 'value-input']);

type Ctl = { widget?: unknown; label?: unknown; action?: unknown };

function localeStrings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (v && typeof v === 'object') {
    return Object.values(v as Record<string, unknown>).filter((x): x is string => typeof x === 'string');
  }
  return [];
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

describe('컨트롤바의 라벨', () => {
  it('손잡이 이름은 한 줄에 서는 길이다', async () => {
    const tooLong: string[] = [];
    let checked = 0;

    for (const [, load] of FACET_MODULES) {
      for (const facet of facetsOf(await load())) {
        for (const block of Object.values(facet.blocks ?? {})) {
          const spec = block as { type?: unknown; controls?: unknown };
          if (spec.type !== 'control-bar' || !Array.isArray(spec.controls)) continue;
          for (const c of spec.controls as Ctl[]) {
            if (typeof c.widget !== 'string' || !LABELLED.has(c.widget)) continue;
            for (const text of localeStrings(c.label)) {
              checked += 1;
              const why =
                EXPLAINS.test(text) ? '이름 뒤에 설명이 붙었다'
                : text.length > MAX ? `${text.length}자로 길다`
                : null;
              if (why) tooLong.push(`${facet.id} :: ${String(c.action)} — ${JSON.stringify(text)} — ${why}`);
            }
          }
        }
      }
    }

    // 검사가 조용히 빈껍데기가 되지 않게 하는 하한. 손잡이를 가진 완제품이
    // 여럿 있고 저마다 locale 여덟을 채운다.
    expect(checked).toBeGreaterThan(40);
    expect(tooLong).toEqual([]);
  }, 60_000);
});
