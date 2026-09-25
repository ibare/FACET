/**
 * tcp-handshake-stage — 클라이언트 · 길 · 서버, 그리고 앱이 받은 틱의 줄.
 *
 * 위 칸: 클라이언트(상태 · 보내는 쪽 사본) — 길(나가는 줄 · 돌아오는 줄) — 서버(상태 · 소켓 · 받는 쪽 대기).
 * 아래 칸: 조각마다 한 줄, 가로가 틱. 앱에 넘긴 틱 자리에 표지가 선다.
 *
 * 운동
 *   - 판이 바뀌면 지금 표지들이 옅은 자국으로 남고, 새 판에서 그 조각을 넘기는 걸음에 표지가 자국 자리에서
 *     새 틱 자리로 미끄러져 간다 (자국이 없으면 받는 쪽 가장자리에서)
 *   - 길 위의 패킷은 틱마다 지연만큼 나누어 나아가고, 닿으면 끝까지 가서 사라진다
 *   - 쥐었던 조각은 넘기는 틱에 대기 칸에서 앱 줄의 자리로 내려간다
 *   - 연결 소켓은 듣는 소켓 자리에서 갈라져 나온다
 * 틱 축은 판마다 늘리지 않는다 — 알고리즘이 셈한 가장 긴 판 끝 틱으로 처음부터 잡는다.
 * 운동 길이는 부르는 쪽이 재생 속도로 셈해 건넨다. 되짚는 중(isInstant)에는 0 이다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type StagePacket = {
  id: string;
  kind: 'syn' | 'synAck' | 'ack' | 'data' | 'dataAck';
  label: string;
  dir: 'out' | 'back';
  sent: number;
  arrive: number;
};

export type StageTick = {
  tick: number;
  tcp: boolean;
  clientState: string | null;
  serverState: string | null;
  listenText: string;
  connKey: string | null;
  flights: StagePacket[];
  lostNow: StagePacket[];
  held: number[];
  copies: number[];
  handed: number[];
  handTick: number[];
  serverLine: string;
  clientLine: string;
  finalLine: string | null;
  missing: number[] | null;
  tickLabel: string;
};

export type TcpHandshakeStage = ViewInstance & {
  startRound(segments: string[], axisMax: number, keepGhost: boolean): void;
  showTick(s: StageTick, motionMs: number): void;
  isInstant(): boolean;
  reset(): void;
};

const W = 760;
const H = 448;
const SVG = 'http://www.w3.org/2000/svg';

// 위 칸
const CAP_Y = [18, 36, 54];
const PANEL_TOP = 66;
const PANEL_BOT = 236;
const CLIENT_X0 = 10;
const CLIENT_X1 = 190;
const ROAD_X0 = 200;
const ROAD_X1 = 460;
const SERVER_X0 = 470;
const SERVER_X1 = 750;
const OUT_Y = 124;
const BACK_Y = 184;
const PKT_W = 50;
const PKT_H = 18;
const SLOT_Y = 202;
const SLOT_W = 26;
const SLOT_H = 20;
const SLOT_GAP = 3;
const LISTEN_Y = 124;
const CONN_Y = 150;

// 아래 칸
const APP_LABEL_Y = 262;
const AXIS_NUM_Y = 282;
const AXIS_Y = 290;
const LANE_Y0 = 302;
const LANE_H = 20;
const AX0 = 90;
const AX1 = 670;
const MISS_X = 718;
const MARK_W = 24;
const MARK_H = 15;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

function text(
  parent: Element,
  x: number,
  y: number,
  content: string,
  opts: { size?: string; fill: string; anchor?: string; weight?: string; mono?: boolean },
): SVGTextElement {
  const node = el(
    'text',
    {
      x,
      y,
      'font-family': opts.mono ? fonts.mono : fonts.body,
      'font-size': opts.size ?? fontSizes.sm,
      fill: opts.fill,
      'text-anchor': opts.anchor ?? 'start',
      'dominant-baseline': 'middle',
    },
    parent,
  );
  if (opts.weight) node.setAttribute('font-weight', opts.weight);
  node.textContent = content;
  return node;
}

function place(node: SVGGElement, x: number, y: number, ms: number): void {
  node.style.transition = ms > 0 ? `transform ${ms}ms ease-in-out, opacity ${ms}ms ease-in-out` : 'none';
  node.style.transform = `translate(${x}px, ${y}px)`;
}

function slotX(x0: number, seg: number): number {
  return x0 + 8 + (seg - 1) * (SLOT_W + SLOT_GAP);
}

export const tcpHandshakeStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): TcpHandshakeStage {
    const svg = params.canvas;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const c: Palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const instant = params.isInstant ?? (() => false);
    const [dataInk, ackInk, handInk] = categorical(3, 'vivid');
    if (!dataInk || !ackInk || !handInk) throw new Error('색 셋을 받지 못했다');

    const root = el('g', {}, svg);

    // 캡션
    const capLines = CAP_Y.map((y) => text(root, CLIENT_X0, y, '', { fill: c.text, size: fontSizes.md }));

    // 위 칸 뼈대
    el('rect', { x: CLIENT_X0, y: PANEL_TOP, width: CLIENT_X1 - CLIENT_X0, height: PANEL_BOT - PANEL_TOP, rx: 6, fill: c.bgSubtle, stroke: c.border }, root);
    el('rect', { x: SERVER_X0, y: PANEL_TOP, width: SERVER_X1 - SERVER_X0, height: PANEL_BOT - PANEL_TOP, rx: 6, fill: c.bgSubtle, stroke: c.border }, root);
    text(root, CLIENT_X0 + 8, 82, tr('label.client', 'Client'), { fill: c.text, weight: '600', size: fontSizes.md });
    text(root, SERVER_X0 + 8, 82, tr('label.server', 'Server'), { fill: c.text, weight: '600', size: fontSizes.md });
    const clientAddr = text(root, CLIENT_X0 + 8, 99, '', { fill: c.textMuted, mono: true, size: fontSizes.xs });
    const serverAddr = text(root, SERVER_X0 + 8, 99, '', { fill: c.textMuted, mono: true, size: fontSizes.xs });
    const clientState = text(root, CLIENT_X1 - 8, 82, '', { fill: c.primary, mono: true, size: fontSizes.xs, anchor: 'end', weight: '600' });
    const serverState = text(root, SERVER_X1 - 8, 82, '', { fill: c.primary, mono: true, size: fontSizes.xs, anchor: 'end', weight: '600' });
    // initialData 가 아예 없으면(전수 검사의 config 만 준 마운트) 주소 자리를 비워 둔다. 있는데 글이 아니면 던진다
    if (params.initialData) {
      const cl = params.initialData['client'];
      const sv = params.initialData['server'];
      if (typeof cl !== 'string') throw new Error('client 주소가 글이 아니다');
      if (typeof sv !== 'string') throw new Error('server 주소가 글이 아니다');
      clientAddr.textContent = cl;
      serverAddr.textContent = sv;
    }

    // 길
    el('line', { x1: ROAD_X0, y1: OUT_Y, x2: ROAD_X1, y2: OUT_Y, stroke: c.border, 'stroke-dasharray': '4 4' }, root);
    el('line', { x1: ROAD_X0, y1: BACK_Y, x2: ROAD_X1, y2: BACK_Y, stroke: c.border, 'stroke-dasharray': '4 4' }, root);
    el('path', { d: `M ${ROAD_X1 - 6} ${OUT_Y - 4} L ${ROAD_X1} ${OUT_Y} L ${ROAD_X1 - 6} ${OUT_Y + 4}`, fill: 'none', stroke: c.textMuted }, root);
    el('path', { d: `M ${ROAD_X0 + 6} ${BACK_Y - 4} L ${ROAD_X0} ${BACK_Y} L ${ROAD_X0 + 6} ${BACK_Y + 4}`, fill: 'none', stroke: c.textMuted }, root);
    const roadLayer = el('g', {}, root);

    // 보내는 쪽 사본 · 받는 쪽 대기
    text(root, CLIENT_X0 + 8, SLOT_Y - 10, tr('label.copies', 'Sender copies'), { fill: c.textMuted, size: fontSizes.xs });
    text(root, SERVER_X0 + 8, SLOT_Y - 10, tr('label.holdQueue', 'Receiver queue'), { fill: c.textMuted, size: fontSizes.xs });
    const slotFrames = el('g', {}, root);
    const copyLayer = el('g', {}, root);
    const holdLayer = el('g', {}, root);

    // 소켓
    const listenBox = el('g', {}, root);
    el('rect', { x: 0, y: 0, width: SERVER_X1 - SERVER_X0 - 16, height: 20, rx: 4, fill: c.bg, stroke: c.textMuted }, listenBox);
    const listenLabel = text(listenBox, 8, 10, '', { fill: c.text, size: fontSizes.xs });
    place(listenBox, SERVER_X0 + 8, LISTEN_Y - 12, 0);
    const connBox = el('g', {}, root);
    el('rect', { x: 0, y: 0, width: SERVER_X1 - SERVER_X0 - 16, height: 34, rx: 4, fill: c.bg, stroke: c.primary, 'stroke-width': 1.5 }, connBox);
    text(connBox, 8, 10, tr('label.connSocket', 'Connection socket'), { fill: c.text, size: fontSizes.xs, weight: '600' });
    const connKeyText = text(connBox, 8, 25, '', { fill: c.text, size: fontSizes.xs, mono: true });
    connBox.style.opacity = '0';
    place(connBox, SERVER_X0 + 8, LISTEN_Y - 12, 0);

    // 아래 칸
    text(root, CLIENT_X0, APP_LABEL_Y, tr('label.app', 'Tick each segment reached the app'), { fill: c.text, weight: '600', size: fontSizes.md });
    const axisLayer = el('g', {}, root);
    const ghostLayer = el('g', {}, root);
    const nowLine = el('g', {}, root);
    el('line', { x1: 0, y1: AXIS_Y - 2, x2: 0, y2: LANE_Y0 + 6 * LANE_H + 4, stroke: c.primary, 'stroke-width': 1.5 }, nowLine);
    const nowLabel = text(nowLine, 0, LANE_Y0 + 6 * LANE_H + 14, '', { fill: c.primary, size: fontSizes.xs, anchor: 'middle', weight: '600' });
    nowLine.style.opacity = '0';
    const markLayer = el('g', {}, root);
    const missLayer = el('g', {}, root);
    const flyLayer = el('g', {}, root);

    let segments: string[] = [];
    let axisMax = 0;
    let ghosts: number[] = [];
    let lastHand: number[] = [];
    const roadNodes = new Map<string, SVGGElement>();
    const marks = new Map<number, SVGGElement>();
    let heldBefore: number[] = [];
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const later = (ms: number, fn: () => void): void => {
      if (ms <= 0) {
        fn();
        return;
      }
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    const clearTimers = (): void => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
    };

    const segName = (seg: number): string => {
      const name = segments[seg - 1];
      if (name === undefined) throw new Error(`모르는 조각 번호: ${seg}`);
      return name;
    };

    const tickX = (tick: number): number => {
      if (axisMax <= 0) throw new Error('틱 축이 없다');
      return AX0 + (tick * (AX1 - AX0)) / axisMax;
    };
    const laneY = (seg: number): number => LANE_Y0 + (seg - 1) * LANE_H + LANE_H / 2;
    const roadX = (frac: number): number => ROAD_X0 + frac * (ROAD_X1 - ROAD_X0 - PKT_W);

    const packetInk = (k: StagePacket['kind']): string =>
      k === 'data' ? dataInk : k === 'dataAck' ? ackInk : handInk;

    const makePacket = (p: StagePacket, lost: boolean): SVGGElement => {
      const g = el('g', {}, roadLayer);
      const ink = packetInk(p.kind);
      const filled = p.kind === 'data';
      el('rect', { x: 0, y: -PKT_H / 2, width: PKT_W, height: PKT_H, rx: 4, fill: filled ? ink : c.bg, stroke: ink, 'stroke-width': 1.5 }, g);
      text(g, PKT_W / 2, 0, p.label, { fill: filled ? c.textInverse : c.text, size: fontSizes.xs, anchor: 'middle', mono: true, weight: '600' });
      if (lost) {
        el('line', { x1: 4, y1: -PKT_H / 2 - 3, x2: PKT_W - 4, y2: PKT_H / 2 + 3, stroke: c.danger, 'stroke-width': 1.5 }, g);
        el('line', { x1: 4, y1: PKT_H / 2 + 3, x2: PKT_W - 4, y2: -PKT_H / 2 - 3, stroke: c.danger, 'stroke-width': 1.5 }, g);
      }
      return g;
    };

    const drawAxis = (): void => {
      axisLayer.replaceChildren();
      slotFrames.replaceChildren();
      el('line', { x1: AX0, y1: AXIS_Y, x2: AX1, y2: AXIS_Y, stroke: c.border }, axisLayer);
      for (let tk = 0; tk <= axisMax; tk++) {
        const x = tickX(tk);
        el('line', { x1: x, y1: AXIS_Y - 3, x2: x, y2: AXIS_Y + 3, stroke: c.border }, axisLayer);
        if (tk % 2 === 0) text(axisLayer, x, AXIS_NUM_Y - 2, String(tk), { fill: c.textMuted, size: fontSizes.xs, anchor: 'middle' });
      }
      text(axisLayer, MISS_X, AXIS_NUM_Y - 2, tr('label.notReceived', 'Not received'), { fill: c.textMuted, size: fontSizes.xs, anchor: 'middle' });
      segments.forEach((name, i) => {
        const y = laneY(i + 1);
        el('line', { x1: AX0, y1: y, x2: AX1, y2: y, stroke: c.border, 'stroke-dasharray': '1 4' }, axisLayer);
        text(axisLayer, AX0 - 16, y, name, { fill: c.text, size: fontSizes.xs, anchor: 'end', mono: true });
        el('rect', { x: slotX(CLIENT_X0, i + 1), y: SLOT_Y, width: SLOT_W, height: SLOT_H, rx: 3, fill: 'none', stroke: c.border, 'stroke-dasharray': '2 2' }, slotFrames);
        el('rect', { x: slotX(SERVER_X0, i + 1), y: SLOT_Y, width: SLOT_W, height: SLOT_H, rx: 3, fill: 'none', stroke: c.border, 'stroke-dasharray': '2 2' }, slotFrames);
      });
    };

    const drawGhosts = (): void => {
      ghostLayer.replaceChildren();
      ghosts.forEach((tk, i) => {
        if (tk < 0) return;
        el('rect', { x: tickX(tk) - MARK_W / 2, y: laneY(i + 1) - MARK_H / 2, width: MARK_W, height: MARK_H, rx: 3, fill: 'none', stroke: c.textMuted, 'stroke-dasharray': '3 2' }, ghostLayer);
      });
    };

    const makeMark = (seg: number): SVGGElement => {
      const g = el('g', {}, markLayer);
      el('rect', { x: -MARK_W / 2, y: -MARK_H / 2, width: MARK_W, height: MARK_H, rx: 3, fill: c.primary, stroke: c.primary }, g);
      text(g, 0, 0, segName(seg), { fill: c.textInverse, size: fontSizes.xs, anchor: 'middle', mono: true, weight: '600' });
      return g;
    };

    const inst: TcpHandshakeStage = {
      startRound(segs, max, keepGhost) {
        clearTimers();
        if (segs.length === 0) throw new Error('조각이 없다');
        if (!(max > 0)) throw new Error('틱 축 끝이 없다');
        const redraw = segs.join('|') !== segments.join('|') || max !== axisMax;
        segments = [...segs];
        axisMax = max;
        if (redraw) drawAxis();
        ghosts = keepGhost && lastHand.length === segs.length ? [...lastHand] : segs.map(() => -1);
        lastHand = segs.map(() => -1);
        drawGhosts();
        markLayer.replaceChildren();
        marks.clear();
        missLayer.replaceChildren();
        flyLayer.replaceChildren();
        roadLayer.replaceChildren();
        roadNodes.clear();
        copyLayer.replaceChildren();
        holdLayer.replaceChildren();
        heldBefore = [];
        connBox.style.opacity = '0';
        place(connBox, SERVER_X0 + 8, LISTEN_Y - 12, 0);
        nowLine.style.opacity = '0';
        for (const line of capLines) line.textContent = '';
      },

      showTick(s, ms) {
        if (segments.length === 0) throw new Error('판 머리 없이 틱이 왔다');
        // 캡션
        capLines[0]!.textContent = s.serverLine;
        capLines[1]!.textContent = s.clientLine;
        capLines[2]!.textContent = s.finalLine ?? '';

        // 상태 · 소켓
        clientState.textContent = s.clientState ?? '';
        serverState.textContent = s.serverState ?? '';
        listenLabel.textContent = s.listenText;
        if (s.connKey !== null) {
          connKeyText.textContent = s.connKey;
          if (connBox.style.opacity !== '1') {
            connBox.style.opacity = '1';
            place(connBox, SERVER_X0 + 8, CONN_Y - 6, ms);
          }
        }

        // 길 위의 패킷
        const live = new Set<string>();
        for (const p of s.flights) {
          live.add(p.id);
          const span = p.arrive - p.sent;
          if (span <= 0) throw new Error(`지연이 0 이하인 패킷: ${p.id}`);
          const frac = (s.tick - p.sent) / span;
          const y = p.dir === 'out' ? OUT_Y : BACK_Y;
          const x = p.dir === 'out' ? roadX(frac) : roadX(1 - frac);
          let g = roadNodes.get(p.id);
          if (!g) {
            g = makePacket(p, false);
            g.dataset['dir'] = p.dir;
            roadNodes.set(p.id, g);
            place(g, p.dir === 'out' ? roadX(0) : roadX(1), y, 0);
            void g.getBoundingClientRect?.();
          }
          place(g, x, y, ms);
        }
        for (const [id, g] of [...roadNodes]) {
          if (live.has(id)) continue;
          roadNodes.delete(id);
          const out = g.dataset['dir'] === 'out';
          const lostNode = g.dataset['lost'] === '1';
          if (lostNode) {
            g.style.transition = ms > 0 ? `opacity ${ms}ms` : 'none';
            g.style.opacity = '0';
          } else {
            place(g, out ? roadX(1) : roadX(0), out ? OUT_Y : BACK_Y, ms);
            g.style.opacity = '0';
          }
          later(ms, () => g.remove());
        }
        for (const p of s.lostNow) {
          const g = makePacket(p, true);
          g.dataset['lost'] = '1';
          roadNodes.set(`${p.id}-lost`, g);
          place(g, roadX(0), OUT_Y, 0);
          void g.getBoundingClientRect?.();
          place(g, roadX(0.45), OUT_Y, ms);
        }

        // 보내는 쪽 사본
        copyLayer.replaceChildren();
        for (const seg of s.copies) {
          const x = slotX(CLIENT_X0, seg);
          el('rect', { x, y: SLOT_Y, width: SLOT_W, height: SLOT_H, rx: 3, fill: c.bg, stroke: dataInk, 'stroke-width': 1.5 }, copyLayer);
          text(copyLayer, x + SLOT_W / 2, SLOT_Y + SLOT_H / 2, segName(seg), { fill: c.text, size: fontSizes.xs, anchor: 'middle', mono: true });
        }

        // 넘긴 표지 — 자국에서 새 자리로
        for (const seg of s.handed) {
          const tk = s.handTick[seg - 1];
          if (tk === undefined || tk < 0) throw new Error(`넘긴 틱이 없다: ${seg}`);
          const toX = tickX(tk);
          const toY = laneY(seg);
          const ghost = ghosts[seg - 1];
          if (ghost === undefined) throw new Error(`자국 자리가 없는 조각: ${seg}`);
          const g = makeMark(seg);
          marks.set(seg, g);
          const wasHeld = heldBefore.includes(seg);
          if (ghost >= 0) place(g, tickX(ghost), toY, 0);
          else if (wasHeld) place(g, slotX(SERVER_X0, seg) + SLOT_W / 2, SLOT_Y + SLOT_H / 2, 0);
          else place(g, SERVER_X0 + 8, OUT_Y, 0);
          // 쥐었던 조각은 대기 칸에서 제자리로 내려간다
          if (wasHeld && ghost >= 0) {
            const fly = el('g', {}, flyLayer);
            el('rect', { x: -SLOT_W / 2, y: -SLOT_H / 2, width: SLOT_W, height: SLOT_H, rx: 3, fill: c.itemComparing, stroke: c.itemComparing }, fly);
            text(fly, 0, 0, segName(seg), { fill: c.text, size: fontSizes.xs, anchor: 'middle', mono: true });
            place(fly, slotX(SERVER_X0, seg) + SLOT_W / 2, SLOT_Y + SLOT_H / 2, 0);
            void fly.getBoundingClientRect?.();
            place(fly, toX, toY, ms);
            fly.style.opacity = '0';
            later(ms, () => fly.remove());
          }
          void g.getBoundingClientRect?.();
          place(g, toX, toY, ms);
          lastHand[seg - 1] = tk;
        }

        // 받는 쪽 대기
        holdLayer.replaceChildren();
        for (const seg of s.held) {
          const x = slotX(SERVER_X0, seg);
          el('rect', { x, y: SLOT_Y, width: SLOT_W, height: SLOT_H, rx: 3, fill: c.itemComparing, stroke: c.itemComparing }, holdLayer);
          text(holdLayer, x + SLOT_W / 2, SLOT_Y + SLOT_H / 2, segName(seg), { fill: c.text, size: fontSizes.xs, anchor: 'middle', mono: true });
        }
        heldBefore = [...s.held];

        // 못 받은 조각 — 빈칸
        missLayer.replaceChildren();
        if (s.missing) {
          for (const seg of s.missing) {
            const y = laneY(seg);
            el('rect', { x: MISS_X - MARK_W / 2, y: y - MARK_H / 2, width: MARK_W, height: MARK_H, rx: 3, fill: 'none', stroke: c.danger, 'stroke-dasharray': '3 2', 'stroke-width': 1.5 }, missLayer);
            text(missLayer, MISS_X, y, '—', { fill: c.danger, size: fontSizes.xs, anchor: 'middle' });
          }
        }

        // 지금 틱
        nowLine.style.opacity = '1';
        nowLabel.textContent = s.tickLabel;
        place(nowLine, tickX(s.tick), 0, ms);
      },

      isInstant() {
        return instant();
      },

      reset() {
        clearTimers();
        segments = [];
        axisMax = 0;
        ghosts = [];
        lastHand = [];
        axisLayer.replaceChildren();
        slotFrames.replaceChildren();
        ghostLayer.replaceChildren();
        markLayer.replaceChildren();
        marks.clear();
        missLayer.replaceChildren();
        flyLayer.replaceChildren();
        roadLayer.replaceChildren();
        roadNodes.clear();
        copyLayer.replaceChildren();
        holdLayer.replaceChildren();
        heldBefore = [];
        connBox.style.opacity = '0';
        nowLine.style.opacity = '0';
        clientState.textContent = '';
        serverState.textContent = '';
        listenLabel.textContent = '';
        for (const line of capLines) line.textContent = '';
      },

      destroy() {
        clearTimers();
        root.remove();
      },
    };
    return inst;
  },
};
