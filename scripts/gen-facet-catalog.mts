/**
 * facet 카탈로그 매니페스트 생성기.
 *
 * 실행: pnpm catalog:gen
 *
 * 동작:
 *  1. facets/<domain>/<name>/src/facet.ts 를 스캔해 facet id → domain 매핑을 만든다.
 *  2. bootstrapFacet() 으로 loader 를 등록하고, 모든 loader 를 실제 로드해
 *     런타임에 등록된 FacetJson 에서 title/description 을 추출한다.
 *  3. id/title/description/domain 만 추린 경량 배열을 packages/bootstrap/src/
 *     facet-catalog.generated.ts 로 emit 한다.
 *
 * 단일 출처: title/description 은 각 facet 의 facet.ts, domain 은 디렉터리 구조.
 * 이 스크립트는 그 둘을 join 한 파생물을 만들 뿐 새 사실을 선언하지 않는다.
 *
 * 빌드타임 전용 스크립트라 무거운 facet 모듈 import 가 일어나지만, 산출물
 * (generated.ts) 은 순수 데이터라 런타임/번들에는 facet chunk 가 딸려오지 않는다.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapFacet, type FacetCatalogEntry } from '@ffacet/bootstrap';
import { listFacetLoaderIds, loadFacet, getFacetById } from '@ffacet/core/runtime';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const facetsRoot = join(repoRoot, 'facets');
const outFile = join(repoRoot, 'packages/bootstrap/src/facet-catalog.generated.ts');

// facet.ts 하나에 여러 FacetJson 이 선언될 수 있다 (canonical + aspect). 전부 잡는다.
const ID_PATTERN = /id:\s*'(facet:[A-Za-z0-9-]+)'/g;

/** facets/<domain>/<name>/src/facet.ts 에서 facet id → domain 매핑 구축. */
function buildDomainMap(): Map<string, string> {
  const idToDomain = new Map<string, string>();
  for (const domain of readdirSync(facetsRoot)) {
    let names: string[];
    try {
      names = readdirSync(join(facetsRoot, domain));
    } catch {
      continue; // 파일(디렉터리 아님) 스킵
    }
    for (const name of names) {
      const facetFile = join(facetsRoot, domain, name, 'src', 'facet.ts');
      if (!existsSync(facetFile)) continue;
      for (const match of readFileSync(facetFile, 'utf8').matchAll(ID_PATTERN)) {
        idToDomain.set(match[1]!, domain);
      }
    }
  }
  return idToDomain;
}

function renderFile(entries: FacetCatalogEntry[]): string {
  const rows = entries.map((e) => `  ${JSON.stringify(e)},`).join('\n');
  return [
    '/**',
    ' * 자동 생성 파일 — 직접 편집하지 말 것.',
    ' *',
    ' * 생성: pnpm catalog:gen  (scripts/gen-facet-catalog.mts)',
    ' * 출처: 각 facet 의 facet.ts(title/description) + facets/<domain>/<name> 디렉터리 구조.',
    ' *',
    ' * 이 배열은 순수 데이터라 facet 의 무거운 시각화 chunk 를 참조하지 않는다.',
    ' * 따라서 호스트는 이 카탈로그를 읽어도 facet 모듈을 로드하지 않는다 (lazy 보존).',
    ' */',
    '',
    "import type { FacetCatalogEntry } from './catalog-types.js';",
    '',
    'export const FACET_CATALOG: readonly FacetCatalogEntry[] = [',
    rows,
    '];',
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const idToDomain = buildDomainMap();

  bootstrapFacet();
  const ids = listFacetLoaderIds().sort();

  const entries: FacetCatalogEntry[] = [];
  const missingDomain: string[] = [];
  for (const id of ids) {
    const json = await loadFacet(id);
    if (!json) throw new Error(`loader 가 facet JSON 을 등록하지 않음: ${id}`);
    const resolved = getFacetById(id) ?? json;
    const domain = idToDomain.get(id);
    if (!domain) missingDomain.push(id);
    entries.push({
      id,
      title: resolved.title,
      ...(resolved.description ? { description: resolved.description } : {}),
      domain: domain ?? 'unknown',
    });
  }

  entries.sort((a, b) => a.domain.localeCompare(b.domain) || a.id.localeCompare(b.id));

  writeFileSync(outFile, renderFile(entries), 'utf8');

  process.stdout.write(`[catalog] ${entries.length}개 facet → packages/bootstrap/src/facet-catalog.generated.ts\n`);
  if (missingDomain.length > 0) {
    process.stderr.write(`[catalog] domain 미매핑 (디렉터리 id 불일치 의심): ${missingDomain.join(', ')}\n`);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`[catalog] 생성 실패: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
