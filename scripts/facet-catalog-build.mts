/**
 * facet 카탈로그 산출물 계산 — 파일을 쓰지 않는 순수 부분.
 *
 * `gen-facet-catalog.mts` 가 이 결과를 디스크에 쓰고, `test/catalog-fresh.test.ts`
 * 가 같은 결과를 커밋된 파일과 맞댄다. 계산을 한곳에 두어야 "생성기가 만드는 것"
 * 과 "검사가 기대하는 것" 이 갈라지지 않는다.
 *
 * 원본은 셋이고 이 모듈은 그것을 합칠 뿐 새 사실을 선언하지 않는다.
 *   - 어떤 facet 이 있는가     → bootstrapFacet() 의 registerFacetLoader
 *   - 제목 · 설명               → 각 facet 의 facet.ts (로드해서 읽는다)
 *   - 분야 · 하위 분야와 그 이름 → taxonomy/taxonomy.json
 *   - 어떤 언어가 있는가        → messages/<locale>.json 파일 목록
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapFacet } from '@ffacet/bootstrap';
import type { FacetCatalog } from '@ffacet/bootstrap';
import { getFacetById, listFacetLoaderIds, loadFacet, resolveLocale } from '@ffacet/core/runtime';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, '..');

/** 생성물이 놓이는 자리. 저장소 루트 기준. */
export const CATALOG_DIR = 'packages/bootstrap/src/catalog';
export const FACET_DOMAINS_FILE = 'packages/authoring/src/facet-domains.generated.ts';

type LocaleNames = Record<string, string>;
type Taxonomy = {
  domains: {
    id: string;
    name: LocaleNames;
    subdomains: { id: string; name: LocaleNames; facets: string[] }[];
  }[];
};

export type CatalogOutput = { path: string; text: string };

/** 카탈로그를 내는 언어. 프레임워크 문구 번들이 있는 언어와 같다. */
export function listLocales(): string[] {
  const files = readdirSync(join(repoRoot, 'messages')).filter((f) => f.endsWith('.json'));
  const locales = files.map((f) => f.replace(/\.json$/, '')).sort();
  // en 이 원본 언어라 맨 앞에 둔다. 나머지는 이름순이라 실행마다 같다.
  return ['en', ...locales.filter((l) => l !== 'en')];
}

export function readTaxonomy(): Taxonomy {
  return JSON.parse(readFileSync(join(repoRoot, 'taxonomy/taxonomy.json'), 'utf8')) as Taxonomy;
}

/** 분류표가 스스로 모순이 없고 등록된 facet 전부를 정확히 한 번씩 덮는지. */
function validateTaxonomy(taxonomy: Taxonomy, loaderIds: string[], locales: string[]): void {
  const problems: string[] = [];
  const seenIds = new Set<string>();
  const place = new Map<string, string>();
  const checkName = (where: string, name: LocaleNames): void => {
    for (const l of locales) if (!name[l]) problems.push(`${where}: ${l} 이름 없음`);
  };
  for (const d of taxonomy.domains) {
    if (seenIds.has(d.id)) problems.push(`분야 id 중복: ${d.id}`);
    seenIds.add(d.id);
    checkName(d.id, d.name);
    for (const s of d.subdomains) {
      if (seenIds.has(s.id)) problems.push(`하위 분야 id 중복: ${s.id}`);
      seenIds.add(s.id);
      checkName(`${d.id}/${s.id}`, s.name);
      for (const f of s.facets) {
        const prev = place.get(f);
        if (prev) problems.push(`${f} 가 두 자리에 있다: ${prev} · ${d.id}/${s.id}`);
        place.set(f, `${d.id}/${s.id}`);
      }
    }
  }
  const loaders = new Set(loaderIds);
  for (const f of place.keys()) if (!loaders.has(f)) problems.push(`분류표의 ${f} 가 bootstrap 에 등록되지 않았다`);
  for (const f of loaderIds) if (!place.has(f)) problems.push(`등록된 ${f} 가 분류표에 없다`);
  if (problems.length > 0) {
    throw new Error(`taxonomy/taxonomy.json 이 어긋난다:\n  ${problems.join('\n  ')}`);
  }
}

const HEADER = [
  '/**',
  ' * 자동 생성 파일 — 직접 편집하지 말 것.',
  ' *',
  ' * 생성: pnpm catalog:gen  (scripts/gen-facet-catalog.mts)',
  ' * 출처: 각 facet 의 facet.ts(title/description) + taxonomy/taxonomy.json(분야).',
  ' */',
  '',
];

function renderCatalog(catalog: FacetCatalog): string {
  const domains = catalog.domains.map((d) => `    ${JSON.stringify(d)},`).join('\n');
  const facets = catalog.facets.map((e) => `    ${JSON.stringify(e)},`).join('\n');
  return [
    ...HEADER,
    "import type { FacetCatalog } from '../catalog-types.js';",
    '',
    'export const CATALOG: FacetCatalog = {',
    `  locale: ${JSON.stringify(catalog.locale)},`,
    '  domains: [',
    domains,
    '  ],',
    '  facets: [',
    facets,
    '  ],',
    '};',
    '',
  ].join('\n');
}

function renderLoaders(locales: string[]): string {
  const rows = locales.map(
    (l) => `  ${JSON.stringify(l)}: () => import('./${l}.generated.js'),`,
  );
  return [
    ...HEADER,
    "import type { FacetCatalog } from '../catalog-types.js';",
    '',
    '/** 언어 → 그 언어 카탈로그 모듈. 경로가 정적 리터럴이어야 번들러가 chunk 로 가른다. */',
    'export const CATALOG_LOADERS: Record<string, () => Promise<{ CATALOG: FacetCatalog }>> = {',
    ...rows,
    '};',
    '',
  ].join('\n');
}

function renderFacetDomains(map: [string, string][]): string {
  const rows = map.map(([id, domain]) => `  ${JSON.stringify(id)}: ${JSON.stringify(domain)},`);
  return [
    ...HEADER,
    '/**',
    ' * facet id → 분야 id. 개념 메타의 `domain` 은 canonicalFacet 으로 여기서 찾는다.',
    ' * 손으로 적으면 호스트 카탈로그의 분야와 어긋나므로 선언하지 않는다.',
    ' */',
    'export const FACET_DOMAINS: Record<string, string> = {',
    ...rows,
    '};',
    '',
  ].join('\n');
}

/** 생성물 전부를 계산한다. 경로는 저장소 루트 기준. */
export async function buildCatalogOutputs(): Promise<CatalogOutput[]> {
  bootstrapFacet();
  const loaderIds = listFacetLoaderIds().sort();
  const taxonomy = readTaxonomy();
  const locales = listLocales();
  validateTaxonomy(taxonomy, loaderIds, locales);

  const jsons = new Map<string, NonNullable<ReturnType<typeof getFacetById>>>();
  for (const id of loaderIds) {
    const loaded = await loadFacet(id);
    if (!loaded) throw new Error(`loader 가 facet JSON 을 등록하지 않음: ${id}`);
    jsons.set(id, getFacetById(id) ?? loaded);
  }

  const outputs: CatalogOutput[] = [];
  for (const locale of locales) {
    const catalog: FacetCatalog = { locale, domains: [], facets: [] };
    for (const d of taxonomy.domains) {
      const subdomains = d.subdomains.filter((s) => s.facets.length > 0);
      if (subdomains.length === 0) continue;
      catalog.domains.push({
        id: d.id,
        name: d.name[locale]!,
        subdomains: subdomains.map((s) => ({ id: s.id, name: s.name[locale]! })),
      });
      for (const s of subdomains) {
        for (const id of s.facets) {
          const json = jsons.get(id)!;
          const description = resolveLocale(json.description, locale);
          catalog.facets.push({
            id,
            title: resolveLocale(json.title, locale),
            ...(description ? { description } : {}),
            domain: d.id,
            subdomain: s.id,
          });
        }
      }
    }
    outputs.push({ path: `${CATALOG_DIR}/${locale}.generated.ts`, text: renderCatalog(catalog) });
  }
  outputs.push({ path: `${CATALOG_DIR}/loaders.generated.ts`, text: renderLoaders(locales) });

  const domainOf: [string, string][] = taxonomy.domains
    .flatMap((d) => d.subdomains.flatMap((s) => s.facets.map((f): [string, string] => [f, d.id])))
    .sort((a, b) => a[0].localeCompare(b[0]));
  outputs.push({ path: FACET_DOMAINS_FILE, text: renderFacetDomains(domainOf) });

  return outputs;
}
