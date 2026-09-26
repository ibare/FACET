/**
 * @ffacet/algorithm-preload-hint — CSS 안에서만 불리는 자원(hero.jpg)을
 * `<link rel="preload">` 로 미리 알려 두면, 그 자원의 요청이 실제로 필요해지기
 * (첫 스타일 계산) 전에 이미 출발해 있음을 보인다.
 *
 * 이벤트 (silent 없음 — 여섯 걸음 모두 화면에 뜬다)
 *   line-read          { id: string; ms: number; resource?: string }
 *                       문서 줄 하나를 읽는다. `resource` 가 있으면 그 줄 끝에서
 *                       그 자원을 요청한 것이다 (preload · css 줄).
 *   parse-end          { ms: number; ids: string[] }
 *                       남은 본문 줄을 읽고 파싱이 끝난다.
 *   resource-needed    { ms: number; styleFile: string; file: string;
 *                        receivedMs: number; totalMs: number; percent: number }
 *                       styleFile(스타일시트)가 도착해 첫 스타일 계산이 열리고,
 *                       그 규칙이 file 을 처음 부른다. file 은 이미 receivedMs 만큼
 *                       받는 중이다.
 *   first-paint        { ms: number }
 *                       첫 장. 늦게 불린 자원은 아직 안 와 그 칸이 빈 채 그려진다.
 *   resource-arrived   { ms: number; file: string; slotId: string }
 *                       늦게 불린 자원이 도착해 slotId 칸을 채운다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 파서가 문서 줄 하나를 읽는 데 쓰는 시간(ms) — common.md 의 로딩 모형 상수. */
const PARSE_MS = 10;

export type DocLineKind = 'preload' | 'css' | 'text';

export type DocLine = {
  id: string;
  kind: DocLineKind;
  /** 문서에 그대로 실린 HTML 줄 — native 표기, 번역하지 않는 자료. */
  code: string;
  /** preload · css 줄이 요청하는 자원 파일 이름. */
  resource?: string;
};

export type CssRule = {
  /** CSS 규칙 리터럴 — native 표기, 번역하지 않는 자료. */
  code: string;
  /** 이 규칙이 스타일을 입히는 문서 줄의 id. */
  slotId: string;
  /** 규칙 안 url() 이 가리키는, CSS 안에서만 불리는(늦게 발견되는) 자원. */
  refResource: string;
};

export type ResourceSpec = {
  file: string;
  /** 받기 소요 ms. */
  durationMs: number;
};

export type PreloadHintFacetData = {
  type: 'preload-hint';
  stepMs: number;
  docLines: DocLine[];
  cssRule: CssRule;
  resources: ResourceSpec[];
};

function findResource(resources: ResourceSpec[], file: string, where: string): ResourceSpec {
  const found = resources.find((r) => r.file === file);
  if (!found) throw new Error(`preload-hint: ${where} 이 모르는 자원 '${file}' 을 가리킨다`);
  return found;
}

function findLine(lines: DocLine[], id: string, where: string): DocLine {
  const found = lines.find((l) => l.id === id);
  if (!found) throw new Error(`preload-hint: ${where} 이 모르는 줄 '${id}' 을 가리킨다`);
  return found;
}

type Schedule = {
  /** 자원 파일 → 요청이 나간 ms. */
  requestMs: Map<string, number>;
  /** 마지막 줄을 다 읽은 ms. */
  parseEndMs: number;
  /** 첫 장의 ms (막는 css 가 모두 도착하고, 본문이 하나 이상 읽힌 가장 이른 때). */
  firstPaintMs: number;
  /** file 의 도착 ms. 요청된 적 없는 file 이면 던진다. */
  arrivalMs: (file: string) => number;
};

/**
 * docLines · resources 에서 요청 시각 · 파싱 끝 · 첫 장을 셈한다.
 *
 * 이 조각의 문서는 스크립트도 async/defer 도 없으므로, common.md 의 일반
 * 모형을 이 문서 하나만 감당하도록 줄인 것이다 — 줄을 차례로 읽으며 preload·css
 * 줄에서 요청을 내고, 다 읽은 뒤 그때까지 요청한 막는 css 가 모두 도착하는
 * 시점을 첫 장으로 잡는다.
 */
function computeSchedule(data: PreloadHintFacetData): Schedule {
  if (data.docLines.length === 0) throw new Error('preload-hint: docLines 가 비어 있다');
  const requestMs = new Map<string, number>();
  const blockingCss: string[] = [];
  let ms = 0;
  for (let i = 0; i < data.docLines.length; i += 1) {
    const line = data.docLines[i]!;
    ms += PARSE_MS;
    if (line.kind === 'preload' || line.kind === 'css') {
      if (!line.resource) throw new Error(`preload-hint: 줄 ${i}('${line.id}') 은 ${line.kind} 인데 resource 가 없다`);
      findResource(data.resources, line.resource, `줄 ${i}('${line.id}')`);
      if (!requestMs.has(line.resource)) requestMs.set(line.resource, ms);
      if (line.kind === 'css') blockingCss.push(line.resource);
    } else if (line.kind !== 'text') {
      throw new Error(`preload-hint: 줄 ${i}('${line.id}') 의 kind '${String(line.kind)}' 를 모른다`);
    }
  }
  const parseEndMs = ms;
  const arrivalMs = (file: string): number => {
    const req = requestMs.get(file);
    if (req === undefined) throw new Error(`preload-hint: '${file}' 은 요청된 적이 없다`);
    const spec = findResource(data.resources, file, `'${file}'`);
    return req + spec.durationMs;
  };
  let firstPaintMs = parseEndMs;
  for (const file of blockingCss) firstPaintMs = Math.max(firstPaintMs, arrivalMs(file));
  return { requestMs, parseEndMs, firstPaintMs, arrivalMs };
}

export async function preloadHint(ctx: FacetContext<PreloadHintFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<PreloadHintFacetData>;
  const data = rc.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  const preloadLine = data.docLines.find((l) => l.kind === 'preload');
  if (!preloadLine || !preloadLine.resource) throw new Error('preload-hint: preload 줄이 없다');
  const linkLine = data.docLines.find((l) => l.kind === 'css');
  if (!linkLine || !linkLine.resource) throw new Error('preload-hint: css 줄이 없다');
  const textLines = data.docLines.filter((l) => l.kind === 'text');
  if (textLines.length === 0) throw new Error('preload-hint: 본문 줄이 없다');
  findLine(data.docLines, data.cssRule.slotId, 'cssRule.slotId');
  findResource(data.resources, data.cssRule.refResource, 'cssRule.refResource');

  const schedule = computeSchedule(data);

  // 걸음 0(초기 장면)은 문서 넉 줄과 CSS 규칙이 이미 보이는 화면이라 읽을 틈을 준다.
  if (!(await pause())) return;

  const preloadMs = schedule.requestMs.get(preloadLine.resource);
  if (preloadMs === undefined) throw new Error('preload-hint: preload 자원의 요청 시각을 못 찾았다');
  await ctx.emit({
    type: 'line-read',
    payload: { id: preloadLine.id, ms: preloadMs, resource: preloadLine.resource },
  });
  if (!(await pause())) return;

  const linkMs = schedule.requestMs.get(linkLine.resource);
  if (linkMs === undefined) throw new Error('preload-hint: css 자원의 요청 시각을 못 찾았다');
  await ctx.emit({
    type: 'line-read',
    payload: { id: linkLine.id, ms: linkMs, resource: linkLine.resource },
  });
  if (!(await pause())) return;

  await ctx.emit({
    type: 'parse-end',
    payload: { ms: schedule.parseEndMs, ids: textLines.map((l) => l.id) },
  });
  if (!(await pause())) return;

  const refResource = data.cssRule.refResource;
  const refSpec = findResource(data.resources, refResource, 'cssRule.refResource');
  const refRequestMs = schedule.requestMs.get(refResource);
  if (refRequestMs === undefined) {
    throw new Error(
      `preload-hint: '${refResource}' 이 첫 장 전에 요청되지 않았다 — 이 조각은 이미 받는 중인 경우만 다룬다`,
    );
  }
  const receivedMs = schedule.firstPaintMs - refRequestMs;
  if (receivedMs < 0 || receivedMs > refSpec.durationMs) {
    throw new Error(`preload-hint: '${refResource}' 의 받은 몫이 범위 밖이다 (${receivedMs}/${refSpec.durationMs})`);
  }
  const percent = Math.round((100 * receivedMs) / refSpec.durationMs);
  await ctx.emit({
    type: 'resource-needed',
    payload: {
      ms: schedule.firstPaintMs,
      styleFile: linkLine.resource,
      file: refResource,
      receivedMs,
      totalMs: refSpec.durationMs,
      percent,
    },
  });
  if (!(await pause())) return;

  await ctx.emit({ type: 'first-paint', payload: { ms: schedule.firstPaintMs } });
  if (!(await pause())) return;

  const arriveMs = schedule.arrivalMs(refResource);
  await ctx.emit({
    type: 'resource-arrived',
    payload: { ms: arriveMs, file: refResource, slotId: data.cssRule.slotId },
  });
}
