/**
 * upgrade-then-keep-open — HTTP 요청 하나로 연 연결이 WebSocket 길로 바뀌어 남는다.
 *
 * 모형 (실제 프로토콜을 줄인 자리):
 *   - TCP 연결은 이미 열려 있다고 둔다. 연결을 여는 주고받음은 그리지 않는다
 *   - 메시지는 보낸 순간 닿는다. 지연 · 손실 · 순서 뒤바뀜은 없다
 *   - Sec-WebSocket-Accept 는 셈하지 않고 자료로 받는다 (RFC 6455 의 예시 키와 그 셈값)
 *   - 틀은 텍스트 틀뿐 · 조각 나누기 없음 · 닫기 틀 없음 — 연결은 열린 채 끝난다
 *   - 틀 머리는 짐이 125 바이트 이하일 때의 2 바이트, 클라이언트→서버는 가리개 4 바이트를 더해 6.
 *     짐이 126 바이트 이상이면 길이 칸이 늘어나는 모양이라 모형 밖 — 던진다
 *   - 핸드셰이크 바이트 = 글자의 UTF-8 바이트. 줄마다 CRLF(2), 끝에 빈 줄(CRLF 2)
 *
 * 이벤트 (전부 이 조각 고유):
 *   (init 은 없다 — 걸음 0 의 바탕은 장면의 initial 이 readUpgradeData · planUpgrade 로 세운다)
 *   request          { bytes: number, httpRequests: number, header: string, upgradeLine: number,
 *                      openBytes: number }
 *                    Upgrade 를 든 HTTP 요청이 나간다. header 는 요청의 Upgrade 줄 글자,
 *                    upgradeLine 은 그 줄의 번호(0 부터), openBytes 는 여기까지 여는 데 든 바이트
 *   switch           { bytes: number, status: string, proto: string, openBytes: number }
 *                    101 응답이 돌아와 같은 연결이 proto 규칙의 길로 바뀐다.
 *                    status 는 상태 줄의 코드와 이유 구 ("101 Switching Protocols")
 *   frame            { index: number, dir: 'c2s' | 's2c', head: number, body: number, bytes: number,
 *                      headSum: number, messages: number, httpRequests: number }
 *                    업그레이드 뒤 틀 하나. index 는 frames 의 번호, headSum 은 지금까지 틀 머리 합
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FrameDir = 'c2s' | 's2c';

export type UpgradeThenKeepOpenFacetData = {
  type: 'upgrade-then-keep-open';
  stepMs: number;
  /** 핸드셰이크 요청 글자 — 줄마다 하나, CRLF 와 끝 빈 줄은 빼고 */
  request: string[];
  /** 101 응답 글자 — 줄마다 하나, CRLF 와 끝 빈 줄은 빼고 */
  response: string[];
  /** 업그레이드 뒤 틀 — 방향과 짐 (짐은 번역하지 않는 자료) */
  frames: { dir: string; payload: string }[];
};

const CRLF_BYTES = 2;
/** 짐이 이 바이트 이하여야 길이 칸이 7 비트에 들어간다 */
const SHORT_PAYLOAD_MAX = 125;
const BASE_HEAD = 2;
const MASK_KEY = 4;

const encoder = new TextEncoder();
function utf8Bytes(s: string): number {
  return encoder.encode(s).length;
}

/** HTTP 메시지 바이트 — 줄마다 CRLF, 끝에 빈 줄 */
export function messageBytes(lines: readonly string[]): number {
  let n = 0;
  for (const line of lines) n += utf8Bytes(line) + CRLF_BYTES;
  return n + CRLF_BYTES;
}

type Header = { name: string; value: string; line: number };

function headersOf(lines: readonly string[], what: string): Header[] {
  const out: Header[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) throw new Error(`${what}: ${i} 번 줄이 없다`);
    const at = line.indexOf(':');
    if (at <= 0) throw new Error(`${what}: ${i} 번 줄이 머리줄 모양이 아니다 — ${line}`);
    out.push({ name: line.slice(0, at).trim().toLowerCase(), value: line.slice(at + 1).trim(), line: i });
  }
  return out;
}

function headerOf(headers: readonly Header[], name: string, what: string): Header {
  const found = headers.find((h) => h.name === name);
  if (!found) throw new Error(`${what}: ${name} 머리줄이 없다`);
  return found;
}

function frameDir(dir: string, index: number): FrameDir {
  if (dir === 'c2s' || dir === 's2c') return dir;
  throw new Error(`틀 ${index}: 모르는 방향 ${dir}`);
}

/** 틀 머리 바이트 — 짧은 길이 칸 2, 클라이언트가 보내면 가리개 4 를 더한다 */
export function frameHead(dir: FrameDir, body: number, index: number): number {
  if (body > SHORT_PAYLOAD_MAX) {
    throw new Error(`틀 ${index}: 짐 ${body} 바이트 — 길이 칸이 늘어나는 크기라 모형 밖`);
  }
  return BASE_HEAD + (dir === 'c2s' ? MASK_KEY : 0);
}

/** initialData 를 좁힌다 — 틀린 원소는 번호를 담아 던진다 (장면의 initial 도 이것을 부른다) */
export function readUpgradeData(raw: unknown): UpgradeThenKeepOpenFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('자료: initialData 가 없다');
  const d = raw as Record<string, unknown>;
  const lines = (v: unknown, what: string): string[] => {
    if (!Array.isArray(v)) throw new Error(`자료: ${what} 가 배열이 아니다`);
    return v.map((x, i) => {
      if (typeof x !== 'string') throw new Error(`자료: ${what} ${i} 번이 글자가 아니다`);
      return x;
    });
  };
  if (!Array.isArray(d.frames)) throw new Error('자료: frames 가 배열이 아니다');
  const frames = d.frames.map((f: unknown, i) => {
    if (typeof f !== 'object' || f === null) throw new Error(`자료: 틀 ${i} 가 객체가 아니다`);
    const dir: unknown = 'dir' in f ? f.dir : undefined;
    const payload: unknown = 'payload' in f ? f.payload : undefined;
    if (typeof dir !== 'string') throw new Error(`자료: 틀 ${i} 의 방향이 없다`);
    if (typeof payload !== 'string') throw new Error(`자료: 틀 ${i} 의 짐이 없다`);
    return { dir, payload };
  });
  if (typeof d.stepMs !== 'number') throw new Error('자료: stepMs 가 수가 아니다');
  return {
    type: 'upgrade-then-keep-open',
    stepMs: d.stepMs,
    request: lines(d.request, 'request'),
    response: lines(d.response, 'response'),
    frames,
  };
}

export type SizedFrame = { index: number; dir: FrameDir; head: number; body: number; payload: string };

export type UpgradePlan = {
  /** TCP 연결은 이미 열려 있다 — 이 조각은 그 하나 위에서만 일한다 */
  connections: number;
  version: string;
  header: string;
  upgradeLine: number;
  status: string;
  proto: string;
  requestBytes: number;
  responseBytes: number;
  frames: SizedFrame[];
  totalBytes: number;
};

/** 핸드셰이크와 틀을 읽어 바이트 · 방향 · 머리를 셈한다. 모형 밖이면 던진다 */
export function planUpgrade(data: UpgradeThenKeepOpenFacetData): UpgradePlan {
  const { request, response } = data;
  // 요청 줄 — 메서드 · 경로 · 판
  const requestLine = request[0];
  if (requestLine === undefined) throw new Error('요청: 요청 줄이 없다');
  const reqParts = requestLine.split(' ');
  const version = reqParts[2];
  if (reqParts.length !== 3 || version === undefined || !version.startsWith('HTTP/')) {
    throw new Error(`요청: 요청 줄 모양이 아니다 — ${requestLine}`);
  }
  const reqHeaders = headersOf(request, '요청');
  const upgrade = headerOf(reqHeaders, 'upgrade', '요청');
  const reqConnection = headerOf(reqHeaders, 'connection', '요청');
  if (!reqConnection.value.toLowerCase().split(',').map((s) => s.trim()).includes('upgrade')) {
    throw new Error(`요청: Connection 머리줄에 Upgrade 가 없다 — ${reqConnection.value}`);
  }

  // 상태 줄 — 판 · 코드 · 이유 구
  const statusLine = response[0];
  if (statusLine === undefined) throw new Error('응답: 상태 줄이 없다');
  const sp = statusLine.indexOf(' ');
  if (sp <= 0) throw new Error(`응답: 상태 줄 모양이 아니다 — ${statusLine}`);
  const status = statusLine.slice(sp + 1);
  const code = status.split(' ')[0];
  if (code !== '101') throw new Error(`응답: 101 이 아니면 연결이 바뀌지 않는다 — ${statusLine}`);
  const respHeaders = headersOf(response, '응답');
  const respUpgrade = headerOf(respHeaders, 'upgrade', '응답');
  if (respUpgrade.value.toLowerCase() !== upgrade.value.toLowerCase()) {
    throw new Error(`응답: 요청은 ${upgrade.value} 를, 응답은 ${respUpgrade.value} 를 말한다`);
  }
  headerOf(respHeaders, 'sec-websocket-accept', '응답');

  const requestBytes = messageBytes(request);
  const responseBytes = messageBytes(response);

  // 틀 — 방향과 바이트를 먼저 셈해 둔다 (모형 밖이면 첫 걸음 앞에서 던진다)
  const sized = data.frames.map((f, index): SizedFrame => {
    const dir = frameDir(f.dir, index);
    const body = utf8Bytes(f.payload);
    const head = frameHead(dir, body, index);
    return { index, dir, head, body, payload: f.payload };
  });
  let totalBytes = requestBytes + responseBytes;
  for (const f of sized) totalBytes += f.head + f.body;

  const header = request[upgrade.line];
  if (header === undefined) throw new Error(`요청: ${upgrade.line} 번 줄이 없다`);
  return {
    connections: 1,
    version,
    header,
    upgradeLine: upgrade.line,
    status,
    proto: respUpgrade.value,
    requestBytes,
    responseBytes,
    frames: sized,
    totalBytes,
  };
}

export async function upgradeThenKeepOpen(
  rawCtx: FacetContext<UpgradeThenKeepOpenFacetData>,
): Promise<void> {
  const ctx = rawCtx as ReactiveContext<UpgradeThenKeepOpenFacetData>;
  const { stepMs } = ctx.data;
  const plan = planUpgrade(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 (연결 · 두 끝 · 바탕)은 장면의 initial 이 같은 planUpgrade 로 세운다.
  // 이미 읽을 것이 있는 화면이라 첫 발신 앞에 읽을 틈을 둔다
  if (!(await pause())) return;

  // 요청 줄이 하나 나갔다 — 이 연결의 HTTP 요청은 이것뿐이다
  const httpRequests = 1;
  let openBytes = plan.requestBytes;
  await ctx.emit({
    type: 'request',
    payload: {
      bytes: plan.requestBytes,
      httpRequests,
      header: plan.header,
      upgradeLine: plan.upgradeLine,
      openBytes,
    },
  });
  if (!(await pause())) return;

  openBytes += plan.responseBytes;
  await ctx.emit({
    type: 'switch',
    payload: { bytes: plan.responseBytes, status: plan.status, proto: plan.proto, openBytes },
  });

  let headSum = 0;
  let messages = 0;
  for (const f of plan.frames) {
    if (!(await pause())) return;
    headSum += f.head;
    messages += 1;
    await ctx.emit({
      type: 'frame',
      payload: {
        index: f.index,
        dir: f.dir,
        head: f.head,
        body: f.body,
        bytes: f.head + f.body,
        headSum,
        messages,
        // 틀은 HTTP 요청이 아니다 — 수는 그대로 간다
        httpRequests,
      },
    });
  }
}
