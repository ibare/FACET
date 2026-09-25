/**
 * stateless-needs-token — 서버는 요청과 요청을 잇지 않는다. 요청마다 실려 오는 쿠키만 잇는다.
 *
 * 모형 (사양의 규약을 줄인 자리):
 *   - 서버는 요청 하나를 **그 요청의 글자 + 세션 표** 로만 처리한다. 앞 요청 · 같은 연결 ·
 *     같은 컴퓨터라는 사실은 쓰지 않는다.
 *   - `loginPath`: 본문 `user=<이름>` 으로 세션 표에 `issuedSid → 이름` 을 적고 200 과 Set-Cookie.
 *     세션 값은 예로 정한 값이다 (실제로는 서버가 무작위로 만든다).
 *   - 그 밖의 경로: `resources` 에 있어야 한다. 쿠키 `cookieName` 이 표에 있으면 그 사람의 것으로 200,
 *     쿠키가 없거나 표에 없으면 401.
 *   - 쿠키를 붙이는 것은 브라우저의 일이다. 창마다 쿠키 보관이 따로 있고, 요청이 실은 쿠키는
 *     그 창의 보관과 같아야 한다 (사생활 창은 보통 창의 쿠키를 나누지 않는다).
 *   - 메시지는 보낸 순간 닿는다. 망의 지연 · 손실은 없다.
 *   모르는 쿠키 이름 · 모르는 경로 · 모르는 본문 · 창 보관과 어긋나는 쿠키 · 자료 없는 사용자는 던진다 (C6).
 *
 * 이벤트 (모두 silent 아님, 한 걸음씩):
 *   send     { index: number, window: string, method: string, path: string,
 *              cookie: string | null, body: string | null }
 *            요청 index(1 부터) 가 창 window 에서 나가 서버에 닿는다. cookie 는 `sid=7f3a9c` 꼴.
 *   respond  { index: number, window: string, code: number, reason: string,
 *              setCookie: string | null, who: string | null, items: string[],
 *              wrote: { sid: string, user: string } | null, matched: string | null }
 *            서버가 답을 창으로 돌려보내고 그 요청에서 쥐고 있던 것을 비운다.
 *            wrote 는 이번에 세션 표에 적은 줄, matched 는 쿠키로 찾은 표의 세션 값.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type StatelessRequest = {
  window: string;
  method: string;
  path: string;
  cookie: string | null;
  body: string | null;
};

export type StatelessStatus = { code: number; reason: string };

export type StatelessNeedsTokenFacetData = {
  type: 'stateless-needs-token';
  stepMs: number;
  windows: string[];
  headers: { cookie: string; setCookie: string };
  cookieName: string;
  issuedSid: string;
  loginPath: string;
  loginField: string;
  status: { ok: StatelessStatus; unauthorized: StatelessStatus };
  /** 경로마다 사용자별 자료. 화면의 글자는 mark + 항목 (주문은 '#' + 번호) */
  resources: Record<string, { mark: string; owners: Record<string, string[]> }>;
  requests: StatelessRequest[];
};

/** `이름=값` 을 가른다. 모양이 틀리면 던진다. */
export function splitPair(text: string, where: string): [string, string] {
  const at = text.indexOf('=');
  if (at <= 0 || at === text.length - 1) throw new Error(`${where}: '이름=값' 꼴이 아니다 — ${text}`);
  return [text.slice(0, at), text.slice(at + 1)];
}

export async function statelessNeedsToken(ctx: FacetContext<StatelessNeedsTokenFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<StatelessNeedsTokenFacetData>;
  const data = rctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 서버가 요청 사이에 남기는 것은 이 표뿐이다.
  const sessions = new Map<string, string>();
  // 브라우저 쪽 — 창마다 따로인 쿠키 보관.
  const jars = new Map<string, string | null>();
  for (const w of data.windows) jars.set(w, null);

  // 걸음 0 은 이미 읽을 것이 있는 화면(창 둘 · 빈 서버)이라 첫 발신 앞에 틈을 둔다.
  if (!(await pause())) return;

  for (let i = 0; i < data.requests.length; i += 1) {
    if (rctx.cancelled) return;
    const req = data.requests[i]!;
    const index = i + 1;

    if (!jars.has(req.window)) throw new Error(`요청 ${index}: 모르는 창 ${req.window}`);
    const jar = jars.get(req.window) ?? null;
    if (req.cookie !== jar) {
      throw new Error(`요청 ${index}: 실은 쿠키(${String(req.cookie)}) 가 창 ${req.window} 의 보관(${String(jar)}) 과 다르다`);
    }

    await rctx.emit({
      type: 'send',
      payload: { index, window: req.window, method: req.method, path: req.path, cookie: req.cookie, body: req.body },
    });
    if (!(await pause())) return;

    // --- 서버: 이 요청의 글자 + 세션 표만 본다 ---
    let matched: string | null = null;
    let who: string | null = null;
    if (req.cookie !== null) {
      const [name, value] = splitPair(req.cookie, `요청 ${index} 쿠키`);
      if (name !== data.cookieName) throw new Error(`요청 ${index}: 모르는 쿠키 이름 ${name}`);
      const user = sessions.get(value);
      if (user !== undefined) {
        matched = value;
        who = user;
      }
    }

    let status: StatelessStatus;
    let setCookie: string | null = null;
    let wrote: { sid: string; user: string } | null = null;
    let items: string[] = [];

    if (req.path === data.loginPath) {
      if (req.body === null) throw new Error(`요청 ${index}: 로그인 본문이 없다`);
      const [field, user] = splitPair(req.body, `요청 ${index} 본문`);
      if (field !== data.loginField) throw new Error(`요청 ${index}: 모르는 본문 필드 ${field}`);
      sessions.set(data.issuedSid, user);
      wrote = { sid: data.issuedSid, user };
      setCookie = `${data.cookieName}=${data.issuedSid}`;
      status = data.status.ok;
    } else {
      const table = data.resources[req.path];
      if (table === undefined) throw new Error(`요청 ${index}: 모르는 경로 ${req.path}`);
      if (who === null) {
        status = data.status.unauthorized;
      } else {
        const owned = table.owners[who];
        if (owned === undefined) throw new Error(`요청 ${index}: ${who} 의 ${req.path} 자료가 없다`);
        items = owned.map((x) => `${table.mark}${x}`);
        status = data.status.ok;
      }
    }

    // 브라우저는 Set-Cookie 를 받은 그 창의 보관에만 넣는다.
    if (setCookie !== null) jars.set(req.window, setCookie);

    await rctx.emit({
      type: 'respond',
      payload: {
        index,
        window: req.window,
        code: status.code,
        reason: status.reason,
        setCookie,
        who,
        items,
        wrote,
        matched,
      },
    });
    if (i < data.requests.length - 1 && !(await pause())) return;
  }
}
