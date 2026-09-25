/**
 * nat — 공인 주소 하나를 안쪽 기기 여럿이 나눠 쓸 때, 무엇을 갈아 끼우고(주소만 · 주소+포트) 들어온 패킷의
 * 표를 무엇으로 찾느냐(받는 포트만 · 포트+먼 쪽)에 따라 누가 나가고 누가 답을 받는지를 한 판으로 재생한다.
 *
 * 한 판의 걸음 (걸음 = 패킷 하나):
 *   0   빈 표 · 안쪽 기기 n 개
 *   나감  기기 차례로 하나씩. 보낸 이 주소는 공인 주소로, 보낸 이 포트는 주소만이면 그대로 · 주소+포트면 새 포트
 *         (firstPort 부터 줄이 적힐 때마다 하나씩). 바꾼 (공인 포트[, 먼 쪽]) 이 이미 표에 있으면 막는다(표에 적지 않는다)
 *   제 답 표의 줄 차례로 — 그 줄의 먼 쪽이 그 공인 포트로 하나씩. 열쇠로 첫 줄을 찾아 받는 이 칸을 되돌린다
 *   낯선 것 하나 — stranger 가 첫 줄의 공인 포트로. 찾으면 들이고, 없으면 버린다
 *
 * 열쇠 — key 0: 공인 포트가 같은 첫 줄 / key 1: 공인 포트와 먼 쪽이 모두 같은 첫 줄. 줄은 적힌 차례로 보므로
 * 여럿이 맞으면 번호가 앞선 줄이 이긴다 (동률 규칙). 이 데이터에서는 한 표에 같은 열쇠가 둘 적히지 않아(막힘이
 * 그것을 막는다) 이 규칙이 판정을 가르는 일은 없다.
 *
 * 먼 쪽 번호: 0 = server · 1 = stranger (IR 에 건네는 꼴과 같다).
 *
 * 이벤트 (모두 await, type 리터럴):
 *   round   { rewrite: number, key: number, devices: number }                         판 시작 = 걸음 0
 *   out     { device: number, pub: number, outcome: 'write' | 'block', row: number,
 *             nextPort: number, from: string, to: string }                              나감 한 걸음
 *           row — write 면 적힌 줄의 색인, block 이면 같은 열쇠를 가진 줄의 색인. nextPort — 이 걸음 뒤의 새 포트
 *   in      { kind: 'reply' | 'stray', remote: number, port: number, found: number,
 *             device: number, from: string, to: string, dest: string }                  들어옴 한 걸음
 *           found — 찾은 줄 색인 또는 -1, device — 되돌린 안쪽 기기 색인 또는 -1, dest — 되돌린 주소:포트 또는 ''
 *   done    { sentOut: number, blocked: number, repliesBack: number, strayIn: number }  판 끝 (걸음이 아니다)
 *   phase   { phase: string }  silent
 *
 * phase 어휘 (irs.ts 와 같다):
 *   write-row     줄을 적고 내보낸 나감
 *   block-clash   막힌 나감
 *   restore-dest  제 답 · 들어온 낯선 것 (같은 줄을 지난다)
 *   drop-no-row   맞는 줄이 없어 버린 들어옴
 *   걸음 0 에는 phase 가 없다 (projector 가 코드 패널을 비운다)
 *
 * 계기 (판이 바뀌면 0 으로 되돌린다):
 *   sent-out      줄이 적히고 나간 나감 걸음마다 1
 *   blocked       막힌 나감 걸음마다 1
 *   replies-back  제 답이 주인에게 들어간 걸음마다 1
 *   stray-in      낯선 것이 들어간 걸음이면 1
 *
 * 손잡이 입력: rewrite · key · devices — payload.value 가 사다리(modes 색인 · keys 색인 · deviceLadder)에 있어야 받는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NatEndpoint = { addr: string; port: number };

export type NatData = {
  type: 'nat';
  stepMs: number;
  publicAddr: string;
  firstPort: number;
  devices: NatEndpoint[];
  server: NatEndpoint;
  stranger: NatEndpoint;
  /** 손잡이 rewrite 의 값 = 색인 */
  modes: string[];
  /** 손잡이 key 의 값 = 색인 */
  keys: string[];
  /** 손잡이 devices 의 값 = 기기 수 */
  deviceLadder: number[];
  rewrite: number;
  key: number;
  deviceCount: number;
};

/** 먼 쪽 번호 */
export const REMOTE_SERVER = 0;
export const REMOTE_STRANGER = 1;

export type NatOutStep = {
  kind: 'out';
  device: number;
  pub: number;
  outcome: 'write' | 'block';
  row: number;
  nextPort: number;
};

export type NatInStep = {
  kind: 'reply' | 'stray';
  remote: number;
  port: number;
  found: number;
  device: number;
};

export type NatStep = NatOutStep | NatInStep;

export type NatPlay = {
  steps: NatStep[];
  rowPub: number[];
  rowDev: number[];
  rowRemote: number[];
  /** [나감, 막힘, 제 답 되돌림, 낯선 것 들임, 들어오다 버림] — IR 의 tally 와 같은 자리 */
  tally: number[];
  /** 안쪽 기기마다 받은 들어온 패킷 수 */
  got: number[];
};

/** IR `findRow` 와 같은 셈 — 열쇠가 맞는 첫 줄의 색인, 없으면 -1 */
export function findRow(
  rowPub: readonly number[],
  rowRemote: readonly number[],
  rows: number,
  port: number,
  remote: number,
  key: number,
): number {
  if (key !== 0 && key !== 1) throw new Error(`nat: 모르는 열쇠 ${key}`);
  for (let i = 0; i < rows; i++) {
    if (rowPub[i] === port) {
      if (key === 0) return i;
      if (rowRemote[i] === remote) return i;
    }
  }
  return -1;
}

/** 한 판의 걸음 차례와 결과. IR `natRun` 과 같은 셈을 걸음으로 편다 */
export function natPlay(data: NatData, mode: number, key: number, count: number): NatPlay {
  if (mode !== 0 && mode !== 1) throw new Error(`nat: 모르는 바꾸는 칸 ${mode}`);
  if (key !== 0 && key !== 1) throw new Error(`nat: 모르는 열쇠 ${key}`);
  if (!Number.isInteger(count) || count < 1 || count > data.devices.length) {
    throw new Error(`nat: 안쪽 기기 수 ${count} 가 자료(${data.devices.length})를 벗어난다`);
  }
  const steps: NatStep[] = [];
  const rowPub: number[] = [];
  const rowDev: number[] = [];
  const rowRemote: number[] = [];
  const tally = [0, 0, 0, 0, 0];
  const got: number[] = new Array<number>(count).fill(0);
  let nxt = data.firstPort;
  for (let d = 0; d < count; d++) {
    const dev = data.devices[d];
    if (dev === undefined) throw new Error(`nat: 안쪽 기기 ${d} 가 없다`);
    const pub = mode === 1 ? nxt : dev.port;
    const clash = findRow(rowPub, rowRemote, rowPub.length, pub, REMOTE_SERVER, key);
    if (clash >= 0) {
      tally[1] += 1;
      steps.push({ kind: 'out', device: d, pub, outcome: 'block', row: clash, nextPort: nxt });
    } else {
      rowPub.push(pub);
      rowDev.push(d);
      rowRemote.push(REMOTE_SERVER);
      tally[0] += 1;
      if (mode === 1) nxt += 1;
      steps.push({ kind: 'out', device: d, pub, outcome: 'write', row: rowPub.length - 1, nextPort: nxt });
    }
  }
  const rows = rowPub.length;
  if (rows === 0) throw new Error('nat: 표에 줄이 하나도 없다 — 들어옴을 셀 수 없다');
  for (let i = 0; i <= rows; i++) {
    const isReply = i < rows;
    const port = isReply ? rowPub[i] : rowPub[0];
    const remote = isReply ? rowRemote[i] : REMOTE_STRANGER;
    if (port === undefined || remote === undefined) throw new Error(`nat: 줄 ${i} 가 비었다`);
    const j = findRow(rowPub, rowRemote, rows, port, remote, key);
    if (j >= 0) {
      const d = rowDev[j];
      if (d === undefined) throw new Error(`nat: 줄 ${j} 의 기기가 없다`);
      got[d] += 1;
      if (isReply) tally[2] += 1;
      else tally[3] += 1;
      steps.push({ kind: isReply ? 'reply' : 'stray', remote, port, found: j, device: d });
    } else {
      if (isReply) throw new Error(`nat: 제 답이 줄 ${i} 를 찾지 못했다`);
      tally[4] += 1;
      steps.push({ kind: 'stray', remote, port, found: -1, device: -1 });
    }
  }
  return { steps, rowPub, rowDev, rowRemote, tally, got };
}

function validate(data: NatData): void {
  if (data.modes.length !== 2) throw new Error('nat: modes 는 둘이다');
  if (data.keys.length !== 2) throw new Error('nat: keys 는 둘이다');
  if (data.deviceLadder.some((n) => !Number.isInteger(n) || n < 1 || n > data.devices.length)) {
    throw new Error('nat: deviceLadder 가 자료의 기기 수를 벗어난다');
  }
  if (!onLadder([0, 1], data.rewrite) || !onLadder([0, 1], data.key) || !onLadder(data.deviceLadder, data.deviceCount)) {
    throw new Error('nat: 기본값이 사다리 밖이다');
  }
}

function onLadder(ladder: readonly number[], v: unknown): v is number {
  return typeof v === 'number' && ladder.includes(v);
}

function hostPort(e: NatEndpoint): string {
  return `${e.addr}:${e.port}`;
}

export async function natAlgorithm(ctxIn: FacetContext<NatData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<NatData>;
  const data = ctx.data;
  validate(data);
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const remotes: NatEndpoint[] = [data.server, data.stranger];

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다
  const shown = new Map<string, number>();
  const show = (name: string, value: number): void => {
    const prev = shown.get(name);
    if (prev === undefined || prev !== value) ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  let rewrite = data.rewrite;
  let key = data.key;
  let count = data.deviceCount;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const play = natPlay(data, rewrite, key, count);
      let sentOut = 0;
      let blocked = 0;
      let repliesBack = 0;
      let strayIn = 0;

      await ctx.emit({ type: 'round', payload: { rewrite, key, devices: count } });
      show('sent-out', 0);
      show('blocked', 0);
      show('replies-back', 0);
      show('stray-in', 0);
      if (!(await ctx.sleep(data.stepMs))) return;

      for (const step of play.steps) {
        if (ctx.cancelled) return;
        if (step.kind === 'out') {
          const dev = data.devices[step.device];
          if (dev === undefined) throw new Error(`nat: 안쪽 기기 ${step.device} 가 없다`);
          if (step.outcome === 'write') await phase('write-row');
          else await phase('block-clash');
          await ctx.emit({
            type: 'out',
            payload: {
              device: step.device,
              pub: step.pub,
              outcome: step.outcome,
              row: step.row,
              nextPort: step.nextPort,
              from: hostPort(dev),
              to: `${data.publicAddr}:${step.pub}`,
            },
          });
          if (step.outcome === 'write') {
            sentOut += 1;
            show('sent-out', sentOut);
          } else {
            blocked += 1;
            show('blocked', blocked);
          }
        } else {
          const remote = remotes[step.remote];
          if (remote === undefined) throw new Error(`nat: 먼 쪽 ${step.remote} 가 없다`);
          let dest = '';
          if (step.found >= 0) {
            const dev = data.devices[step.device];
            if (dev === undefined) throw new Error(`nat: 안쪽 기기 ${step.device} 가 없다`);
            dest = hostPort(dev);
            await phase('restore-dest');
          } else {
            await phase('drop-no-row');
          }
          await ctx.emit({
            type: 'in',
            payload: {
              kind: step.kind,
              remote: step.remote,
              port: step.port,
              found: step.found,
              device: step.device,
              from: hostPort(remote),
              to: `${data.publicAddr}:${step.port}`,
              dest,
            },
          });
          if (step.found >= 0 && step.kind === 'reply') {
            repliesBack += 1;
            show('replies-back', repliesBack);
          } else if (step.found >= 0) {
            strayIn += 1;
            show('stray-in', strayIn);
          }
        }
        if (!(await ctx.sleep(data.stepMs))) return;
      }
      await ctx.emit({ type: 'done', payload: { sentOut, blocked, repliesBack, strayIn } });

      // 손잡이 입력 — 우리 것이 아닌 입력 · 사다리 밖 값은 흘린다
      let changed = false;
      while (!changed) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null ? (p as { value?: unknown }).value : undefined;
        if (input.type === 'rewrite' && onLadder([0, 1], value)) {
          rewrite = value;
          changed = true;
        } else if (input.type === 'key' && onLadder([0, 1], value)) {
          key = value;
          changed = true;
        } else if (input.type === 'devices' && onLadder(data.deviceLadder, value)) {
          count = value;
          changed = true;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
