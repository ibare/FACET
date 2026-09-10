/**
 * 글은 자기 그림을 부른다 — facet 전수.
 *
 * `description.ts` 의 `{facet:<id>}` 토큰을 호스트가 시각화 노드로 바꾼다.
 * 그 토큰이 없으면 **글만 뜨고 그림은 아예 나타나지 않는다.**
 *
 * 이것은 다른 어떤 검사도 잡지 못한다. `facet-first-step` 은 facet 을 직접
 * 마운트하므로 글을 거치지 않고, 나머지도 전부 facet 쪽만 본다. 글과 그림이
 * 이어져 있는지는 호스트를 거쳐야만 드러나는데, 그 경로는 `{facet:…}` 문자열
 * 하나가 전부다.
 *
 * 조각 하나가 실제로 이렇게 나갔다 — 글은 "화면에서 미세하게 떠는 것들이" 라고
 * 화면을 가리키는데 그 화면을 부르는 줄이 없었다. 타입도 통과하고 검사도 전부
 * 통과하며, 띄워 본 사람만 안다.
 *
 * 곁들여 **없는 facet 을 부르지 않는지**도 본다. 오타 난 토큰은 조용히 빈자리로
 * 남는다.
 */
/*
 * 타임아웃을 명시해 둔다. 이 검사는 facet 을 전부 로드하므로 걸리는 시간이
 * facet 수에 비례해 는다. 기본값 5초에 기대 두면 어느 배치에선가 갑자기
 * 터지는데, 그때 실패는 결함이 아니라 성장이다 — 실제로 178 개에서 둘이
 * 그렇게 터졌다.
 */
import { describe, expect, it } from 'vitest';
import { clearRegistry, getFacetById } from '../src/runtime/registry.js';
import type { FacetJson } from '../src/types/facet-json.js';

import { FACET_MODULES as MODULES } from './facet-modules.js';

const TOKEN = /\{facet:([A-Za-z0-9_-]+)\}/g;

function facetsOf(mod: Record<string, unknown>): FacetJson[] {
  const out: FacetJson[] = [];
  for (const v of Object.values(mod)) {
    if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') {
      const id = (v as { id: string }).id;
      if (id.startsWith('facet:')) out.push(v as FacetJson);
    }
  }
  return out;
}

/** 모듈이 내보낸 마크다운 문자열. `<name>Description` 규약을 따른다. */
function descriptionsOf(mod: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(mod)) {
    if (k.endsWith('Description') && typeof v === 'string') out.push(v);
  }
  return out;
}

describe('글과 그림의 연결', () => {
  it('글은 자기 facet 을 부르고, 부르는 facet 은 모두 실재한다', async () => {
    clearRegistry();

    const silent: string[] = []; // 자기 그림을 안 부르는 글
    const dangling: string[] = []; // 없는 facet 을 부르는 토큰
    let checked = 0;

    // 등록을 먼저 끝낸다 — 글이 이웃 facet 을 부를 수 있어 전부 등록된 뒤에 본다.
    const rows: Array<{ path: string; facets: FacetJson[]; texts: string[] }> = [];
    for (const [path, load] of MODULES) {
      const mod = await load();
      for (const [k, v] of Object.entries(mod)) {
        if (k.startsWith('register') && typeof v === 'function') (v as () => void)();
      }
      rows.push({ path, facets: facetsOf(mod), texts: descriptionsOf(mod) });
    }

    for (const row of rows) {
      if (row.texts.length === 0) continue;
      const joined = row.texts.join('\n');
      const called = new Set<string>();
      for (const m of joined.matchAll(TOKEN)) called.add(`facet:${m[1]}`);

      for (const id of called) {
        if (getFacetById(id) === undefined) dangling.push(`${row.path} → ${id}`);
      }

      for (const facet of row.facets) {
        checked += 1;
        if (!called.has(facet.id)) silent.push(`${row.path} :: ${facet.id}`);
      }
    }

    expect(checked).toBeGreaterThan(100);
    expect({ silent, dangling }).toEqual({ silent: [], dangling: [] });
  }, 60_000);
});
