/**
 * 제어 채널과 데이터 채널 — FTP 는 왜 연결을 둘 쓰는가.
 *
 * 로그인을 마친 클라이언트가 명령 차례(`commands`)를 하나씩 보낸다. 명령과 그 답은
 * 처음부터 끝까지 열려 있는 명령 길(포트 `server.ctlPort`) 위에서만 오간다. 짐(목록 ·
 * 파일)은 `PASV` 가 연 새 짐 길로만 흐르고, 흐른 뒤 `226` 과 함께 그 길은 닫힌다.
 *
 * 줄인 자리 (설명 글이 밝힌다)
 * - 수동(passive) 모드만. 능동(active) 모드 · 로그인(USER · PASS) · 전송 방식(TYPE)은 없다
 * - 한 짐 길은 짐 명령 하나를 싣고 닫힌다
 * - 메시지는 보낸 순간 닿는다 — 지연 · 손실은 없다
 *
 * 셈
 * - 짐 길 포트 = 227 답의 마지막 두 수 p1 · p2 에서 p1 × 256 + p2
 * - 227 답의 앞 네 수는 서버 주소와 같아야 한다 (다르면 던진다)
 * - 명령 길 위를 오간 줄 수 — 명령 1 · 답 1 을 줄 하나씩, 226 도 줄 하나
 * - RETR 의 크기는 서버 디렉터리 표(`files`)에서 찾는다. LIST 는 이름만 흘린다
 *
 * 던지는 것 (C6)
 * - 모르는 명령 · 227 / 150 / 226 / 221 이 아닌 답 · 227 답의 모양이 틀림
 * - 짐 길 없이 짐 명령 · 짐 길이 열린 채 PASV · 목록에 없는 파일 · QUIT 뒤의 명령
 *
 * 이벤트 (모두 silent 아님 — 한 걸음 = 한 이벤트)
 * - `pasv`     { cmd: number; lane: number; port: number; p1: number; p2: number; lines: number }
 *              cmd = commands 의 자리, lane = 몇 번째 짐 길(0 부터), lines = 지금까지 명령 길 위의 줄 수
 * - `transfer` { cmd: number; lane: number; cargo: Cargo; lines: number }
 *              Cargo = { kind: 'list'; names: string[] } | { kind: 'file'; name: string; bytes: number }
 * - `close`    { cmd: number; lane: number; lines: number }   짐 길이 닫히고 226 이 명령 길로 온다
 * - `quit`     { cmd: number; lines: number }                 QUIT · 221 과 명령 길 닫힘
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FtpFile = { name: string; bytes: number };

export type FtpCommand = {
  /** 클라이언트가 보내는 줄 (프로토콜 글자) */
  send: string;
  /** 서버의 첫 답 */
  reply: string;
  /** 짐 명령만 — 짐이 다 흐른 뒤 서버가 보내는 답 */
  done?: string;
};

export type ControlAndDataChannelFacetData = {
  type: 'control-and-data-channel';
  stepMs: number;
  server: { host: string; addr: string; ctlPort: number };
  files: FtpFile[];
  commands: FtpCommand[];
};

export type Cargo =
  | { kind: 'list'; names: string[] }
  | { kind: 'file'; name: string; bytes: number };

/** `227 Entering Passive Mode (h1,h2,h3,h4,p1,p2)` 에서 주소와 두 수를 꺼낸다. */
function parsePassive(reply: string, at: number): { addr: string; p1: number; p2: number } {
  if (!reply.startsWith('227 ')) throw new Error(`명령 ${at}: PASV 의 답이 227 이 아니다 — ${reply}`);
  const m = /\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)\s*$/.exec(reply);
  if (!m) throw new Error(`명령 ${at}: 227 답에서 (h1,h2,h3,h4,p1,p2) 를 찾지 못했다 — ${reply}`);
  const nums = m.slice(1, 7).map((s) => Number(s));
  for (const n of nums) {
    if (!Number.isInteger(n) || n < 0 || n > 255) throw new Error(`명령 ${at}: 227 답의 수가 0~255 밖이다 — ${reply}`);
  }
  const [h1, h2, h3, h4, p1, p2] = nums as [number, number, number, number, number, number];
  return { addr: `${h1}.${h2}.${h3}.${h4}`, p1, p2 };
}

function expectCode(line: string | undefined, code: string, at: number, what: string): void {
  if (line === undefined) throw new Error(`명령 ${at}: ${what} 의 ${code} 답이 없다`);
  if (line !== code && !line.startsWith(`${code} `)) {
    throw new Error(`명령 ${at}: ${what} 의 답이 ${code} 가 아니다 — ${line}`);
  }
}

export async function controlAndDataChannel(
  context: FacetContext<ControlAndDataChannelFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<ControlAndDataChannelFacetData>;
  const { stepMs, server, files, commands } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let lines = 0;
  let lanes = 0;
  /** 지금 열린 짐 길의 자리. 없으면 null */
  let open: number | null = null;
  let quit = false;

  for (let i = 0; i < commands.length; i += 1) {
    // 걸음 0(서버 · 디렉터리 · 열린 명령 길)을 읽을 틈을 먼저 준다
    if (!(await pause())) return;
    const c = commands[i];
    if (c === undefined) throw new Error(`명령 ${i}: 비어 있다`);
    if (quit) throw new Error(`명령 ${i}: QUIT 뒤에 명령이 왔다 — ${c.send}`);
    const [verb, ...args] = c.send.split(' ');

    if (verb === 'PASV') {
      if (open !== null) throw new Error(`명령 ${i}: 짐 길 ${open} 이 열린 채 PASV 가 왔다`);
      const { addr, p1, p2 } = parsePassive(c.reply, i);
      if (addr !== server.addr) throw new Error(`명령 ${i}: 227 답의 주소 ${addr} 가 서버 ${server.addr} 와 다르다`);
      const port = p1 * 256 + p2;
      lines += 2;
      open = lanes;
      lanes += 1;
      await ctx.emit({ type: 'pasv', payload: { cmd: i, lane: open, port, p1, p2, lines } });
    } else if (verb === 'LIST' || verb === 'RETR') {
      if (open === null) throw new Error(`명령 ${i}: 짐 길 없이 짐 명령이 왔다 — ${c.send}`);
      expectCode(c.reply, '150', i, c.send);
      expectCode(c.done, '226', i, c.send);
      let cargo: Cargo;
      if (verb === 'LIST') {
        if (args.length !== 0) throw new Error(`명령 ${i}: 이 모형의 LIST 는 인자를 받지 않는다 — ${c.send}`);
        cargo = { kind: 'list', names: files.map((f) => f.name) };
      } else {
        if (args.length !== 1) throw new Error(`명령 ${i}: RETR 는 파일 이름 하나를 받는다 — ${c.send}`);
        const name = args[0] as string;
        const file = files.find((f) => f.name === name);
        if (file === undefined) throw new Error(`명령 ${i}: 목록에 없는 파일 — ${name}`);
        cargo = { kind: 'file', name: file.name, bytes: file.bytes };
      }
      lines += 2;
      await ctx.emit({ type: 'transfer', payload: { cmd: i, lane: open, cargo, lines } });

      if (!(await pause())) return;
      lines += 1;
      const lane = open;
      open = null;
      await ctx.emit({ type: 'close', payload: { cmd: i, lane, lines } });
    } else if (verb === 'QUIT') {
      if (open !== null) throw new Error(`명령 ${i}: 짐 길 ${open} 이 열린 채 QUIT 가 왔다`);
      expectCode(c.reply, '221', i, c.send);
      lines += 2;
      quit = true;
      await ctx.emit({ type: 'quit', payload: { cmd: i, lines } });
    } else {
      throw new Error(`명령 ${i}: 모르는 명령 — ${c.send}`);
    }
  }
}
