/**
 * stateless-needs-token 의 장면.
 *
 * 바탕  windows (창 식별자 차례) — initial 이 initialData 에서 베낀다
 * 자취  table (세션 표 줄) · jars (창마다 쿠키 보관) · answers (창에 닿은 응답)
 * 지금  desk (서버가 지금 쥔 요청, 없으면 null) · step (이번 걸음)
 *
 * 장면은 셈하지 않는다 — 응답 코드 · 알아본 사람 · 적은 줄은 알고리즘이 이벤트로 싣는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type HeldRequest = {
  index: number;
  window: string;
  method: string;
  path: string;
  cookie: string | null;
  body: string | null;
};

export type Answer = {
  index: number;
  window: string;
  code: number;
  reason: string;
  setCookie: string | null;
  who: string | null;
  items: string[];
};

export type SessionRow = { sid: string; user: string };

export type StatelessStep =
  | { kind: 'idle' }
  | { kind: 'send'; index: number; window: string; carried: boolean }
  | {
      kind: 'respond';
      index: number;
      window: string;
      /** 비워지기 전 서버가 쥐고 있던 요청 — 운동이 여기서 출발한다 */
      was: HeldRequest;
      wrote: SessionRow | null;
      matched: string | null;
    };

export type StatelessNeedsTokenScene = {
  windows: string[];
  table: SessionRow[];
  jars: Record<string, string | null>;
  answers: Answer[];
  desk: HeldRequest | null;
  step: StatelessStep;
};

function readWindows(initialData: unknown): string[] {
  if (typeof initialData !== 'object' || initialData === null) return [];
  const raw = (initialData as { windows?: unknown }).windows;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const w of raw) {
    if (typeof w !== 'string') throw new Error(`창 식별자가 글자가 아니다 — ${String(w)}`);
    out.push(w);
  }
  return out;
}

function str(o: Record<string, unknown>, key: string, ev: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`${ev}: ${key} 가 글자가 아니다`);
  return v;
}

function num(o: Record<string, unknown>, key: string, ev: string): number {
  const v = o[key];
  if (typeof v !== 'number') throw new Error(`${ev}: ${key} 가 수가 아니다`);
  return v;
}

function strOrNull(o: Record<string, unknown>, key: string, ev: string): string | null {
  const v = o[key];
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error(`${ev}: ${key} 가 글자도 null 도 아니다`);
  return v;
}

function rowOrNull(o: Record<string, unknown>, key: string, ev: string): SessionRow | null {
  const v = o[key];
  if (v === null) return null;
  if (typeof v !== 'object' || v === undefined) throw new Error(`${ev}: ${key} 가 줄이 아니다`);
  const r = v as Record<string, unknown>;
  return { sid: str(r, 'sid', ev), user: str(r, 'user', ev) };
}

function strings(o: Record<string, unknown>, key: string, ev: string): string[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`${ev}: ${key} 가 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`${ev}: ${key} 에 글자 아닌 것`);
    return x;
  });
}

export const statelessNeedsTokenScene: ScenePlan<StatelessNeedsTokenScene> = {
  initial(initialData: unknown): StatelessNeedsTokenScene {
    const windows = readWindows(initialData);
    const jars: Record<string, string | null> = {};
    for (const w of windows) jars[w] = null;
    return { windows: [...windows], table: [], jars, answers: [], desk: null, step: { kind: 'idle' } };
  },

  reduce(scene: StatelessNeedsTokenScene, event: FacetRuntimeEvent): StatelessNeedsTokenScene {
    const p = event.payload;
    if (typeof p !== 'object' || p === null) throw new Error(`${event.type}: payload 가 객체가 아니다`);
    const o = p as Record<string, unknown>;

    if (event.type === 'send') {
      const held: HeldRequest = {
        index: num(o, 'index', 'send'),
        window: str(o, 'window', 'send'),
        method: str(o, 'method', 'send'),
        path: str(o, 'path', 'send'),
        cookie: strOrNull(o, 'cookie', 'send'),
        body: strOrNull(o, 'body', 'send'),
      };
      return {
        ...scene,
        desk: held,
        step: { kind: 'send', index: held.index, window: held.window, carried: held.cookie !== null },
      };
    }

    if (event.type === 'respond') {
      const was = scene.desk;
      if (was === null) throw new Error('respond: 서버가 쥔 요청이 없는데 응답이 왔다');
      const answer: Answer = {
        index: num(o, 'index', 'respond'),
        window: str(o, 'window', 'respond'),
        code: num(o, 'code', 'respond'),
        reason: str(o, 'reason', 'respond'),
        setCookie: strOrNull(o, 'setCookie', 'respond'),
        who: strOrNull(o, 'who', 'respond'),
        items: strings(o, 'items', 'respond'),
      };
      const wrote = rowOrNull(o, 'wrote', 'respond');
      const matched = strOrNull(o, 'matched', 'respond');
      const table = scene.table.map((r) => ({ ...r }));
      if (wrote !== null) table.push({ ...wrote });
      const jars = { ...scene.jars };
      if (answer.setCookie !== null) jars[answer.window] = answer.setCookie;
      return {
        windows: [...scene.windows],
        table,
        jars,
        answers: [...scene.answers.map((a) => ({ ...a, items: [...a.items] })), answer],
        desk: null,
        step: { kind: 'respond', index: answer.index, window: answer.window, was: { ...was }, wrote, matched },
      };
    }

    throw new Error(`모르는 이벤트 ${event.type}`);
  },
};
