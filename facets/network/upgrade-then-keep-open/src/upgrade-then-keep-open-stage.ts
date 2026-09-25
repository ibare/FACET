/**
 * upgrade-then-keep-open 의 그림.
 *
 * 가운데 관 하나가 이미 열린 연결이다. 두 끝이 클라이언트와 서버.
 *   - 요청은 가는 관(HTTP 판)을 지나간다
 *   - 101 이 돌아와 닿으면 **같은 관**이 부풀어 두 갈래 길이 된다 — 위는 클라이언트→서버,
 *     아래는 서버→클라이언트. 관은 새로 생기지 않고, 끝까지 닫히지 않는다
 *   - 틀은 제 갈래를 따라 흐른다. 서버 쪽에서 먼저 넘어오는 틀이 있다
 * 위의 수 셋 가운데 연결과 HTTP 요청은 1 에서 멈추고 메시지만 는다.
 * 아래 띠는 연결 위로 지나간 바이트를 차례로 쌓는다 — 여는 값 한 번, 그 뒤는 짧은 머리.
 */
import {
  type CanvasView,
  type ViewMountParams,
  type ViewInstance,
  type Translate,
  type Palette,
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  categorical,
} from '@ffacet/core/runtime';
import type { Dir, SentMessage, UpgradeScene } from './scene.js';

const H = 480;
const W = PIECE_CANVAS_W;
const PAD = 10;

// 위 — 수 셋
const COUNTER_Y = 6;
const COUNTER_H = 30;
const COUNTER_GAP = 10;

// 관과 두 끝
const END_W = 90;
const BOX_TOP = 50;
const BOX_BOT = 140;
const TUBE_MID = (BOX_TOP + BOX_BOT) / 2;
const TUBE_X0 = PAD + END_W;
const TUBE_X1 = W - PAD - END_W;
const NARROW_HALF = 15;
const WIDE_HALF = 35;
const CARD_INSET = 4;

// 캡션
const CAP_Y1 = 164;
const CAP_Y2 = 182;

// 주고받은 글
const LOG_Y0 = 198;
const LOG_LH = 12.5;
const LOG_GAP = 6;
const LOG_BAR = 3;

// 바이트 띠
const STRIP_Y = 416;
const STRIP_H = 20;
const SEG_LABEL_Y = STRIP_Y + STRIP_H + 12;
const LEGEND_Y = H - 8;

const MOVE_MS = 560;
const MORPH_MS = 420;
const FRAME_MS = 16;

const MONO_PX = parseFloat(fontSizes.xs);
const MONO_CHAR = MONO_PX * 0.6;
const CHIP_PX_PER_BYTE = 3;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Pose = { travel: number; grow: number; open: number };
const SETTLED: Pose = { travel: 1, grow: 1, open: 1 };

function r(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

function put(
  parent: Element,
  tag: string,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r(v)) : v);
  }
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

/** 갈래의 가운데 높이 — 위는 클라이언트→서버, 아래는 서버→클라이언트 */
function laneMid(dir: Dir): number {
  return dir === 'c2s' ? TUBE_MID - WIDE_HALF / 2 : TUBE_MID + WIDE_HALF / 2;
}

function cardWidth(m: SentMessage): number {
  const text = m.lines[0] ?? '';
  return text.length * MONO_CHAR + 14 + m.head * CHIP_PX_PER_BYTE;
}

function renderer(params: ViewMountParams & { canvas: SVGSVGElement }) {
  const svg = params.canvas;
  const t: Translate = params.t ?? makeTranslator(params.locale);
  const c: Palette = getColors(params.theme);
  const [clientColor = c.primary, serverColor = c.accent] = categorical(2, 'vivid');
  const dirColor = (d: Dir): string => (d === 'c2s' ? clientColor : serverColor);

  let gen = 0;
  let destroyed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const waiters = new Set<() => void>();

  function drawCounters(s: UpgradeScene): void {
    const chipW = (W - 2 * PAD - 2 * COUNTER_GAP) / 3;
    const items: [string, number][] = [
      [t('label.connections', 'Connections'), s.connections],
      [t('label.httpRequests', 'HTTP requests'), s.httpRequests],
      [t('label.messages', 'Messages after the switch'), s.messages],
    ];
    items.forEach(([label, value], i) => {
      const x = PAD + i * (chipW + COUNTER_GAP);
      put(svg, 'rect', {
        x, y: COUNTER_Y, width: chipW, height: COUNTER_H, rx: 6,
        fill: c.bgSubtle, stroke: c.border,
      });
      put(svg, 'text', {
        x: x + 10, y: COUNTER_Y + COUNTER_H / 2 + 4,
        'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted,
      }, label);
      put(svg, 'text', {
        x: x + chipW - 10, y: COUNTER_Y + COUNTER_H / 2 + 6, 'text-anchor': 'end',
        'font-family': fonts.mono, 'font-size': fontSizes.lg, 'font-weight': 700, fill: c.text,
      }, String(value));
    });
  }

  function drawEnds(): void {
    const ends: [number, string][] = [
      [PAD, t('label.client', 'Client')],
      [W - PAD - END_W, t('label.server', 'Server')],
    ];
    for (const [x, label] of ends) {
      put(svg, 'rect', {
        x, y: BOX_TOP, width: END_W, height: BOX_BOT - BOX_TOP, rx: 8,
        fill: c.bgSubtle, stroke: c.text, 'stroke-width': 1.5,
      });
      put(svg, 'text', {
        x: x + END_W / 2, y: TUBE_MID + 5, 'text-anchor': 'middle',
        'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600, fill: c.text,
      }, label);
    }
  }

  function drawTube(s: UpgradeScene, open: number): void {
    const half = lerp(NARROW_HALF, WIDE_HALF, open);
    const switched = s.proto !== '' && open > 0;
    put(svg, 'rect', {
      x: TUBE_X0, y: TUBE_MID - half, width: TUBE_X1 - TUBE_X0, height: half * 2,
      fill: c.bg, stroke: switched ? c.primary : c.textMuted, 'stroke-width': 2,
    });
    const name = open < 0.5 || s.proto === '' ? s.version : s.proto;
    if (name !== '') {
      put(svg, 'text', {
        x: (TUBE_X0 + TUBE_X1) / 2, y: TUBE_MID - half - 6, 'text-anchor': 'middle',
        'font-family': fonts.mono, 'font-size': fontSizes.sm,
        fill: switched ? c.primary : c.textMuted,
      }, name);
    }
    if (!switched) return;
    // 갈림줄이 관을 따라 자라며 한 길을 두 갈래로 가른다
    put(svg, 'line', {
      x1: TUBE_X0, y1: TUBE_MID, x2: lerp(TUBE_X0, TUBE_X1, open), y2: TUBE_MID,
      stroke: c.border, 'stroke-width': 1.5, 'stroke-dasharray': '6 4',
    });
    // 갈래마다 흐르는 쪽 — 위는 서버 쪽으로, 아래는 클라이언트 쪽으로
    const arrowSize = 7 * open;
    if (arrowSize <= 0) return;
    const up = laneMid('c2s');
    const down = laneMid('s2c');
    const tipR = TUBE_X1 - 4;
    const tipL = TUBE_X0 + 4;
    put(svg, 'path', {
      d: `M${r(tipR)} ${r(up)} L${r(tipR - arrowSize)} ${r(up - arrowSize)} L${r(tipR - arrowSize)} ${r(up + arrowSize)} Z`,
      fill: dirColor('c2s'),
    });
    put(svg, 'path', {
      d: `M${r(tipL)} ${r(down)} L${r(tipL + arrowSize)} ${r(down - arrowSize)} L${r(tipL + arrowSize)} ${r(down + arrowSize)} Z`,
      fill: dirColor('s2c'),
    });
  }

  /** 방금 지나간 메시지 하나 — 관 속을 건너 받는 끝에 닿는다 */
  function drawPacket(s: UpgradeScene, pose: Pose): void {
    if (s.step === null) return;
    const m = s.sent[s.sent.length - 1];
    if (m === undefined) return;
    const w = cardWidth(m);
    const from = m.dir === 'c2s' ? TUBE_X0 + CARD_INSET + 10 : TUBE_X1 - CARD_INSET - 10 - w;
    const to = m.dir === 'c2s' ? TUBE_X1 - CARD_INSET - 12 - w : TUBE_X0 + CARD_INSET + 12;
    const x = lerp(from, to, pose.travel);
    let mid = TUBE_MID;
    let h = NARROW_HALF * 2 - 2 * CARD_INSET;
    if (m.kind === 'response') {
      mid = lerp(TUBE_MID, laneMid('s2c'), pose.open);
    } else if (m.kind === 'frame') {
      mid = laneMid(m.dir);
      h = WIDE_HALF - 2 * CARD_INSET;
    }
    const color = dirColor(m.dir);
    put(svg, 'rect', {
      x, y: mid - h / 2, width: w, height: h, rx: 4,
      fill: c.bg, stroke: color, 'stroke-width': 2,
    });
    let tx = x + 7;
    if (m.head > 0) {
      put(svg, 'rect', {
        x: x + 4, y: mid - h / 2 + 4, width: m.head * CHIP_PX_PER_BYTE, height: h - 8,
        fill: c.accent,
      });
      tx += m.head * CHIP_PX_PER_BYTE;
    }
    put(svg, 'text', {
      x: tx, y: mid + MONO_PX / 2 - 1,
      'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text,
    }, m.lines[0] ?? '');
  }

  function drawCaption(s: UpgradeScene): void {
    const step = s.step;
    let first: string;
    let second = '';
    if (step === null) {
      first = t('caption.idle', 'The connection is open. Nothing has crossed it yet.');
    } else if (step.kind === 'request') {
      first = t('caption.request', 'An HTTP request goes out carrying {header}.', {
        header: step.header,
      });
      second = t('caption.size', 'Size (bytes): {bytes}', { bytes: step.bytes });
    } else if (step.kind === 'switch') {
      first = t('caption.switch', 'Answer: {status}. The same connection now follows {proto} rules.', {
        status: step.status,
        proto: step.proto,
      });
      second = t('caption.size', 'Size (bytes): {bytes}', { bytes: step.bytes });
    } else {
      first = step.dir === 's2c'
        ? t('caption.fromServer', 'The server sends a frame on its own.')
        : t('caption.fromClient', 'The client sends a frame, masked.');
      second = t('caption.frame', 'Bytes: header {head} + payload {body} = {bytes}', {
        head: step.head,
        body: step.body,
        bytes: step.bytes,
      });
    }
    put(svg, 'text', {
      x: W / 2, y: CAP_Y1, 'text-anchor': 'middle',
      'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600, fill: c.text,
    }, first);
    if (second !== '') {
      put(svg, 'text', {
        x: W / 2, y: CAP_Y2, 'text-anchor': 'middle',
        'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted,
      }, second);
    }
  }

  /** 연결 위로 지나간 글 — 보낸 쪽에 붙어 차례로 쌓인다 */
  function drawLog(s: UpgradeScene): void {
    let y = LOG_Y0;
    const last = s.sent.length - 1;
    s.sent.forEach((m, i) => {
      const top = y;
      const left = m.dir === 'c2s';
      const x = left ? PAD + LOG_BAR + 6 : W - PAD - LOG_BAR - 6;
      m.lines.forEach((line, j) => {
        y += LOG_LH;
        const marked = j === m.mark;
        put(svg, 'text', {
          x, y, 'text-anchor': left ? 'start' : 'end',
          'font-family': fonts.mono, 'font-size': fontSizes.xs,
          'font-weight': marked ? 700 : 400,
          fill: marked ? c.primary : i === last ? c.text : c.textMuted,
        }, line);
      });
      put(svg, 'rect', {
        x: left ? PAD : W - PAD - LOG_BAR, y: top + 3, width: LOG_BAR, height: y - top,
        fill: dirColor(m.dir),
      });
      y += LOG_GAP;
    });
  }

  /** 바이트 띠 — 지나간 메시지마다 제 크기만큼 한 칸 */
  function drawStrip(s: UpgradeScene, pose: Pose): void {
    if (s.totalBytes <= 0) return;
    const scale = (W - 2 * PAD) / s.totalBytes;
    put(svg, 'rect', {
      x: PAD, y: STRIP_Y, width: W - 2 * PAD, height: STRIP_H,
      fill: 'none', stroke: c.border, 'stroke-dasharray': '3 3',
    });
    let x = PAD;
    const last = s.sent.length - 1;
    s.sent.forEach((m, i) => {
      const grow = i === last && s.step !== null ? pose.grow : 1;
      const headW = m.head * scale * grow;
      const bodyW = m.body * scale * grow;
      if (m.kind === 'frame') {
        put(svg, 'rect', { x, y: STRIP_Y, width: headW, height: STRIP_H, fill: c.accent });
        put(svg, 'rect', {
          x: x + headW, y: STRIP_Y, width: bodyW, height: STRIP_H,
          fill: dirColor(m.dir), 'fill-opacity': 0.55,
        });
      } else {
        put(svg, 'rect', {
          x, y: STRIP_Y, width: bodyW, height: STRIP_H,
          fill: c.bgSubtle, stroke: dirColor(m.dir), 'stroke-width': 1.5,
        });
      }
      const segW = headW + bodyW;
      if (grow === 1) {
        put(svg, 'text', {
          x: x + segW / 2, y: SEG_LABEL_Y, 'text-anchor': 'middle',
          'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted,
        }, String(m.head + m.body));
      }
      x += segW;
    });
    if (s.openBytes > 0) {
      put(svg, 'text', {
        x: PAD, y: LEGEND_Y,
        'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text,
      }, t('legend.open', 'Opening, once (bytes): {n}', { n: s.openBytes }));
    }
    if (s.messages > 0) {
      put(svg, 'text', {
        x: W - PAD, y: LEGEND_Y, 'text-anchor': 'end',
        'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text,
      }, t('legend.heads', 'Frame headers so far (bytes): {n}', { n: s.headSum }));
    }
  }

  function draw(s: UpgradeScene, pose: Pose): void {
    svg.textContent = '';
    drawCounters(s);
    drawTube(s, s.proto === '' ? 0 : s.step?.kind === 'switch' ? pose.open : 1);
    drawEnds();
    drawPacket(s, pose);
    drawCaption(s);
    drawLog(s);
    drawStrip(s, pose);
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const wake = (): void => {
        clearTimeout(id);
        timers.delete(id);
        waiters.delete(wake);
        resolve();
      };
      const id = setTimeout(wake, ms);
      timers.add(id);
      waiters.add(wake);
    });
  }

  /** 한 시계로 흘린다. 세대가 바뀌거나 거두면 false */
  async function tween(ms: number, mine: number, frame: (u: number) => void): Promise<boolean> {
    const n = Math.max(1, Math.round(ms / FRAME_MS));
    frame(0);
    for (let i = 1; i <= n; i += 1) {
      await wait(FRAME_MS);
      if (mine !== gen || destroyed) return false;
      frame(ease(i / n));
    }
    return true;
  }

  async function render(
    next: UpgradeScene,
    prev: UpgradeScene | null,
    opts: { animate: boolean },
  ): Promise<void> {
    const mine = (gen += 1);
    if (destroyed) return;
    draw(next, SETTLED);
    if (!opts.animate || next.step === null) return;
    // 새로 지나간 메시지가 있을 때만 흘린다
    if (prev !== null && prev.sent.length >= next.sent.length) return;

    if (next.step.kind === 'switch') {
      if (!(await tween(MOVE_MS, mine, (u) => draw(next, { travel: u, grow: u, open: 0 })))) return;
      if (!(await tween(MORPH_MS, mine, (u) => draw(next, { travel: 1, grow: 1, open: u })))) return;
    } else {
      if (!(await tween(MOVE_MS, mine, (u) => draw(next, { travel: u, grow: u, open: 1 })))) return;
    }
    if (mine === gen && !destroyed) draw(next, SETTLED);
  }

  function destroy(): void {
    destroyed = true;
    gen += 1;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    for (const wake of [...waiters]) wake();
    waiters.clear();
    svg.textContent = '';
  }

  return { render, destroy };
}

export const upgradeThenKeepOpenStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    return renderer(params);
  },
};
