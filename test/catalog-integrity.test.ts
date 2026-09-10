/**
 * 계획 카탈로그의 정합성 — `apps/playground/src/catalog.json`.
 *
 * 이 파일은 codegen 산출물이 아니라 **손으로 쓰는 계획서**다. 그래서 다른 어떤
 * 검사도 보지 않는다. `packages/bootstrap/test/catalog.test.ts` 는 구현된 facet 에서
 * 생성되는 `facet-catalog.generated.ts` 를 보고, 여기는 아직 구현되지 않은 것까지
 * 포함한 계획 전체를 본다.
 *
 * 2026-09-10 확장에서 항목 245 개를 한 번에 넣다가 id 충돌 둘을 냈다 —
 * `traversal-order` 와 `halve-the-range` 가 이미 cs-fundamentals 의 조각 이름이었다.
 * 그때는 삽입 스크립트가 잡았으나 그 스크립트는 남지 않는 임시 파일이었다.
 * 손으로 한 줄 더 붙이는 다음 사람에게는 잡아 줄 것이 없다.
 *
 * id 가 겹치면 화면이 조용히 어긋난다 — 아코디언 key 와 라우팅이 topic id 로
 * 걸려 있어, 먼저 만난 항목이 나중 것을 가린다. 터지지 않고 사라진다.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

type Topic = {
  id: string;
  name: string;
  desc?: string;
  facetId?: string;
  kind?: 'piece';
  origin?: string;
};
type Subdomain = { id: string; name: string; topics: Topic[] };
type Domain = {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  accent: string;
  subdomains: Subdomain[];
};

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = join(repoRoot, 'apps/playground/src/catalog.json');
const indexPagePath = join(repoRoot, 'apps/playground/src/pages/IndexPage.tsx');

const raw = readFileSync(catalogPath, 'utf8');
const domains = (JSON.parse(raw) as { domains: Domain[] }).domains;
const indexPage = readFileSync(indexPagePath, 'utf8');

/** 모든 토픽을 도메인·서브도메인과 함께 편다. */
const rows = domains.flatMap((d) =>
  d.subdomains.flatMap((s) => s.topics.map((t) => ({ domain: d, subdomain: s, topic: t }))),
);

describe('계획 카탈로그', () => {
  it('topic id 가 전역에서 유일하다', () => {
    const seen = new Map<string, string>();
    const dup: string[] = [];
    for (const { domain, subdomain, topic } of rows) {
      const where = `${domain.id}·${subdomain.id}`;
      const prev = seen.get(topic.id);
      if (prev !== undefined) dup.push(`${topic.id} (${prev} / ${where})`);
      else seen.set(topic.id, where);
    }
    expect(dup).toEqual([]);
  });

  it('domain id 와 subdomain id 가 각각 유일하다', () => {
    const domainIds = domains.map((d) => d.id);
    const subdomainIds = domains.flatMap((d) => d.subdomains.map((s) => s.id));
    expect(new Set(domainIds).size).toBe(domainIds.length);
    expect(new Set(subdomainIds).size).toBe(subdomainIds.length);
  });

  /*
   * "조각은 desc 를 가진다" 로 재려다 접었다. `catalog.ts` 의 Topic 주석이 이미
   * "이름만으로 충분한 조각에는 없을 수 있다" 고 선언해 두었고, desc 없는 넷 중
   * 셋은 이름 자체가 주장 문장이다 (`같은 곳을 다시 밟는다`). 선언과 어긋나는
   * 검사를 세우면 지키는 쪽이 틀린 것이 되고, 그 검사는 곧 사문이 된다.
   *
   * 대신 기계가 판정할 수 있는 것만 본다 — 조각 표식과 desc 의 짝이 어긋나는 오기.
   */
  it('origin 은 조각만 가진다 — 완제품에 붙은 origin 은 kind 를 빠뜨린 오기다', () => {
    const stray = rows
      .filter(({ topic }) => topic.kind !== 'piece' && topic.origin !== undefined)
      .map(({ domain, topic }) => `${domain.id}·${topic.id}`);
    expect(stray).toEqual([]);
  });

  it('조각은 자기 자신을 origin 으로 삼지 않는다', () => {
    const selfRef = rows
      .filter(({ topic }) => topic.kind === 'piece' && topic.origin === topic.id)
      .map(({ domain, topic }) => `${domain.id}·${topic.id}`);
    expect(selfRef).toEqual([]);
  });

  it('facetId 는 facet: 접두를 가지고 중복되지 않는다', () => {
    const facetIds = rows.map((r) => r.topic.facetId).filter((v): v is string => v !== undefined);
    expect(facetIds.filter((v) => !v.startsWith('facet:'))).toEqual([]);
    expect(new Set(facetIds).size).toBe(facetIds.length);
  });

  /*
   * 새 도메인을 카탈로그에만 넣고 IndexPage 를 안 고치면 화면이 조용히 무너진다 —
   * 아이콘은 Cpu 로, 색은 cyan 으로 떨어져(accentOf 의 기본값) 다른 도메인과
   * 구별이 사라진다. 예외도 로그도 나지 않는다.
   */
  it('모든 도메인의 icon 과 accent 가 IndexPage 에 등록되어 있다', () => {
    const icons = new Set(
      /const ICONS: Record<string, PhIcon> = \{([\s\S]*?)\};/
        .exec(indexPage)?.[1]
        ?.split(/[,\s]+/)
        .filter(Boolean) ?? [],
    );
    const accents = new Set(
      [...(/const ACCENTS: Record<string, AccentTokens> = \{([\s\S]*?)\};/.exec(indexPage)?.[1] ?? '').matchAll(
        /(\w+):\s*tok\(/g,
      )].map((m) => m[1]),
    );
    // Tailwind v4 는 소스를 훑어 클래스를 뽑는다. 동적으로 조합한 색은 SAFELIST 에
    // 적어 두지 않으면 클래스 자체가 빌드에서 빠져 색이 통째로 사라진다.
    const safelisted = new Set(
      (/const colors = \[([^\]]*)\]/.exec(indexPage)?.[1] ?? '').split(',').map((s) => s.trim().replace(/'/g, '')),
    );

    const missing: string[] = [];
    for (const d of domains) {
      if (!icons.has(d.icon)) missing.push(`${d.id}: icon ${d.icon} 미등록`);
      if (!accents.has(d.accent)) missing.push(`${d.id}: accent ${d.accent} 미등록`);
      if (!safelisted.has(d.accent)) missing.push(`${d.id}: accent ${d.accent} 가 SAFELIST 에 없음`);
    }
    expect(missing).toEqual([]);
  });

  /*
   * 헤더 문구에 "12개 분야" 가 숫자로 박혀 있었다. 옆의 항목 수는 계산해 넣으면서
   * 도메인 수만 손으로 적어 둔 것이라, 도메인 넷을 더한 뒤에도 12 를 말했다.
   *
   * 틀린 숫자는 타입도 검사도 통과하고 띄워 본 사람만 안다. 카탈로그에서 세어
   * 넣으면 어긋날 자리가 없어진다.
   */
  it('IndexPage 가 카탈로그 규모를 숫자로 박아 두지 않는다', () => {
    const hardcoded = [...indexPage.matchAll(/[^}\w]\d+\s*개\s*(분야|시각화|조각|구현|예정)/g)].map((m) => m[0].trim());
    expect(hardcoded).toEqual([]);
  });

  it('규모가 줄지 않았다 — 실수로 잘려 나간 것을 잡는다', () => {
    expect(domains.length).toBeGreaterThanOrEqual(16);
    expect(rows.length).toBeGreaterThanOrEqual(1077);
  });
});
