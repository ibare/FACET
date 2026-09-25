/**
 * request-response — 물은 것만 답으로 온다. 답 안에서 새로 알게 된 이름은 다시 물어야 온다.
 *
 * 모형 (실제 프로토콜을 줄인 자리):
 * - 연결 하나, 한 번에 요청 하나. 앞 응답이 다 온 뒤에 다음 요청이 나간다
 *   (파이프라이닝 없음 · 연결 여럿 없음. 실제 브라우저는 여러 연결로 동시에 묻는다).
 * - 물을 줄은 발견한 차례(FIFO). 응답 본문에 적힌 차례대로 줄 끝에 붙이고,
 *   이미 물었거나 줄에 있는 경로는 다시 넣지 않는다.
 * - 서버의 자원 표에 있으면 200, 없으면 404. 404 응답은 아무것도 가리키지 않는다.
 * - 자원 표의 "가리키는 자원" 은 응답을 받은 뒤에야 꺼낸다 — 다음 요청을 미리 알지 않는다.
 * - 메시지는 보낸 순간 닿는다 (지연 · 손실 없음). 캐시 · 서버 푸시는 없다.
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 채운다 (줄에 첫 경로 하나).
 *
 * 이벤트 (모두 silent 아님 — 한 걸음 = 메시지 하나):
 * - `request`  { path: string; line: string; queue: string[] }
 *     줄 머리의 경로를 꺼내 요청 줄(`GET <경로> HTTP/1.1`)로 보낸다. queue 는 꺼낸 뒤의 줄.
 * - `response` { path: string; status: string; code: number; found: boolean; refs: string[]; added: string[]; queue: string[] }
 *     그 요청의 짝인 응답. status 는 상태 줄, code 는 그 응답 코드, refs 는 본문이 가리키는 자원(적힌 차례),
 *     added 는 그중 처음 알게 되어 줄 끝에 붙은 것, queue 는 붙인 뒤의 줄.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RequestResponseResource = {
  path: string;
  refs: string[];
};

export type RequestResponseStatus = {
  code: number;
  reason: string;
};

export type RequestResponseFacetData = {
  type: 'request-response';
  stepMs: number;
  host: string;
  method: string;
  version: string;
  found: RequestResponseStatus;
  missing: RequestResponseStatus;
  start: string;
  resources: RequestResponseResource[];
};

/** 경로 → 본문이 가리키는 자원. 같은 경로가 두 번 있으면 모형 밖이다. */
export function serverTable(data: RequestResponseFacetData): Map<string, string[]> {
  const table = new Map<string, string[]>();
  for (const r of data.resources) {
    if (table.has(r.path)) {
      throw new Error(`request-response: 자원 표에 경로가 두 번 있다 — ${r.path}`);
    }
    table.set(r.path, [...r.refs]);
  }
  return table;
}

export async function requestResponse(ctx0: FacetContext<RequestResponseFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<RequestResponseFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;
  if (typeof data.start !== 'string' || data.start === '') {
    throw new Error('request-response: 첫 요청 경로가 없다');
  }
  const table = serverTable(data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const queue: string[] = [data.start];
  const seen = new Set<string>(queue);

  // 걸음 0 이 이미 읽을 것(줄의 첫 경로)을 보이므로, 첫 요청 앞에도 문을 둔다.
  while (queue.length > 0) {
    if (!(await pause())) return;
    const path = queue.shift();
    if (path === undefined) throw new Error('request-response: 빈 줄에서 꺼냈다');
    await ctx.emit({
      type: 'request',
      payload: { path, line: `${data.method} ${path} ${data.version}`, queue: [...queue] },
    });

    if (!(await pause())) return;
    // 응답을 받은 뒤에야 본문이 가리키는 것을 꺼낸다.
    const body = table.get(path);
    const found = body !== undefined;
    const status = found ? data.found : data.missing;
    const refs = found ? [...body] : [];
    const added: string[] = [];
    for (const ref of refs) {
      if (seen.has(ref)) continue; // 이미 물었거나 줄에 있다 — 규약대로 다시 넣지 않는다
      seen.add(ref);
      queue.push(ref);
      added.push(ref);
    }
    await ctx.emit({
      type: 'response',
      payload: {
        path,
        status: `${data.version} ${status.code} ${status.reason}`,
        code: status.code,
        found,
        refs,
        added,
        queue: [...queue],
      },
    });
  }
}
