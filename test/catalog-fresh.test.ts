/**
 * 생성된 카탈로그가 원본과 한 글자도 어긋나지 않는가.
 *
 * ── 왜 id 집합 검사로는 모자랐나
 *
 * 전에는 bootstrap 의 검사가 "카탈로그의 facet id 집합 = 등록된 loader 집합" 만
 * 보았다. facet 을 더하고 재생성을 잊는 실수는 그것으로 잡히지만, `facet.ts` 의
 * 제목이나 설명만 고치고 재생성을 잊으면 id 는 그대로라 통과한다. 호스트 검색
 * 목록에는 옛 문구가 발행된다. 분류표를 고치고 잊어도 마찬가지다.
 *
 * 그래서 생성기와 **같은 계산**(`scripts/facet-catalog-build.mts`)을 여기서 돌려
 * 커밋된 파일과 통째로 맞댄다. 실패하면 `pnpm catalog:gen` 을 실행하라.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCatalogOutputs, CATALOG_DIR, repoRoot } from '../scripts/facet-catalog-build.mts';

const outputs = await buildCatalogOutputs();

describe('생성된 카탈로그의 신선도', () => {
  it('생성물이 원본에서 다시 계산한 것과 같다 (다르면 pnpm catalog:gen)', () => {
    const stale = outputs
      .filter((o) => {
        const file = join(repoRoot, o.path);
        return !existsSync(file) || readFileSync(file, 'utf8') !== o.text;
      })
      .map((o) => o.path);
    expect(stale).toEqual([]);
  });

  it('생성기가 만들지 않는 옛 생성물이 남아 있지 않다', () => {
    const expected = new Set(outputs.map((o) => o.path));
    const leftovers = readdirSync(join(repoRoot, CATALOG_DIR))
      .map((f) => `${CATALOG_DIR}/${f}`)
      .filter((p) => p.endsWith('.generated.ts') && !expected.has(p));
    expect(leftovers).toEqual([]);
  });
});
