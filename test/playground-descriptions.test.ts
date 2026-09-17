/**
 * 데모 사이트의 설명 글 — `apps/playground/src/descriptions/<facet id>.md`.
 *
 * ── 왜 여기 있나
 *
 * 설명 글은 원래 facet 마다 `description.ts` 로 있었고 `registerDescription` 으로
 * core 레지스트리에 올라갔다. 그런데 그것을 읽는 곳은 데모 사이트의 facet 창
 * 하나뿐이었다. 호스트는 개념 메타(`@ffacet/authoring`)를 읽고 글은 한 번도 부르지
 * 않는다. 그런데도 글 277 편(752KB)이 facet chunk 에 묶여 발행 번들 두 곳에 실렸고,
 * 데모의 필요가 core 공개 API 가 되어 있었다. 2026-09-17 에 글을 데모 사이트로
 * 옮기고 facet · core 에서 뗐다.
 *
 * ── 이 검사가 지키는 것
 *
 * - 글과 그림의 연결. 호스트가 `{facet:<id>}` 토큰을 시각화 노드로 바꾸므로 토큰이
 *   빠지면 글만 뜨고 그림은 나타나지 않는다. 오타 난 토큰은 조용히 빈자리로 남는다.
 * - 구현된 facet 과 글이 한 벌씩 맞는지.
 * - 발행 대상이 다시 글을 싣지 않는지.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { listFacetLoaderIds } from '@ffacet/core/runtime';
import { bootstrapFacet } from '@ffacet/bootstrap';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(repoRoot, 'apps/playground/src/descriptions');
const TOKEN = /\{facet:([A-Za-z0-9_-]+)\}/g;

bootstrapFacet();
const loaderIds: string[] = [...listFacetLoaderIds()].sort();
const texts = new Map<string, string>(
  readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f): [string, string] => [`facet:${f.replace(/\.md$/, '')}`, readFileSync(join(dir, f), 'utf8')]),
);

describe('데모 사이트 설명 글', () => {
  it('구현된 facet 마다 글이 하나씩 있고, facet 없는 글은 없다', () => {
    expect(loaderIds.length).toBeGreaterThan(250);
    const ids = [...texts.keys()].sort();
    expect({
      글없는facet: loaderIds.filter((id) => !texts.has(id)),
      facet없는글: ids.filter((id) => !loaderIds.includes(id)),
    }).toEqual({ 글없는facet: [], facet없는글: [] });
  });

  it('글은 자기 facet 을 부르고, 부르는 facet 은 모두 실재한다', () => {
    const known = new Set(loaderIds);
    const silent: string[] = [];
    const dangling: string[] = [];
    for (const [id, text] of texts) {
      const called = new Set([...text.matchAll(TOKEN)].map((m) => `facet:${m[1]}`));
      if (!called.has(id)) silent.push(id);
      for (const c of called) if (!known.has(c)) dangling.push(`${id} → ${c}`);
    }
    expect({ silent, dangling }).toEqual({ silent: [], dangling: [] });
  });

  /*
   * facet 테스트에 있던 글 내용 검사를 옮겨 왔다. 글이 facet 곁을 떠났으니 글을
   * 지키는 검사도 글 곁으로 온다.
   */
  it.each([
    // scc — 이 facet 의 근거는 "이 그래프에서는 두 실수가 같은 답을 낸다" 는 사실이다.
    // 그 문장이 글에서 조용히 사라지면 코드 패널을 다는 까닭도 함께 사라진다.
    ['facet:scc', ['답이 맞아 버려서 살아남는 실수', 'onstack', '답이 맞는 것과 코드가 맞는 것은 다르다']],
    // maxFlow — 되돌릴 폭이 실제로 쓰이는 장면은 이 망에 없어 그 자리를 조각이 맡는다.
    ['facet:maxFlow', ['{facet:undoByBackEdge}', '23 으로 똑같이 나온다']],
  ] as const)('%s 의 글이 지켜야 할 대목을 담고 있다', (id, phrases) => {
    const text = texts.get(id) ?? '';
    expect(phrases.filter((p) => !text.includes(p))).toEqual([]);
  });

  it('발행되는 facet · 패키지는 설명 글을 싣지 않는다', () => {
    const hits = execSync(
      `git grep -l -e registerDescription -e getDescription -- 'facets' 'packages/*/src' || true`,
      { cwd: repoRoot, encoding: 'utf8' },
    ).trim();
    expect(hits).toBe('');
    const leftover = execSync(`git ls-files 'facets/**/description.ts'`, { cwd: repoRoot, encoding: 'utf8' }).trim();
    expect(leftover).toBe('');
    expect(existsSync(dir)).toBe(true);
  });
});
