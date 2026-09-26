/**
 * timestamp-vs-fingerprint — 같은 저장 하나를 시각 판정과 지문 판정이 나란히 받는다.
 *
 * 모형
 *   규칙은 "대상 ← 입력들". 규칙에 없는 입력은 소스(파일)다.
 *   시각 쪽 (make 꼴): 입력 가운데 대상보다 늦은(>) 것이 있으면 다시 세운다. 다시 세운 대상의 시각은
 *     저장 시각에서 시작한 시계가 세울 때마다 buildMinutes 만큼 간 값이다.
 *   지문 쪽 (내용 해시 꼴): 소스 입력은 지금 내용의 지문을 지난 빌드 때 적어 둔 지문과 견준다.
 *     대상 입력은 이번에 다시 세워졌으면 바뀜, 아니면 같음으로 본다. 다른 것이 하나라도 있으면 다시.
 *   지문은 FNV-1a 32 비트 (UTF-8 바이트, 소문자 16진 여덟 자). 화면에는 앞 여섯 자.
 *   대상은 규칙에 적힌 차례로 본다. 두 쪽이 같은 걸음에 같은 대상을 판정한다.
 *
 * 이벤트 (전부 silent 아님 — 걸음 하나씩)
 *   'save'  — 소스 하나를 다시 저장했다.
 *             payload: { file: string; at: number; was: number; printWas: string; printNow: string }
 *             at · was 는 분(시:분을 분으로 편 값), printWas · printNow 는 지문 여덟 자
 *   'judge' — 대상 하나를 두 쪽이 판정했다.
 *             payload: {
 *               target: string;
 *               time: { inputs: { name: string; at: number }[]; targetWas: number;
 *                       later: string[]; rebuilt: boolean; now: number };
 *                       (later = 대상보다 늦은 입력들, 시각 쪽이 넘어간 길)
 *               print: { sources: { name: string; now: string; recorded: string }[];
 *                        changed: string[]; rebuilt: boolean };
 *             }
 *
 * 걸음 0 (처음 시각 · 적어 둔 지문) 은 장면의 initial() 이 initialData 에서 채운다.
 * 걸음 0 이 이미 읽을 화면이라 첫 발신 앞에 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BuildRule = { target: string; inputs: string[] };
export type SourceFile = { name: string; content: string };
export type FileTime = { name: string; at: string };

export type TimestampVsFingerprintFacetData = {
  type: 'timestamp-vs-fingerprint';
  stepMs: number;
  rules: BuildRule[];
  sources: SourceFile[];
  /** 지난 빌드 뒤의 시각 (시:분). 소스와 대상 모두 */
  times: FileTime[];
  /** 사건 — 이 소스를 이 시각에 이 내용으로 다시 저장한다 */
  save: { file: string; at: string; content: string };
  /** 대상 하나를 세우는 데 드는 분 */
  buildMinutes: number;
};

/** FNV-1a 32 비트 지문 — UTF-8 바이트 위, 소문자 16진 여덟 자. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(text)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 화면에 보이는 지문 — 앞 여섯 자. */
export function shortPrint(print: string): string {
  return print.slice(0, 6);
}

/** "09:10" → 분. 모양이 틀리면 던진다. */
export function parseTime(text: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(text);
  if (!m) throw new Error(`시각 모양이 아니다: "${text}"`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`시각 범위 밖: "${text}"`);
  return h * 60 + min;
}

/** 분 → "09:10". */
export function formatTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 24 * 60) {
    throw new Error(`셈할 수 없는 시각: ${minutes}`);
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 규칙과 소스를 맞춰 보고 이름마다 깊이를 셈한다 (소스 0, 대상은 입력 가운데 가장 깊은 것 + 1). */
export function depthOf(rules: readonly BuildRule[], sources: readonly SourceFile[]): Map<string, number> {
  const depth = new Map<string, number>();
  for (const s of sources) {
    if (depth.has(s.name)) throw new Error(`소스 이름이 겹친다: ${s.name}`);
    depth.set(s.name, 0);
  }
  for (const r of rules) {
    if (depth.has(r.target)) throw new Error(`대상 이름이 겹친다: ${r.target}`);
    if (r.inputs.length === 0) throw new Error(`입력이 없는 규칙: ${r.target}`);
    let d = 0;
    for (const i of r.inputs) {
      const di = depth.get(i);
      // 규칙은 제 입력이 앞에 적힌 차례로 온다 — 아니면 모르는 이름이거나 고리다
      if (di === undefined) throw new Error(`모르는 입력 ${i} (${r.target})`);
      d = Math.max(d, di + 1);
    }
    depth.set(r.target, d);
  }
  return depth;
}

/** 지난 빌드 때 대상마다 적어 둔 소스 입력의 지문. */
export function recordedPrints(
  rules: readonly BuildRule[],
  sources: readonly SourceFile[],
): Map<string, Map<string, string>> {
  const content = new Map(sources.map((s) => [s.name, s.content] as const));
  const out = new Map<string, Map<string, string>>();
  for (const r of rules) {
    const m = new Map<string, string>();
    for (const i of r.inputs) {
      const c = content.get(i);
      if (c !== undefined) m.set(i, fingerprint(c));
    }
    out.set(r.target, m);
  }
  return out;
}

export async function timestampVsFingerprint(
  ctxBase: FacetContext<TimestampVsFingerprintFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<TimestampVsFingerprintFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  depthOf(data.rules, data.sources);
  const targets = new Set(data.rules.map((r) => r.target));
  const recorded = recordedPrints(data.rules, data.sources);

  // 시각 — 소스와 대상 모두 있어야 한다
  const time = new Map<string, number>();
  for (const f of data.times) time.set(f.name, parseTime(f.at));
  for (const name of [...data.sources.map((s) => s.name), ...targets]) {
    if (!time.has(name)) throw new Error(`시각이 없다: ${name}`);
  }
  // 지금 내용
  const content = new Map(data.sources.map((s) => [s.name, s.content] as const));

  // 사건: 저장
  const was = content.get(data.save.file);
  const savedWas = time.get(data.save.file);
  if (was === undefined || savedWas === undefined) throw new Error(`저장할 소스가 없다: ${data.save.file}`);
  const saveAt = parseTime(data.save.at);
  if (!Number.isInteger(data.buildMinutes) || data.buildMinutes <= 0) {
    throw new Error(`세우는 분이 셈할 수 없다: ${data.buildMinutes}`);
  }

  // 걸음 0 이 이미 읽을 화면이다
  if (!(await pause())) return;
  content.set(data.save.file, data.save.content);
  time.set(data.save.file, saveAt);
  await ctx.emit({
    type: 'save',
    target: `node:${data.save.file}`,
    payload: {
      file: data.save.file,
      at: saveAt,
      was: savedWas,
      printWas: fingerprint(was),
      printNow: fingerprint(data.save.content),
    },
  });

  let clock = saveAt;
  const printRebuilt = new Set<string>();
  for (const rule of data.rules) {
    if (!(await pause())) return;
    const x = rule.target;
    const targetWas = time.get(x);
    if (targetWas === undefined) throw new Error(`시각이 없다: ${x}`);

    // 시각 쪽
    const inputs = rule.inputs.map((name) => {
      const at = time.get(name);
      if (at === undefined) throw new Error(`시각이 없다: ${name}`);
      return { name, at };
    });
    const later = inputs.filter((i) => i.at > targetWas).map((i) => i.name);
    const timeRebuilt = later.length > 0;
    let timeNow = targetWas;
    if (timeRebuilt) {
      clock += data.buildMinutes;
      timeNow = clock;
      time.set(x, timeNow);
    }

    // 지문 쪽
    const rec = recorded.get(x);
    if (!rec) throw new Error(`적어 둔 지문이 없다: ${x}`);
    const sources: { name: string; now: string; recorded: string }[] = [];
    const changed: string[] = [];
    for (const i of rule.inputs) {
      const c = content.get(i);
      if (c !== undefined) {
        const r = rec.get(i);
        if (r === undefined) throw new Error(`적어 둔 지문이 없다: ${x} ← ${i}`);
        const now = fingerprint(c);
        sources.push({ name: i, now, recorded: r });
        if (now !== r) changed.push(i);
      } else if (targets.has(i)) {
        if (printRebuilt.has(i)) changed.push(i);
      } else {
        throw new Error(`모르는 입력 ${i} (${x})`);
      }
    }
    const printRebuiltNow = changed.length > 0;
    if (printRebuiltNow) printRebuilt.add(x);

    await ctx.emit({
      type: 'judge',
      target: `node:${x}`,
      payload: {
        target: x,
        time: { inputs, targetWas, later, rebuilt: timeRebuilt, now: timeNow },
        print: { sources, changed, rebuilt: printRebuiltNow },
      },
    });
  }
}
