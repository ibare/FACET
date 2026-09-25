/**
 * 장면 — 명령 길 하나와 짐 길들.
 *
 * 바탕: 서버(이름 · 주소 · 명령 포트) · 디렉터리 · 명령 차례 — initialData 에서 베낀다.
 * 자취: 명령 길이 열려 있는가 · 그 위를 오간 줄 수 · 열리고 닫힌 짐 길들 · 클라이언트에 닿은 것.
 * 이번 걸음: `step` — 어느 명령의 어떤 대목인가.
 *
 * 셈(포트 · 줄 수 · 짐)은 알고리즘이 하고 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { Cargo, FtpCommand, FtpFile } from './algorithm.js';

export type DataLane = {
  port: number;
  p1: number;
  p2: number;
  open: boolean;
  /** 이 길로 흐른 짐. 흐르기 전이면 null */
  cargo: Cargo | null;
};

export type Arrival = { kind: 'name'; name: string } | { kind: 'file'; name: string; bytes: number };

/**
 * 이번 걸음. `send` 는 클라이언트가 보낸 줄, `reply` 는 이 걸음에 명령 길로 돌아온 답
 * (close 면 226 줄) — 장면이 명령 차례에서 찾아 싣는다. 없으면 reduce 가 던진다.
 */
export type ChannelStep =
  | { kind: 'pasv'; cmd: number; lane: number; send: string; reply: string }
  | { kind: 'transfer'; cmd: number; lane: number; send: string; reply: string }
  | { kind: 'close'; cmd: number; lane: number; send: string; reply: string }
  | { kind: 'quit'; cmd: number; send: string; reply: string };

export type ControlAndDataChannelScene = {
  server: { host: string; addr: string; ctlPort: number };
  files: FtpFile[];
  commands: FtpCommand[];
  ctlOpen: boolean;
  lines: number;
  lanes: DataLane[];
  arrived: Arrival[];
  step: ChannelStep | null;
};

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`장면: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function list(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`장면: ${what} 가 배열이 아니다`);
  return v;
}

function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`장면: ${k} 가 수가 아니다`);
  return v;
}

function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`장면: ${k} 가 글자가 아니다`);
  return v;
}

function readCargo(v: unknown): Cargo {
  const o = rec(v, 'cargo');
  if (o.kind === 'list') {
    const names = list(o.names, 'cargo.names');
    if (!names.every((n): n is string => typeof n === 'string')) throw new Error('장면: 목록의 이름이 글자가 아니다');
    return { kind: 'list', names: [...names] };
  }
  if (o.kind === 'file') return { kind: 'file', name: str(o, 'name'), bytes: num(o, 'bytes') };
  throw new Error('장면: 모르는 짐');
}

type Base = Pick<ControlAndDataChannelScene, 'server' | 'files' | 'commands'>;

function readInitial(initialData: unknown): Base {
  const d = rec(initialData, 'initialData');
  const s = rec(d.server, 'server');
  return {
    server: { host: str(s, 'host'), addr: str(s, 'addr'), ctlPort: num(s, 'ctlPort') },
    files: list(d.files, 'files').map((f) => {
      const o = rec(f, 'files[]');
      return { name: str(o, 'name'), bytes: num(o, 'bytes') };
    }),
    commands: list(d.commands, 'commands').map((c) => {
      const o = rec(c, 'commands[]');
      if (o.done === undefined) return { send: str(o, 'send'), reply: str(o, 'reply') };
      return { send: str(o, 'send'), reply: str(o, 'reply'), done: str(o, 'done') };
    }),
  };
}

function commandAt(scene: ControlAndDataChannelScene, cmd: number): FtpCommand {
  const c = scene.commands[cmd];
  if (c === undefined) throw new Error(`장면: 명령 ${cmd} 가 명령 차례에 없다`);
  return c;
}

function doneOf(c: FtpCommand, cmd: number): string {
  if (c.done === undefined) throw new Error(`장면: 명령 ${cmd} 에 226 답이 없다`);
  return c.done;
}

function laneAt(scene: ControlAndDataChannelScene, lane: number): DataLane {
  const l = scene.lanes[lane];
  if (l === undefined) throw new Error(`장면: 짐 길 ${lane} 가 열린 적이 없다`);
  return l;
}

export const controlAndDataChannelScene: ScenePlan<ControlAndDataChannelScene> = {
  initial(initialData: unknown): ControlAndDataChannelScene {
    return { ...readInitial(initialData), ctlOpen: true, lines: 0, lanes: [], arrived: [], step: null };
  },

  reduce(scene: ControlAndDataChannelScene, event: FacetRuntimeEvent): ControlAndDataChannelScene {
    const p = rec(event.payload, `${event.type} payload`);
    const cmd = num(p, 'cmd');
    const c = commandAt(scene, cmd);
    switch (event.type) {
      case 'pasv': {
        const lane = num(p, 'lane');
        if (lane !== scene.lanes.length) throw new Error(`장면: 짐 길 ${lane} 의 자리가 맞지 않는다`);
        return {
          ...scene,
          lines: num(p, 'lines'),
          lanes: [...scene.lanes, { port: num(p, 'port'), p1: num(p, 'p1'), p2: num(p, 'p2'), open: true, cargo: null }],
          step: { kind: 'pasv', cmd, lane, send: c.send, reply: c.reply },
        };
      }
      case 'transfer': {
        const lane = num(p, 'lane');
        const was = laneAt(scene, lane);
        if (!was.open) throw new Error(`장면: 닫힌 짐 길 ${lane} 로 짐이 흐른다`);
        const cargo = readCargo(p.cargo);
        const got: Arrival[] =
          cargo.kind === 'list'
            ? cargo.names.map((name) => ({ kind: 'name', name }))
            : [{ kind: 'file', name: cargo.name, bytes: cargo.bytes }];
        return {
          ...scene,
          lines: num(p, 'lines'),
          lanes: scene.lanes.map((l, i) => (i === lane ? { ...l, cargo } : l)),
          arrived: [...scene.arrived, ...got],
          step: { kind: 'transfer', cmd, lane, send: c.send, reply: c.reply },
        };
      }
      case 'close': {
        const lane = num(p, 'lane');
        laneAt(scene, lane);
        return {
          ...scene,
          lines: num(p, 'lines'),
          lanes: scene.lanes.map((l, i) => (i === lane ? { ...l, open: false } : l)),
          step: { kind: 'close', cmd, lane, send: c.send, reply: doneOf(c, cmd) },
        };
      }
      case 'quit':
        return {
          ...scene,
          lines: num(p, 'lines'),
          ctlOpen: false,
          step: { kind: 'quit', cmd, send: c.send, reply: c.reply },
        };
      default:
        throw new Error(`장면: 모르는 이벤트 — ${event.type}`);
    }
  },
};
