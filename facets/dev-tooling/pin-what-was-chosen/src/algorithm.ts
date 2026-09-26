/**
 * pin-what-was-chosen — 잠금 파일: 첫 설치가 고른 버전을 적고, 둘째 설치가 범위보다 먼저 그것을 읽는다.
 *
 * 첫 설치(잠금 없음)는 요구마다 공개된 버전 가운데 범위 안 가장 큰 것을 고른다. 고른 것을 한 걸음에
 * 잠금 파일에 적는다. 그 뒤 새 버전이 나온다(범위 안인지는 여기서 셈해 싣는다). 둘째 설치(잠금 있음)는
 * 범위를 다시 풀지 않고 잠금 파일의 버전을 그대로 가져온다. 잠긴 버전이 범위를 벗어나면 던진다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음이다):
 *   install-first   payload { name: string; range: string; version: string }
 *                   첫 설치가 꾸러미 하나를 고름. version = 범위 안 가장 큰 공개 버전
 *   lock-write      payload { entries: { name: string; version: string }[] }
 *                   첫 설치가 고른 것을 잠금 파일에 한꺼번에 적음 (요구 차례)
 *   release         payload { versions: { name: string; version: string; inRange: boolean }[] }
 *                   나중에 나온 버전이 공개됨. inRange = 그 꾸러미 요구의 범위 안인가
 *   install-second  payload { name: string; version: string }
 *                   둘째 설치가 잠금 파일의 버전을 그대로 가져옴
 *
 * 걸음 0 은 initialData 에서 장면이 채운다 (요구 · 공개된 버전 · 잠금 없음). 읽을 것이 있는 화면이라
 * 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Want = { name: string; range: string };
export type Shelf = { name: string; versions: string[] };

export type PinWhatWasChosenFacetData = {
  type: 'pin-what-was-chosen';
  stepMs: number;
  /** 요구 — 이름 사전순 */
  wants: Want[];
  /** 첫날 공개된 버전 */
  published: Shelf[];
  /** 잠금 파일에 적은 뒤 나온 버전 */
  later: Shelf[];
};

// ---------------------------------------------------------------- 버전 모형

type Triple = readonly [number, number, number];

/** `major.minor.patch` 세 수. 다른 모양은 던진다 (앞붙이 · 프리릴리스 · 빌드 표식 없음). */
export function parseVersion(v: string): Triple {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`pin-what-was-chosen: 모르는 버전 모양 ${JSON.stringify(v)}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareTriple(a: Triple, b: Triple): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return 0;
}

/** 수로 견준다 — `1.10.0` > `1.9.4`. */
export function compareVersions(a: string, b: string): number {
  return compareTriple(parseVersion(a), parseVersion(b));
}

/** 범위를 두 끝으로 푼다 — [아래 포함, 위 제외). 캐럿(0.x 특례 포함) · 틸드만 안다. */
export function rangeBounds(range: string): { low: Triple; high: Triple } {
  const op = range.slice(0, 1);
  const [M, m, p] = parseVersion(range.slice(1));
  if (op === '^') {
    if (M > 0) return { low: [M, m, p], high: [M + 1, 0, 0] };
    if (m > 0) return { low: [0, m, p], high: [0, m + 1, 0] };
    return { low: [0, 0, p], high: [0, 0, p + 1] };
  }
  if (op === '~') return { low: [M, m, p], high: [M, m + 1, 0] };
  throw new Error(`pin-what-was-chosen: 모르는 범위 모양 ${JSON.stringify(range)}`);
}

export function inRange(version: string, range: string): boolean {
  const { low, high } = rangeBounds(range);
  const v = parseVersion(version);
  return compareTriple(v, low) >= 0 && compareTriple(v, high) < 0;
}

/** 범위 안 가장 큰 것. 범위 안이 비면 던진다. */
export function maxSatisfying(versions: readonly string[], range: string): string {
  let best: string | null = null;
  for (const v of versions) {
    if (!inRange(v, range)) continue;
    if (best === null || compareVersions(v, best) > 0) best = v;
  }
  if (best === null) throw new Error(`pin-what-was-chosen: ${range} 를 채우는 공개 버전이 없다`);
  return best;
}

// ---------------------------------------------------------------- 자료 좁히기

function readString(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') throw new Error(`pin-what-was-chosen: ${where}.${key} 가 문자열이 아니다`);
  return v;
}

function readRecord(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`pin-what-was-chosen: ${where} 가 객체가 아니다`);
  }
  return v as Record<string, unknown>;
}

function readArray(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`pin-what-was-chosen: ${where} 가 배열이 아니다`);
  return v;
}

function readShelves(v: unknown, where: string): Shelf[] {
  return readArray(v, where).map((raw, i) => {
    const o = readRecord(raw, `${where}[${i}]`);
    const versions = readArray(o['versions'], `${where}[${i}].versions`).map((x, j) => {
      if (typeof x !== 'string') throw new Error(`pin-what-was-chosen: ${where}[${i}].versions[${j}] 가 문자열이 아니다`);
      parseVersion(x);
      return x;
    });
    return { name: readString(o, 'name', `${where}[${i}]`), versions };
  });
}

/** initialData 를 좁힌다. 모양이 틀리면 던진다. 장면도 이것을 쓴다. */
export function readPinData(raw: unknown): PinWhatWasChosenFacetData {
  const o = readRecord(raw, 'initialData');
  if (o['type'] !== 'pin-what-was-chosen') throw new Error('pin-what-was-chosen: initialData.type 이 다르다');
  const stepMs = o['stepMs'];
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('pin-what-was-chosen: stepMs 가 양수가 아니다');
  const wants = readArray(o['wants'], 'wants').map((raw2, i) => {
    const w = readRecord(raw2, `wants[${i}]`);
    const range = readString(w, 'range', `wants[${i}]`);
    rangeBounds(range);
    return { name: readString(w, 'name', `wants[${i}]`), range };
  });
  for (let i = 1; i < wants.length; i += 1) {
    if (!(wants[i - 1]!.name < wants[i]!.name)) {
      throw new Error('pin-what-was-chosen: 요구가 이름 사전순이 아니다');
    }
  }
  return {
    type: 'pin-what-was-chosen',
    stepMs,
    wants,
    published: readShelves(o['published'], 'published'),
    later: readShelves(o['later'], 'later'),
  };
}

function shelfOf(shelves: readonly Shelf[], name: string, where: string): string[] {
  const s = shelves.find((x) => x.name === name);
  if (!s) throw new Error(`pin-what-was-chosen: ${where} 에 ${name} 의 목록이 없다`);
  return s.versions;
}

function wantOf(wants: readonly Want[], name: string): Want {
  const w = wants.find((x) => x.name === name);
  if (!w) throw new Error(`pin-what-was-chosen: ${name} 를 부르는 요구가 없다`);
  return w;
}

// ---------------------------------------------------------------- 알고리즘

export async function pinWhatWasChosen(ctx0: FacetContext<PinWhatWasChosenFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<PinWhatWasChosenFacetData>;
  const data = readPinData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 첫 설치 — 잠금이 없으니 범위를 푼다
  const chosen: { name: string; version: string }[] = [];
  for (const want of data.wants) {
    if (!(await pause())) return;
    const version = maxSatisfying(shelfOf(data.published, want.name, 'published'), want.range);
    chosen.push({ name: want.name, version });
    await ctx.emit({ type: 'install-first', payload: { name: want.name, range: want.range, version } });
  }

  // 한 걸음에 잠금 파일에 적는다
  if (!(await pause())) return;
  const lock = chosen.map((c) => ({ ...c }));
  await ctx.emit({ type: 'lock-write', payload: { entries: lock.map((c) => ({ ...c })) } });

  // 새 버전이 나온다 — 둘이 함께
  if (!(await pause())) return;
  const released: { name: string; version: string; inRange: boolean }[] = [];
  for (const shelf of data.later) {
    if (ctx.cancelled) return;
    const want = wantOf(data.wants, shelf.name);
    for (const version of shelf.versions) {
      if (ctx.cancelled) return;
      released.push({ name: shelf.name, version, inRange: inRange(version, want.range) });
    }
  }
  await ctx.emit({ type: 'release', payload: { versions: released } });

  // 둘째 설치 — 범위보다 잠금 파일을 먼저 읽는다
  for (const want of data.wants) {
    if (!(await pause())) return;
    const line = lock.find((l) => l.name === want.name);
    if (!line) throw new Error(`pin-what-was-chosen: 잠금 파일에 ${want.name} 의 줄이 없다`);
    if (!inRange(line.version, want.range)) {
      throw new Error(`pin-what-was-chosen: 잠긴 ${want.name} ${line.version} 가 요구 ${want.range} 를 벗어난다`);
    }
    await ctx.emit({ type: 'install-second', payload: { name: want.name, version: line.version } });
  }
}
