/**
 * 개념 메타의 screen.labels 생성기.
 *
 * 실행: pnpm screen:gen
 *
 * `@ffacet/authoring` 의 개념은 "화면에 실제로 뜨는 문자열" 을 writer 에게 알려야
 * 하는데, 이것을 손으로 옮겨 적으면 반드시 어긋난다 (실제로 title-block 의 제목과
 * stack 의 입력/출력 트랙 라벨이 누락된 적이 있다). 원천은 FacetJson 이므로 여기서
 * 기계적으로 뽑는다.
 *
 * 수집 대상 (모두 화면에 렌더되는 것):
 *   - FacetJson.title / description   — title-block 이 인쇄
 *   - blocks[].label                  — 각 패널 제목
 *   - control-bar 의 controls[].label / placeholder, metrics[].label
 *   - FacetJson.messages              — projector / stage view 가 그리는 문안
 *   - 사용하는 빌트인 view 의 카탈로그 키 — messages/<locale>.json
 *
 * 산출물은 locale 별 문자열 배열이다. authoring 의 소비자는 호스트 LLM 서버라
 * 번들 크기 제약이 없으므로 10개 언어를 모두 담는다.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapFacet } from '@ffacet/bootstrap';
import { listFacetLoaderIds, loadFacet, getFacetById, resolveLocale } from '@ffacet/core/runtime';
import type { FacetJson, LocaleStr } from '@ffacet/core/runtime';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const outFile = join(repoRoot, 'packages/authoring/src/screen-labels.generated.ts');

/** 블록 type → 그 view 가 쓰는 카탈로그 키 접두사. */
const VIEW_KEY_PREFIX: Record<string, string> = {
  'control-bar': 'view.controlBar.',
  'code-view': 'view.codeView.',
  'conveyor-queue': 'view.conveyorQueue.',
  'pass-tracker': 'view.passTracker.',
  'bar-chart': 'view.barChart.',
  'snapshot-strip': 'view.snapshotStrip.',
};

const LOCALES = ['en', 'ko', 'ja', 'zh', 'ar', 'es', 'fr', 'hi', 'id', 'pt'];

/** messages/<locale>.json 을 모두 읽어 둔다. */
const bundles: Record<string, Record<string, string>> = {};
for (const f of readdirSync(join(repoRoot, 'messages'))) {
  if (!f.endsWith('.json')) continue;
  bundles[f.replace('.json', '')] = JSON.parse(
    readFileSync(join(repoRoot, 'messages', f), 'utf8'),
  ) as Record<string, string>;
}

function collect(json: FacetJson, locale: string): string[] {
  const out: string[] = [];
  const push = (v: LocaleStr | undefined): void => {
    if (v === undefined) return;
    const s = resolveLocale(v, locale);
    if (s) out.push(s);
  };

  push(json.title);
  push(json.description);

  const prefixes = new Set<string>();
  for (const block of Object.values(json.blocks)) {
    const b = block as {
      type: string;
      label?: LocaleStr;
      controls?: { label?: LocaleStr; placeholder?: LocaleStr }[];
      metrics?: { label: LocaleStr }[];
    };
    push(b.label);
    for (const c of b.controls ?? []) {
      push(c.label);
      push(c.placeholder);
    }
    for (const m of b.metrics ?? []) push(m.label);
    const p = VIEW_KEY_PREFIX[b.type];
    if (p) prefixes.add(p);
  }

  // facet 이 선언한 문안
  for (const v of Object.values(json.messages ?? {})) push(v);

  // 이 facet 이 쓰는 빌트인 view 의 프레임워크 문구
  const bundle = bundles[locale] ?? {};
  const en = bundles.en ?? {};
  for (const prefix of [...prefixes].sort()) {
    for (const key of Object.keys(en).sort()) {
      if (key.startsWith(prefix)) out.push(bundle[key] ?? en[key]!);
    }
  }

  return [...new Set(out)];
}

bootstrapFacet();
const rows: string[] = [];
let count = 0;
for (const id of listFacetLoaderIds().sort()) {
  await loadFacet(id);
  const json = getFacetById(id);
  if (!json) continue;
  const byLocale: Record<string, string[]> = {};
  for (const locale of LOCALES) byLocale[locale] = collect(json, locale);
  rows.push(`  ${JSON.stringify(id)}: ${JSON.stringify(byLocale)},`);
  count += byLocale.en!.length;
}

writeFileSync(
  outFile,
  `/**
 * 자동 생성 파일 — 직접 편집하지 말 것.
 *
 * 생성: pnpm screen:gen  (scripts/gen-screen-labels.mts)
 * 출처: 각 facet 의 FacetJson (title / description / blocks label / metrics /
 *       controls / messages) + 그 facet 이 쓰는 빌트인 view 의 messages 번들.
 *
 * 개념 메타(FacetConceptSource)의 screen.labels 는 이 표에서 온다. 손으로 옮겨
 * 적으면 화면과 어긋나므로 선언하지 않는다.
 */

/** facet id → locale → 화면에 뜨는 문자열 목록. */
export const SCREEN_LABELS: Record<string, Record<string, string[]>> = {
${rows.join('\n')}
};
`,
  'utf8',
);
console.log(`[screen] ${rows.length}개 facet / en 기준 ${count}개 문자열 → screen-labels.generated.ts`);
