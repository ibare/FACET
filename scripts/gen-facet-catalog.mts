/**
 * facet 카탈로그 생성기.
 *
 * 실행: pnpm catalog:gen
 *
 * 만드는 것:
 *  - packages/bootstrap/src/catalog/<locale>.generated.ts — 언어 하나짜리 카탈로그
 *  - packages/bootstrap/src/catalog/loaders.generated.ts  — 언어 → 모듈 동적 import 표
 *  - packages/authoring/src/facet-domains.generated.ts    — facet → 분야 (개념 메타용)
 *
 * 계산은 `facet-catalog-build.mts` 에 있다. 여기서는 쓰기와, 없어진 언어의 옛
 * 파일을 지우는 일만 한다.
 *
 * 빌드타임 전용 스크립트라 무거운 facet 모듈 import 가 일어나지만, 산출물은
 * 순수 데이터라 런타임/번들에는 facet chunk 가 딸려오지 않는다.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCatalogOutputs, CATALOG_DIR, repoRoot } from './facet-catalog-build.mts';

async function main(): Promise<void> {
  const outputs = await buildCatalogOutputs();

  const dir = join(repoRoot, CATALOG_DIR);
  mkdirSync(dir, { recursive: true });
  const keep = new Set(outputs.map((o) => o.path));
  for (const f of readdirSync(dir)) {
    const rel = `${CATALOG_DIR}/${f}`;
    if (f.endsWith('.generated.ts') && !keep.has(rel)) rmSync(join(dir, f));
  }
  for (const o of outputs) writeFileSync(join(repoRoot, o.path), o.text, 'utf8');

  process.stdout.write(`[catalog] ${outputs.length}개 파일을 썼다\n`);
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    process.stderr.write(`[catalog] 생성 실패: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
