/**
 * 무대 — 두 끝(클라이언트 · 서버) 사이에 길이 갈라져 있다.
 *
 * 맨 위의 길 하나가 명령 길이다. 명령과 답은 그 위로만 오가고, 그 길은 처음부터
 * QUIT 까지 그 자리에 있다. 짐 명령마다 그 아래에 새 짐 길이 서버 쪽에서 뻗어 나와
 * 열리고, 짐(이름들 · 파일)이 서버에서 클라이언트로 그리로 흐른 뒤, 길이 걷혀 자국만
 * 남는다. 다음 짐에는 다른 자리에 또 새 길이 열린다.
 *
 * 정적 그리기가 정본이다. 운동은 같은 그리기에 "지금 몇 ms 째인가" 를 넘겨 아직 오지
 * 않은 만큼을 덜 그린다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ControlAndDataChannelScene, DataLane } from './scene.js';

const H = 330;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 상한만 둔다 — 실제 크기는 폭에서 역산한다 */
const BOX_W_MAX = 136;
const PAD = 10;
const CAPTION_Y = 24;
const BOX_TOP = 42;
const CTL_Y = 124;
const ROW = 17;
const PIPE = 9;
/** 길 아래 글자를 두 끝의 상자에서 띄우는 폭 */
const INSET = 8;

/** 운동 구간 (ms) */
const CHIP_MS = 350;
const GROW_MS = 350;
const FLOW_MS = 700;
const SHUT_MS = 400;
const NAME_MS = 400;

const PX_XS = parseFloat(fontSizes.xs);
const PX_SM = parseFloat(fontSizes.sm);
const PX_MD = parseFloat(fontSizes.md);
/** 고정폭 글자 한 칸의 폭 비율 */
const MONO_RATIO = 0.6;

type Attrs = Record<string, string | number>;

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
}

function ease(f: number): number {
  const c = Math.min(1, Math.max(0, f));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

/** [a, b] 구간 안에서의 진행 (0~1). 운동이 없으면 1 */
function span(at: number | null, a: number, b: number): number {
  if (at === null) return 1;
  return Math.min(1, Math.max(0, (at - a) / (b - a)));
}

function motionLength(scene: ControlAndDataChannelScene): number {
  const s = scene.step;
  if (s === null) return 0;
  switch (s.kind) {
    case 'pasv':
      return 2 * CHIP_MS + GROW_MS;
    case 'transfer':
      return 2 * CHIP_MS + FLOW_MS;
    case 'close':
      return SHUT_MS + CHIP_MS;
    case 'quit':
      return 2 * CHIP_MS + SHUT_MS;
  }
}

/** 줄의 첫 마디 — 길 위를 움직이는 쪽지에 싣는다 */
function head(line: string): string {
  const cut = line.indexOf(' ');
  return cut < 0 ? line : line.slice(0, cut);
}

export const controlAndDataChannelStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const [ctlColor, dataColor] = categorical(2);
    const W = PIECE_CANVAS_W;

    const boxW = Math.min(BOX_W_MAX, W * 0.22);
    const cx0 = PAD;
    const cx1 = PAD + boxW;
    const sx0 = W - PAD - boxW;
    const sx1 = W - PAD;
    const laneX0 = cx1;
    const laneX1 = sx0;
    const laneLen = laneX1 - laneX0;
    const boxBottom = H - PAD;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Attrs, parent: Element, text?: string): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function monoText(parent: Element, x: number, y: number, s: string, anchor: string, px: number, fill: string): void {
      el('text', { x, y, 'font-family': fonts.mono, 'font-size': `${r1(px)}px`, 'text-anchor': anchor, fill }, parent, s);
    }

    function bodyText(parent: Element, x: number, y: number, s: string, anchor: string, px: number, fill: string, weight = 'normal'): void {
      el('text', { x, y, 'font-family': fonts.body, 'font-size': `${r1(px)}px`, 'text-anchor': anchor, fill, 'font-weight': weight }, parent, s);
    }

    /** 폭 안에 들도록 고정폭 글자 크기를 줄인다 */
    function fitMono(s: string, width: number, px: number): number {
      return Math.min(px, width / Math.max(1, s.length * MONO_RATIO));
    }

    function laneYs(scene: ControlAndDataChannelScene): number[] {
      const n = Math.max(1, scene.commands.filter((c) => head(c.send) === 'PASV').length);
      const top = CTL_Y + 72;
      const room = boxBottom - 34 - top;
      const gap = n > 1 ? Math.min(84, room / (n - 1)) : 0;
      return Array.from({ length: n }, (_, i) => top + i * gap);
    }

    /** 길 위 쪽지. dir 1 = 클라이언트 → 서버 */
    function chip(parent: Element, y: number, label: string, f: number, dir: 1 | -1, color: string): void {
      const e = ease(f);
      const w = label.length * PX_SM * MONO_RATIO + 12;
      const from = dir === 1 ? laneX0 + w / 2 + 2 : laneX1 - w / 2 - 2;
      const to = dir === 1 ? laneX1 - w / 2 - 2 : laneX0 + w / 2 + 2;
      const x = from + (to - from) * e;
      el('rect', { x: x - w / 2, y: y - 10, width: w, height: 20, rx: 4, fill: colors.bg, stroke: color, 'stroke-width': 2 }, parent);
      monoText(parent, x, y + 4, label, 'middle', PX_SM, colors.text);
    }

    function pipe(parent: Element, y: number, a: number, b: number, color: string): void {
      if (b - a <= 0.5) return;
      el('line', { x1: a, y1: y, x2: b, y2: y, stroke: color, 'stroke-width': PIPE, 'stroke-linecap': 'butt' }, parent);
      el('circle', { cx: a, cy: y, r: PIPE / 2 + 1.5, fill: colors.bg, stroke: color, 'stroke-width': 2 }, parent);
      el('circle', { cx: b, cy: y, r: PIPE / 2 + 1.5, fill: colors.bg, stroke: color, 'stroke-width': 2 }, parent);
    }

    function ghost(parent: Element, y: number): void {
      el('line', { x1: laneX0, y1: y, x2: laneX1, y2: y, stroke: colors.border, 'stroke-width': 2, 'stroke-dasharray': '5 5' }, parent);
    }

    /**
     * 장면 전체를 세운다. `at` 은 이번 걸음 운동의 경과 ms — null 이면 끝 자리.
     */
    function draw(scene: ControlAndDataChannelScene, at: number | null): void {
      svg.textContent = '';
      const root = el('g', {}, svg);
      const step = scene.step;
      const ys = laneYs(scene);

      // ── 캡션 — 지금 일어나는 일만
      bodyText(root, W / 2, CAPTION_Y, caption(scene), 'middle', PX_MD, colors.text);

      // ── 두 끝
      for (const [x0, name] of [
        [cx0, t('label.client', 'Client')],
        [sx0, t('label.server', 'Server')],
      ] as const) {
        el('rect', { x: x0, y: BOX_TOP, width: boxW, height: boxBottom - BOX_TOP, rx: 8, fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1.5 }, root);
        bodyText(root, x0 + boxW / 2, BOX_TOP + 20, name, 'middle', PX_SM, colors.text, '600');
      }

      // 서버 — 이름 · 주소 · 디렉터리
      const inner = boxW - 16;
      monoText(root, sx0 + 8, BOX_TOP + 40, scene.server.host, 'start', fitMono(scene.server.host, inner, PX_XS), colors.textMuted);
      monoText(root, sx0 + 8, BOX_TOP + 40 + ROW - 3, scene.server.addr, 'start', fitMono(scene.server.addr, inner, PX_XS), colors.textMuted);
      const fileTop = CTL_Y + 36;
      scene.files.forEach((f, i) => {
        const y = fileTop + i * ROW;
        const size = String(f.bytes);
        const px = fitMono(`${f.name} ${size}`, inner, PX_XS);
        monoText(root, sx0 + 8, y, f.name, 'start', px, colors.text);
        monoText(root, sx1 - 8, y, size, 'end', px, colors.textMuted);
      });

      // 클라이언트 — 닿은 것. 이번 걸음에 흐르는 것은 닿은 뒤에야 선다
      const fresh = step?.kind === 'transfer' ? arrivalsOf(laneAt(scene, step.lane)) : 0;
      const settled = scene.arrived.length - fresh;
      scene.arrived.forEach((a, i) => {
        if (i >= settled && at !== null && !cargoLanded(i - settled, fresh, at)) return;
        const y = fileTop + i * ROW;
        if (a.kind === 'name') {
          monoText(root, cx0 + 8, y, a.name, 'start', fitMono(a.name, inner, PX_XS), colors.text);
        } else {
          const size = String(a.bytes);
          const px = fitMono(`${a.name} ${size}`, inner, PX_XS);
          monoText(root, cx0 + 8, y, a.name, 'start', px, colors.text);
          monoText(root, cx1 - 8, y, size, 'end', px, dataColor);
        }
      });

      // ── 명령 길
      const ctlShut = scene.ctlOpen
        ? 0
        : step?.kind === 'quit'
          ? ease(span(at, 2 * CHIP_MS, 2 * CHIP_MS + SHUT_MS))
          : 1;
      if (ctlShut > 0) ghost(root, CTL_Y);
      if (ctlShut < 1) pipe(root, CTL_Y, laneX0 + laneLen * ctlShut, laneX1, ctlColor);
      bodyText(root, laneX0 + INSET, CTL_Y + 24, t('label.command', 'Command path'), 'start', PX_SM, ctlColor, '600');
      bodyText(root, W / 2, CTL_Y + 24, t('label.lines', 'Lines: {n}', { n: scene.lines }), 'middle', PX_SM, colors.text);
      bodyText(root, laneX1 - INSET, CTL_Y + 24, t('label.port', 'Port: {port}', { port: scene.server.ctlPort }), 'end', PX_SM, colors.textMuted);

      // 명령 길 위 이번 걸음의 두 줄 — 보낸 줄은 왼쪽, 답은 오른쪽
      drawExchange(root, scene, at);

      // ── 짐 길들
      scene.lanes.forEach((lane, i) => {
        const y = ys[i];
        if (y === undefined) throw new Error(`무대: 짐 길 ${i} 의 자리가 없다 — PASV 수보다 많다`);
        drawLane(root, scene, lane, i, y, at);
      });
    }

    function laneAt(scene: ControlAndDataChannelScene, i: number): DataLane {
      const lane = scene.lanes[i];
      if (lane === undefined) throw new Error(`무대: 짐 길 ${i} 가 장면에 없다`);
      return lane;
    }

    function arrivalsOf(lane: DataLane): number {
      if (lane.cargo === null) throw new Error('무대: 짐이 흐르는 걸음인데 짐 길에 짐이 없다');
      return lane.cargo.kind === 'list' ? lane.cargo.names.length : 1;
    }

    /** k 번째 짐 쪽지의 흐름 구간 */
    function flowSpan(k: number, n: number): [number, number] {
      const start = 2 * CHIP_MS;
      if (n <= 1) return [start, start + FLOW_MS];
      const stagger = (FLOW_MS - NAME_MS) / (n - 1);
      return [start + k * stagger, start + k * stagger + NAME_MS];
    }

    function cargoLanded(k: number, n: number, at: number): boolean {
      return at >= flowSpan(k, n)[1];
    }

    function drawExchange(parent: Element, scene: ControlAndDataChannelScene, at: number | null): void {
      const step = scene.step;
      if (step === null) return;
      const sendY = CTL_Y - 34;
      const replyY = CTL_Y - 18;
      if (step.kind === 'close') {
        const done = step.reply;
        if (at === null || at >= SHUT_MS + CHIP_MS) {
          monoText(parent, laneX1, replyY, done, 'end', fitMono(done, laneLen, PX_XS), colors.text);
        }
        if (at !== null && at >= SHUT_MS && at < SHUT_MS + CHIP_MS) {
          chip(parent, CTL_Y, head(done), span(at, SHUT_MS, SHUT_MS + CHIP_MS), -1, ctlColor);
        }
        return;
      }
      monoText(parent, laneX0, sendY, step.send, 'start', fitMono(step.send, laneLen, PX_XS), colors.text);
      if (at === null || at >= 2 * CHIP_MS) {
        monoText(parent, laneX1, replyY, step.reply, 'end', fitMono(step.reply, laneLen, PX_XS), colors.text);
      }
      if (at !== null && at < CHIP_MS) chip(parent, CTL_Y, head(step.send), span(at, 0, CHIP_MS), 1, ctlColor);
      if (at !== null && at >= CHIP_MS && at < 2 * CHIP_MS) {
        chip(parent, CTL_Y, head(step.reply), span(at, CHIP_MS, 2 * CHIP_MS), -1, ctlColor);
      }
    }

    function drawLane(parent: Element, scene: ControlAndDataChannelScene, lane: DataLane, i: number, y: number, at: number | null): void {
      const step = scene.step;
      const mine = step !== null && step.kind !== 'quit' && step.lane === i ? step : null;

      // 열림 — 서버 쪽에서 뻗어 나온다
      let grow = 1;
      if (mine?.kind === 'pasv') grow = ease(span(at, 2 * CHIP_MS, 2 * CHIP_MS + GROW_MS));
      if (mine?.kind === 'pasv' && at !== null && at < 2 * CHIP_MS) return; // 아직 답이 오지 않았다
      // 닫힘 — 서버 쪽으로 걷힌다
      let shut = lane.open ? 0 : 1;
      if (mine?.kind === 'close') shut = ease(span(at, 0, SHUT_MS));

      if (shut > 0) ghost(parent, y);
      if (shut < 1) pipe(parent, y, laneX1 - laneLen * grow + laneLen * shut, laneX1, dataColor);

      const stateKey = lane.open || shut < 1 ? 'open' : 'closed';
      bodyText(
        parent,
        W / 2,
        y - 12,
        stateKey === 'open' ? t('state.open', 'open') : t('state.closed', 'closed'),
        'middle',
        PX_XS,
        stateKey === 'open' ? dataColor : colors.textMuted,
      );
      bodyText(parent, laneX0 + INSET, y + 24, t('label.data', 'Data path'), 'start', PX_SM, lane.open ? dataColor : colors.textMuted, '600');
      bodyText(parent, laneX1 - INSET, y + 24, t('label.port', 'Port: {port}', { port: lane.port }), 'end', PX_SM, colors.textMuted);

      // 흐른 짐의 셈 — 다 흐른 뒤에 선다
      const cargo = lane.cargo;
      if (cargo !== null) {
        const flowing = mine?.kind === 'transfer' && at !== null;
        if (!flowing || (at !== null && at >= 2 * CHIP_MS + FLOW_MS)) {
          const tally =
            cargo.kind === 'list'
              ? t('label.names', 'Names: {n}', { n: cargo.names.length })
              : t('label.bytes', 'Bytes: {n}', { n: cargo.bytes });
          bodyText(parent, W / 2, y + 24, tally, 'middle', PX_SM, colors.text);
        }
        if (flowing && at !== null) {
          const items = cargo.kind === 'list' ? cargo.names : [cargo.name];
          items.forEach((name, k) => {
            const [a, b] = flowSpan(k, items.length);
            if (at < a || at >= b) return;
            chip(parent, y, name, span(at, a, b), -1, dataColor);
          });
        }
      }
    }

    function caption(scene: ControlAndDataChannelScene): string {
      const step = scene.step;
      if (step === null) return t('caption.ready', 'Logged in. Command port: {port}', { port: scene.server.ctlPort });
      const cmd = step.send;
      switch (step.kind) {
        case 'pasv': {
          const lane = laneAt(scene, step.lane);
          return t('caption.pasv', '{cmd} — a new data path opens. Port: {p1} × 256 + {p2} = {port}', {
            cmd,
            p1: lane.p1,
            p2: lane.p2,
            port: lane.port,
          });
        }
        case 'transfer': {
          const cargo = laneAt(scene, step.lane).cargo;
          if (cargo === null) throw new Error(`무대: 짐 길 ${step.lane} 로 흐른 짐이 없다`);
          return cargo.kind === 'list'
            ? t('caption.list', '{cmd} — the names flow on the data path. Names: {n}', { cmd, n: cargo.names.length })
            : t('caption.file', '{cmd} — the file flows on the data path. Bytes: {n}', { cmd, n: cargo.bytes });
        }
        case 'close': {
          const lane = laneAt(scene, step.lane);
          return t('caption.close', 'The data path on port {port} closes. On the command path: {reply}', {
            port: lane.port,
            reply: step.reply,
          });
        }
        case 'quit':
          return t('caption.quit', '{cmd} — the command path closes. Lines it carried: {n}', { cmd, n: scene.lines });
      }
    }

    function tween(ms: number, mine: number, frame: (at: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const at = Math.min(ms, Date.now() - start);
          frame(at);
          if (at >= ms) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    return {
      async render(next: ControlAndDataChannelScene, prev: ControlAndDataChannelScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        draw(next, null);
        const ms = motionLength(next);
        if (!opts.animate || prev === null || next.step === null || ms === 0) return;
        await tween(ms, mine, (at) => draw(next, at));
        if (mine !== gen || destroyed) return;
        draw(next, null);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
