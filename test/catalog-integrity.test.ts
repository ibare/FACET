/**
 * 계획 카탈로그의 정합성 — `apps/playground/src/catalog.json`.
 *
 * 이 파일은 codegen 산출물이 아니라 **손으로 쓰는 계획서**다. 그래서 다른 어떤
 * 검사도 보지 않는다. `packages/bootstrap/test/catalog.test.ts` 는 구현된 facet 에서
 * 생성되는 언어별 카탈로그(`catalog/<locale>.generated.ts`)를 보고, 여기는 아직
 * 구현되지 않은 것까지 포함한 계획 전체를 본다. 분류가 겹치는 부분은 맨 아래
 * 묶음이 분류표(`taxonomy/taxonomy.json`)와 맞댄다.
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

const taxonomyPath = join(repoRoot, 'taxonomy/taxonomy.json');

const raw = readFileSync(catalogPath, 'utf8');
const domains = (JSON.parse(raw) as { domains: Domain[] }).domains;
const indexPage = readFileSync(indexPagePath, 'utf8');

type Taxonomy = {
  domains: {
    id: string;
    name: Record<string, string>;
    subdomains: { id: string; name: Record<string, string>; facets: string[] }[];
  }[];
};
const taxonomy = JSON.parse(readFileSync(taxonomyPath, 'utf8')) as Taxonomy;

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

  /*
   * 하한을 내린 적이 한 번 있다. 2026-09-11 계산 복잡도 완제품 배치에서 `reduction`
   * 토픽을 **판정에 따라 지웠다** — 손잡이 후보 둘이 다 무너졌고 주장이 `p-np` 와
   * 포개져, 잣대 둘이 약한 것은 만들지 않는다는 선(`UMAP` · `A*`)에 걸렸다. 조각
   * `reduce-to-known` 은 그대로 서고 `origin` 만 `p-np` 로 옮겼다.
   *
   * 그래서 1077 → 1076 이다. **이 검사가 제 할 일을 했다** — 줄어든 것을 잡았고,
   * 그것이 실수인지 판정인지는 사람이 갈랐다. 다음에 또 줄면 같은 물음을 다시 한다.
   *
   * 2026-09-25 프로그래밍 기초 완제품 판정에서 토픽 스물둘을 지웠다 — 버림 아홉
   * (분기 · 예외 처리 · 타입 변환 · 스코프 · 클로저 · 커링 · 추상화 · 캡슐화 · 모나드 기초)과
   * 완제품 일곱 안에 합친 열셋. 합친 토픽의 조각은 `origin` 을 완제품 토픽으로 옮겼다.
   * 사용자가 정했다 (`tasks/programming-fundamentals-whole-batch.md`). 1076 → 1054.
   *
   * 같은 날 운영체제 완제품 판정에서 열을 지웠다 — 완제품 안에 합친 일곱(SJF · MLFQ · 세마포어 ·
   * FIFO 페이지 교체 · Clock · FAT · DMA)과 버린 셋(PCB · 모니터 · 디렉토리 구조). 조각 origin 은
   * host 토픽으로 옮겼다. 사용자가 정했다 (`tasks/os-whole-batch.md`). 1054 → 1044.
   *
   * 같은 날 컴퓨터 네트워크 완제품 판정에서 열둘을 지웠다 — 완제품 안에 합친 아홉(데이터 링크 계층 ·
   * 전송 계층 · MAC · OSPF · BGP · ICMP · UDP · 흐름 제어 · WebSocket)과 버린 셋(응용 계층 · SMTP · FTP).
   * 조각 origin 은 host 토픽으로 옮겼다. 사용자가 정했다 (`tasks/network-whole-batch.md`). 1044 → 1032.
   *
   * 2026-09-26 데이터베이스 완제품 판정에서 열넷을 지웠다 — 완제품 안에 합친 열하나(2NF · 3NF · BCNF ·
   * OUTER JOIN · CROSS JOIN · Hash Index · 실행 계획 · 락 · 2PL · CAP · 키-값 DB)와 버린 셋(관계 · DDL ·
   * 파싱). 조각 origin 은 host 토픽으로 옮겼다. 사용자가 정했다 (`tasks/database-whole-batch.md`). 1032 → 1018.
   *
   * 같은 날 웹 런타임 완제품 판정에서 아홉을 지웠다 — 완제품 안에 합친 다섯(microtask-queue 의
   * 절반은 blocking-and-yield 로, virtual-dom-diff → keys-in-lists, update-batching →
   * dependency-tracking, frame-deadline 의 절반은 composited-animation 으로, script-blocking ·
   * resource-priority → critical-rendering-path)과 버린 넷(call-stack · task-queue ·
   * dom-and-cssom · animation-frame-callback). 조각 origin 은 host 토픽으로 옮겼다. 1018 → 1010.
   *
   * 같은 배치에서 둘을 더 지웠다 — `microtask-queue` · `frame-deadline` 은 절반만 완제품에 흡수되고
   * 나머지 조각(microtask-cuts-in · jank-vs-slow)은 완제품 없이 조각으로만 남기기로 판정했는데,
   * 컨테이너 항목을 남겨 뒀더니 `facetId` 없는 비피스 토픽이라 호스트 UI 가 "soon"(곧 나올 예정)으로
   * 잘못 표시했다 — 실제로는 "안 만들기로 정함"이지 "아직 못 만듦"이 아니다. 항목째 지웠다(조각의
   * `origin` 문자열은 그대로 둔다 — `concept-meta-batch-protocol.md` 규칙 2번이 이 모양을 다룬다).
   * 1010 → 1008.
   *
   * 같은 날 컴파일러와 언어 완제품 판정에서 다섯을 지웠다 — 완제품 안에 합친 넷(AST → cfg ·
   * 심볼 테이블 → scope-resolve · DFG → cfg-ir · 죽은 코드 제거 → constant-folding)과 버린 하나
   * (IR 설계 — 조각 lower-to-simpler 의 origin 은 cfg-ir 로). 조각 origin 은 host 토픽으로 옮겼다.
   * 사용자가 정했다 (`tasks/compilers-whole-batch.md`). 1008 → 1003.
   */
  it('규모가 줄지 않았다 — 실수로 잘려 나간 것을 잡는다', () => {
    expect(domains.length).toBeGreaterThanOrEqual(16);
    expect(rows.length).toBeGreaterThanOrEqual(1003);
  });
});

/*
 * 이 계획서는 분류표(`taxonomy/taxonomy.json`)를 따른다.
 *
 * 분야 · 하위 분야와 facet 의 소속은 한때 이 파일에만 있었다. 그런데 호스트에
 * 발행되는 카탈로그가 그 분류를 필요로 하게 되자, 발행물의 원본을 데모 앱 폴더의
 * 계획서에 둘 수는 없어 분류표를 따로 세웠다. 계획서는 아직 없는 토픽까지 담는
 * 제 역할이 있어 그대로 두고, 대신 겹치는 부분이 분류표와 어긋나지 않게 묶는다.
 */
describe('계획 카탈로그와 분류표', () => {
  it('분야 · 하위 분야의 id 와 순서가 분류표와 같다', () => {
    const plan = domains.map((d) => `${d.id}: ${d.subdomains.map((s) => s.id).join(' ')}`);
    const tax = taxonomy.domains.map((d) => `${d.id}: ${d.subdomains.map((s) => s.id).join(' ')}`);
    expect(plan).toEqual(tax);
  });

  it('분야 · 하위 분야의 이름이 분류표의 한국어 이름과 같다', () => {
    const plan = domains.flatMap((d) => [d.name, ...d.subdomains.map((s) => s.name)]);
    const tax = taxonomy.domains.flatMap((d) => [d.name.ko, ...d.subdomains.map((s) => s.name.ko)]);
    expect(plan).toEqual(tax);
  });

  it('구현된 토픽(facetId)이 분류표와 같은 하위 분야 · 같은 순서에 있다', () => {
    const plan = domains.flatMap((d) =>
      d.subdomains.map((s) => `${d.id}/${s.id}: ${s.topics.flatMap((t) => (t.facetId ? [t.facetId] : [])).join(' ')}`),
    );
    const tax = taxonomy.domains.flatMap((d) => d.subdomains.map((s) => `${d.id}/${s.id}: ${s.facets.join(' ')}`));
    expect(plan).toEqual(tax);
  });
});
