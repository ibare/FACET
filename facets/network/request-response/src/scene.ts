/**
 * request-response 의 장면.
 *
 * - 바탕 `base` — 호스트와 서버의 자원 표 (initialData 에서 베낀다)
 * - 자취 `queue` · `log` — 지금 물을 줄, 지금까지 나간 요청과 돌아온 응답
 * - 이번 걸음 `step` — 시작 · 요청 · 응답
 *
 * 줄과 상태 줄은 알고리즘이 셈해 보낸다. 장면은 그것을 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type RequestResponseBase = {
  host: string;
  start: string;
  resources: { path: string; refs: string[] }[];
};

export type RequestResponseExchange = {
  path: string;
  line: string;
  /** 돌아온 상태 줄. 아직 안 왔으면 null */
  status: string | null;
  code: number | null;
  found: boolean | null;
};

export type RequestResponseStep =
  | { kind: 'start' }
  | { kind: 'request'; path: string; line: string }
  | { kind: 'response'; path: string; status: string; code: number; found: boolean; refs: string[]; added: string[] };

export type RequestResponseScene = {
  base: RequestResponseBase;
  queue: string[];
  log: RequestResponseExchange[];
  step: RequestResponseStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function strings(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`request-response 장면: ${what} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`request-response 장면: ${what} 에 글자 아닌 것`);
    return x;
  });
}

function str(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`request-response 장면: ${key} 가 없다`);
  return v;
}

/** 넘겨받은 자료가 비었으면 빈 바탕 (전수 검사는 config 없이 마운트한다). */
function readBase(initialData: unknown): { base: RequestResponseBase; queue: string[] } {
  if (!isRecord(initialData) || typeof initialData.start !== 'string' || !Array.isArray(initialData.resources)) {
    return { base: { host: '', start: '', resources: [] }, queue: [] };
  }
  const resources = initialData.resources.map((r) => {
    if (!isRecord(r) || typeof r.path !== 'string') {
      throw new Error('request-response 장면: 자원 표의 한 줄에 경로가 없다');
    }
    return { path: r.path, refs: strings(r.refs, 'refs') };
  });
  const host = typeof initialData.host === 'string' ? initialData.host : '';
  return {
    base: { host, start: initialData.start, resources },
    queue: [initialData.start],
  };
}

export const requestResponseScene: ScenePlan<RequestResponseScene> = {
  initial(initialData: unknown): RequestResponseScene {
    const { base, queue } = readBase(initialData);
    return { base, queue, log: [], step: { kind: 'start' } };
  },

  reduce(scene: RequestResponseScene, event: FacetRuntimeEvent): RequestResponseScene {
    const p = event.payload;
    if (event.type === 'request') {
      if (!isRecord(p)) throw new Error('request-response 장면: request 에 payload 가 없다');
      const path = str(p, 'path');
      const line = str(p, 'line');
      return {
        base: scene.base,
        queue: strings(p.queue, 'queue'),
        log: [...scene.log, { path, line, status: null, code: null, found: null }],
        step: { kind: 'request', path, line },
      };
    }
    if (event.type === 'response') {
      if (!isRecord(p)) throw new Error('request-response 장면: response 에 payload 가 없다');
      const path = str(p, 'path');
      const status = str(p, 'status');
      if (typeof p.found !== 'boolean') throw new Error('request-response 장면: found 가 없다');
      const found = p.found;
      if (typeof p.code !== 'number') throw new Error('request-response 장면: code 가 없다');
      const code = p.code;
      const last = scene.log[scene.log.length - 1];
      if (last === undefined || last.path !== path || last.status !== null) {
        // 묻지 않은 것에 대한 응답 — 이 모형에서는 일어날 수 없다
        throw new Error(`request-response 장면: 나간 요청 없이 온 응답 — ${path}`);
      }
      return {
        base: scene.base,
        queue: strings(p.queue, 'queue'),
        log: [...scene.log.slice(0, -1), { ...last, status, code, found }],
        step: {
          kind: 'response',
          path,
          status,
          code,
          found,
          refs: strings(p.refs, 'refs'),
          added: strings(p.added, 'added'),
        },
      };
    }
    throw new Error(`request-response 장면: 모르는 이벤트 — ${event.type}`);
  },
};
