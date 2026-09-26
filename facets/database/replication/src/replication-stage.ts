/**
 * 복제와 CAP — 무대.
 *
 * 위: 손님 · 리더 · 팔로워 넷과 그 이음, 오른쪽에 팔로워마다 읽은 값. 갈라지면 벽이 서고 벽을 지나는 이음이 끊어진다.
 * 아래: 시각 축 하나 (0 ms … 늦은 읽기). 팔로워마다 적는 시각이 눈금으로 서고, OK 깃발과 두 읽기의 표지가 그 위에 선다.
 *
 * 운동:
 *   - 손잡이 k 를 돌리면 OK 깃발이 앞 판의 자리에서 새 판의 자리로 축 위를 미끄러진다 (답 직후 읽기 표지도 함께)
 *   - 갈라짐을 켜면 벽이 솟고 끊긴 이음이 벌어진다. 거절이면 쓰기가 리더에서 손님 쪽으로 튕겨 나간다
 *   - 걸음 안: 쓰기가 리더에 닿고 · 새 값이 이음을 따라 팔로워로 건너가 적히고 · OK 가 손님에게 돌아가고 ·
 *     읽기 값이 팔로워에서 읽기 칸으로 나온다
 *
 * 무대는 셈을 하지 않는다 — 누가 새 값을 가졌는지 · 어느 읽기가 옛 값인지 · 답 시각은 모두 payload 로 받는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 440;

// 위 — 망
const CLIENT = { x: 62, y: 130, w: 84, h: 40 };
const LEADER = { x: 214, y: 130, w: 96, h: 64 };
const FOLLOWER_X = 500;
const FOLLOWER_W = 96;
const FOLLOWER_H = 40;
const FOLLOWER_Y0 = 50;
const FOLLOWER_DY = 56;
const READ_X = 642;
const READ_W = 84;
const READ_H = 28;
const WALL_X = 362;
const CUT_GAP = 0.09; // 끊긴 이음이 벽 양쪽으로 벌어지는 몫 (이음 길이의 비율)
// 아래 — 시각 축
const AXIS_Y = 330;
const AXIS_X0 = 70;
const AXIS_X1 = 672;
const FLAG_H = 44;
const DOT_Y = 388;
const DOT_GAP = 12;
const CAPTION_Y = 428;

export type ReplicationStage = {
  destroy(): void;
  startRound(reach: number[], dur: number): Promise<void>;
  writeArrive(ms: number, holders: boolean[], blocked: number[], dur: number): Promise<void>;
  refuse(ms: number, dur: number): Promise<void>;
  followerWrite(follower: number, ms: number, holders: boolean[], dur: number): Promise<void>;
  ok(ms: number, holders: boolean[], dur: number): Promise<void>;
  read(which: 'answer' | 'late', ms: number, values: number[], stale: boolean[], dur: number): Promise<void>;
  setCaption(text: string): void;
  reset(): void;
};

type Built = {
  nodes: string[];
  delays: number[];
  key: string;
  oldValue: number;
  newValue: number;
  lateReadMs: number;
};

function readBuilt(raw: Record<string, unknown> | undefined): Built | null {
  if (!raw) return null;
  const { nodes, delays, key, oldValue, newValue, lateReadMs } = raw;
  if (!Array.isArray(nodes) || !nodes.every((x) => typeof x === 'string')) return null;
  if (!Array.isArray(delays) || !delays.every((x) => typeof x === 'number')) return null;
  if (typeof key !== 'string' || typeof oldValue !== 'number' || typeof newValue !== 'number') return null;
  if (typeof lateReadMs !== 'number') return null;
  if (nodes.length !== delays.length + 1) return null;
  return { nodes: nodes as string[], delays: delays as number[], key, oldValue, newValue, lateReadMs };
}

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

export const replicationStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    let destroyed = false;
    const frames = new Set<number>();
    const finishers = new Set<() => void>();

    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const f of [...finishers]) f();
      finishers.clear();
    });

    /** 진행률을 스스로 그리는 tween. 되짚기 · 즉시 모드 · 파괴에서는 끝 상태로 건너뛴다. */
    const tween = (dur: number, draw: (p: number) => void): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed || isInstant() || dur <= 0) {
          draw(1);
          resolve();
          return;
        }
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          finishers.delete(finish);
          draw(1);
          resolve();
        };
        finishers.add(finish);
        const start = performance.now();
        const tick = (now: number): void => {
          if (done) return;
          if (destroyed || isInstant()) return finish();
          const p = Math.min(1, (now - start) / dur);
          draw(ease(p));
          if (p >= 1) finish();
          else frames.add(requestAnimationFrame(tick));
        };
        frames.add(requestAnimationFrame(tick));
      });

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const text = (x: number, y: number, s: string, size: string, fill: string, anchor = 'middle', weight = 400, parent: Element = svg) => {
      const n = el('text', { x, y, 'text-anchor': anchor, 'dominant-baseline': 'middle', fill, 'font-size': size, 'font-weight': weight }, parent);
      n.setAttribute('font-family', fonts.body);
      n.textContent = s;
      return n;
    };

    const data = readBuilt(params.initialData);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg });
    const caption = text(W / 2, CAPTION_Y, '', fontSizes.sm, c.text);

    if (!data) {
      const empty: ReplicationStage = {
        destroy() {
          destroyed = true;
        },
        startRound: () => Promise.reject(new Error('무대에 자료가 없다')),
        writeArrive: () => Promise.reject(new Error('무대에 자료가 없다')),
        refuse: () => Promise.reject(new Error('무대에 자료가 없다')),
        followerWrite: () => Promise.reject(new Error('무대에 자료가 없다')),
        ok: () => Promise.reject(new Error('무대에 자료가 없다')),
        read: () => Promise.reject(new Error('무대에 자료가 없다')),
        setCaption(s: string) {
          caption.textContent = s;
        },
        reset() {
          caption.textContent = '';
        },
      };
      return empty as unknown as ViewInstance;
    }

    const d = data;
    const nF = d.delays.length;
    const valueText = (v: number): string => `${d.key}=${v}`;
    const fy = (i: number): number => FOLLOWER_Y0 + i * FOLLOWER_DY;
    const maxMs = Math.max(d.lateReadMs, ...d.delays);
    const ax = (ms: number): number => AXIS_X0 + ((AXIS_X1 - AXIS_X0) * ms) / maxMs;

    // ── 머리 글자
    text(FOLLOWER_X, FOLLOWER_Y0 - 34, t('label.followers', 'Followers'), fontSizes.sm, c.textMuted, 'middle', 600);
    text(READ_X, FOLLOWER_Y0 - 34, t('label.reads', 'Reads'), fontSizes.sm, c.textMuted, 'middle', 600);

    // ── 이음 (리더 → 팔로워). 벽을 지나는 자리에서 두 토막으로 나눠 둔다 — 끊기면 두 토막이 벌어진다
    const L0 = { x: LEADER.x + LEADER.w / 2, y: LEADER.y };
    const linkEnd = (i: number) => ({ x: FOLLOWER_X - FOLLOWER_W / 2, y: fy(i) });
    const crossAt = (WALL_X - L0.x) / (FOLLOWER_X - FOLLOWER_W / 2 - L0.x);
    const linkGroup = el('g', {});
    const links = d.delays.map(() => {
      const a = el('line', { stroke: c.border, 'stroke-width': 2 }, linkGroup);
      const b = el('line', { stroke: c.border, 'stroke-width': 2 }, linkGroup);
      return { a, b, gap: 0 };
    });
    const drawLink = (i: number): void => {
      const l = links[i]!;
      const e = linkEnd(i);
      const pt = (f: number) => ({ x: L0.x + (e.x - L0.x) * f, y: L0.y + (e.y - L0.y) * f });
      const p1 = pt(crossAt - l.gap);
      const p2 = pt(crossAt + l.gap);
      l.a.setAttribute('x1', String(L0.x));
      l.a.setAttribute('y1', String(L0.y));
      l.a.setAttribute('x2', String(p1.x));
      l.a.setAttribute('y2', String(p1.y));
      l.b.setAttribute('x1', String(p2.x));
      l.b.setAttribute('y1', String(p2.y));
      l.b.setAttribute('x2', String(e.x));
      l.b.setAttribute('y2', String(e.y));
      const stroke = l.gap > 0.001 ? c.textMuted : c.border;
      l.a.setAttribute('stroke', stroke);
      l.b.setAttribute('stroke', stroke);
      l.a.setAttribute('stroke-dasharray', l.gap > 0.001 ? '4 3' : 'none');
      l.b.setAttribute('stroke-dasharray', l.gap > 0.001 ? '4 3' : 'none');
    };
    d.delays.forEach((_, i) => drawLink(i));

    // ── 갈라짐 벽 (높이가 0 에서 자란다)
    const WALL_TOP = (fy(0) + fy(1)) / 2 + 8;
    const WALL_BOTTOM = fy(nF - 1) + 30;
    const wall = el('line', { x1: WALL_X, x2: WALL_X, y1: WALL_TOP, y2: WALL_TOP, stroke: c.danger, 'stroke-width': 3, 'stroke-linecap': 'round' });
    const wallLabel = text(WALL_X, WALL_BOTTOM + 14, t('label.partition', 'Partition'), fontSizes.xs, c.danger, 'middle', 600);
    wallLabel.setAttribute('opacity', '0');
    let wallGrow = 0;
    const blockedLayer = el('g', {});
    const cutLabel = text(WALL_X, WALL_TOP - 12, t('label.cut', 'Cut off'), fontSizes.xs, c.danger, 'middle', 600);
    cutLabel.setAttribute('opacity', '0');
    const drawWall = (): void => {
      wall.setAttribute('y2', String(WALL_TOP + (WALL_BOTTOM - WALL_TOP) * wallGrow));
      wallLabel.setAttribute('opacity', String(wallGrow));
      wall.setAttribute('opacity', wallGrow > 0.001 ? '1' : '0');
    };
    drawWall();

    // ── 손님
    el('rect', {
      x: CLIENT.x - CLIENT.w / 2,
      y: CLIENT.y - CLIENT.h / 2,
      width: CLIENT.w,
      height: CLIENT.h,
      rx: 8,
      fill: c.bgSubtle,
      stroke: c.border,
      'stroke-width': 1.5,
    });
    text(CLIENT.x, CLIENT.y, t('label.client', 'Client'), fontSizes.sm, c.text, 'middle', 600);
    // 손님이 받은 답 (OK · 거절) — 손님 아래
    const clientReply = text(CLIENT.x, CLIENT.y + CLIENT.h / 2 + 16, '', fontSizes.sm, c.success, 'middle', 700);

    // ── 노드 (리더 + 팔로워)
    type NodeView = { box: SVGRectElement; value: SVGTextElement };
    const nodeViews: NodeView[] = [];
    {
      const box = el('rect', {
        x: LEADER.x - LEADER.w / 2,
        y: LEADER.y - LEADER.h / 2,
        width: LEADER.w,
        height: LEADER.h,
        rx: 8,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1.5,
      });
      text(LEADER.x, LEADER.y - 18, `${d.nodes[0]!}`, fontSizes.md, c.text, 'middle', 700);
      text(LEADER.x, LEADER.y + 1, t('label.leader', 'Leader'), fontSizes.xs, c.textMuted);
      const value = text(LEADER.x, LEADER.y + 19, valueText(d.oldValue), fontSizes.sm, c.text, 'middle', 600);
      value.setAttribute('font-family', fonts.mono);
      nodeViews.push({ box, value });
    }
    for (let i = 0; i < nF; i += 1) {
      const y = fy(i);
      const box = el('rect', {
        x: FOLLOWER_X - FOLLOWER_W / 2,
        y: y - FOLLOWER_H / 2,
        width: FOLLOWER_W,
        height: FOLLOWER_H,
        rx: 8,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1.5,
      });
      text(FOLLOWER_X - FOLLOWER_W / 2 + 10, y, d.nodes[i + 1]!, fontSizes.md, c.text, 'start', 700);
      const value = text(FOLLOWER_X + FOLLOWER_W / 2 - 10, y, valueText(d.oldValue), fontSizes.sm, c.text, 'end', 600);
      value.setAttribute('font-family', fonts.mono);
      nodeViews.push({ box, value });
    }
    let painted: boolean[] = nodeViews.map(() => false);
    const paintHolders = (holders: readonly boolean[]): void => {
      painted = [...holders];
      if (holders.length !== nodeViews.length) throw new Error(`holders 길이 ${holders.length} ≠ 노드 ${nodeViews.length}`);
      holders.forEach((h, i) => {
        const v = nodeViews[i]!;
        v.value.textContent = valueText(h ? d.newValue : d.oldValue);
        v.value.setAttribute('fill', h ? c.primary : c.text);
        v.box.setAttribute('stroke', h ? c.primary : c.border);
        v.box.setAttribute('stroke-width', h ? '2.5' : '1.5');
      });
    };

    // ── 읽기 칸 (팔로워마다)
    const readChips = d.delays.map((_, i) => {
      const g = el('g', { opacity: 0 });
      const box = el('rect', { x: -READ_W / 2, y: -READ_H / 2, width: READ_W, height: READ_H, rx: 6, fill: c.bg, stroke: c.border, 'stroke-width': 1.5 }, g);
      const label = text(0, 0, '', fontSizes.sm, c.text, 'middle', 600, g);
      label.setAttribute('font-family', fonts.mono);
      const place = (x: number): void => g.setAttribute('transform', `translate(${x} ${fy(i)})`);
      place(READ_X);
      return { g, box, label, place };
    });
    // 옛 값 범례
    const legendY = fy(nF - 1) + 36;
    el('rect', { x: READ_X - READ_W / 2, y: legendY - 6, width: 12, height: 12, rx: 3, fill: c.bg, stroke: c.danger, 'stroke-width': 2 });
    text(READ_X - READ_W / 2 + 18, legendY, t('label.stale', 'Old value'), fontSizes.xs, c.danger, 'start', 600);

    // ── 떠다니는 꾸러미 (쓰기 · 복제 · OK)
    const packet = el('g', { opacity: 0 });
    const packetBox = el('rect', { x: -22, y: -11, width: 44, height: 22, rx: 11, fill: c.primary }, packet);
    const packetText = text(0, 0, '', fontSizes.xs, c.textInverse, 'middle', 700, packet);
    packetText.setAttribute('font-family', fonts.mono);
    const movePacket = (x: number, y: number): void => packet.setAttribute('transform', `translate(${x} ${y})`);
    const fly = async (label: string, fill: string, from: { x: number; y: number }, to: { x: number; y: number }, dur: number): Promise<void> => {
      packetText.textContent = label;
      packetBox.setAttribute('fill', fill);
      packet.setAttribute('opacity', '1');
      await tween(dur, (p) => movePacket(from.x + (to.x - from.x) * p, from.y + (to.y - from.y) * p));
    };
    const hidePacket = (): void => packet.setAttribute('opacity', '0');

    // ── 시각 축
    el('line', { x1: AXIS_X0, x2: AXIS_X1, y1: AXIS_Y, y2: AXIS_Y, stroke: c.textMuted, 'stroke-width': 1.5 });
    text(AXIS_X1, DOT_Y + 22, t('label.time', 'Time (ms)'), fontSizes.xs, c.textMuted, 'end');
    for (const ms of [0, d.lateReadMs]) {
      el('line', { x1: ax(ms), x2: ax(ms), y1: AXIS_Y - 4, y2: AXIS_Y + 4, stroke: c.textMuted, 'stroke-width': 1.5 });
      text(ax(ms), AXIS_Y + 16, String(ms), fontSizes.xs, c.textMuted);
    }
    // 팔로워가 적는 시각 — 채워지면 적었다, 가위표면 끊겨 닿지 않는다
    const ticks = d.delays.map((ms, i) => {
      const x = ax(ms);
      const dot = el('circle', { cx: x, cy: AXIS_Y, r: 5, fill: c.bg, stroke: c.primary, 'stroke-width': 2 });
      text(x, AXIS_Y + 16, String(ms), fontSizes.xs, c.textMuted);
      text(x, AXIS_Y + 30, d.nodes[i + 1]!, fontSizes.xs, c.text, 'middle', 600);
      const cross = el('path', { d: `M${x - 6} ${AXIS_Y - 6} L${x + 6} ${AXIS_Y + 6} M${x + 6} ${AXIS_Y - 6} L${x - 6} ${AXIS_Y + 6}`, stroke: c.danger, 'stroke-width': 2, opacity: 0 });
      return { dot, cross };
    });
    // 지금 시각 커서
    const cursor = el('line', { x1: ax(0), x2: ax(0), y1: AXIS_Y - FLAG_H - 6, y2: AXIS_Y + 8, stroke: c.accent, 'stroke-width': 1.5, 'stroke-dasharray': '3 3', opacity: 0 });
    let cursorMs = 0;
    const moveCursor = async (ms: number, dur: number): Promise<void> => {
      cursor.setAttribute('opacity', '1');
      const from = cursorMs;
      cursorMs = ms;
      await tween(dur, (p) => {
        const x = ax(from + (ms - from) * p);
        cursor.setAttribute('x1', String(x));
        cursor.setAttribute('x2', String(x));
      });
    };

    // OK 깃발 — 판이 바뀌어도 남아 있다가 새 자리로 미끄러진다
    const flag = el('g', { opacity: 0 });
    el('line', { x1: 0, x2: 0, y1: 0, y2: -FLAG_H, stroke: c.success, 'stroke-width': 2 }, flag);
    const flagBox = el('rect', { x: 0, y: -FLAG_H, width: 56, height: 18, rx: 3, fill: c.success }, flag);
    const flagText = text(28, -FLAG_H + 9, t('label.ok', 'OK'), fontSizes.xs, c.textInverse, 'middle', 700, flag);
    const flagPole = flag.firstElementChild as SVGLineElement;
    let flagX: number | null = null;
    const placeFlag = (x: number): void => flag.setAttribute('transform', `translate(${x} ${AXIS_Y})`);
    const paintFlag = (refused: boolean): void => {
      const col = refused ? c.danger : c.success;
      flagPole.setAttribute('stroke', col);
      flagBox.setAttribute('fill', col);
      flagText.textContent = refused ? t('label.refused', 'Refused') : t('label.ok', 'OK');
      const w = Math.max(40, (flagText.textContent ?? '').length * parseFloat(fontSizes.xs) * 0.62 + 16);
      flagBox.setAttribute('width', String(w));
      flagText.setAttribute('x', String(w / 2));
    };
    const slideFlag = async (ms: number, refused: boolean, dur: number): Promise<void> => {
      paintFlag(refused);
      flag.setAttribute('opacity', '1');
      const to = ax(ms);
      const from = flagX ?? ax(0);
      flagX = to;
      await tween(dur, (p) => placeFlag(from + (to - from) * p));
    };

    // 읽기 표지 — 축 아래, 읽기 시각에 점 넷 (옛 값이면 채운 위험색)
    const makeDots = () => {
      const g = el('g', { opacity: 0 });
      const dots = d.delays.map((_, i) => el('circle', { cx: (i - (nF - 1) / 2) * DOT_GAP, cy: 0, r: 4.5, fill: c.bg, stroke: c.primary, 'stroke-width': 1.5 }, g));
      let x: number | null = null;
      const place = (px: number): void => g.setAttribute('transform', `translate(${px} ${DOT_Y})`);
      return {
        g,
        dots,
        get x() {
          return x;
        },
        set x(v: number | null) {
          x = v;
        },
        place,
      };
    };
    const answerDots = makeDots();
    const lateDots = makeDots();

    // ── 판 상태
    let reachNow: number[] = d.delays.map(() => 1);
    let wallOn = false;

    const clearRound = (): void => {
      paintHolders(nodeViews.map(() => false));
      clientReply.textContent = '';
      hidePacket();
      cutLabel.setAttribute('opacity', '0');
      while (blockedLayer.firstChild) blockedLayer.firstChild.remove();
      for (const r of readChips) {
        r.g.setAttribute('opacity', '0');
        r.place(READ_X);
      }
      ticks.forEach((tk) => tk.dot.setAttribute('fill', c.bg));
    };

    const stage: ReplicationStage = {
      destroy() {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const f of [...finishers]) f();
        finishers.clear();
      },

      async startRound(reach, dur) {
        if (reach.length !== nF) throw new Error(`닿음 길이 ${reach.length} ≠ 팔로워 ${nF}`);
        clearRound();
        // 앞 판의 깃발과 읽기 표지는 자리만 흐리게 남긴다 — 결론(글자 · 옛 값 채움)은 걷고, 이 판의 ok · refuse · read 가 다시 칠한다
        if (flagX !== null) {
          flag.setAttribute('opacity', '0.3');
          flagPole.setAttribute('stroke', c.textMuted);
          flagBox.setAttribute('fill', c.textMuted);
          flagText.textContent = '';
        }
        for (const dots of [answerDots, lateDots]) {
          if (dots.x === null) continue;
          dots.g.setAttribute('opacity', '0.3');
          for (const dot of dots.dots) {
            dot.setAttribute('fill', c.bg);
            dot.setAttribute('stroke', c.textMuted);
          }
        }
        const cutNow = reach.map((r) => r !== 1);
        const wasCut = reachNow.map((r) => r !== 1);
        reachNow = [...reach];
        const wallTo = cutNow.some(Boolean);
        const wallFrom = wallOn;
        wallOn = wallTo;
        ticks.forEach((tk, i) => {
          tk.cross.setAttribute('opacity', cutNow[i] ? '1' : '0');
          tk.dot.setAttribute('stroke', cutNow[i] ? c.textMuted : c.primary);
        });
        await Promise.all([
          moveCursor(0, dur),
          tween(dur, (p) => {
            wallGrow = wallFrom === wallTo ? (wallTo ? 1 : 0) : wallTo ? p : 1 - p;
            drawWall();
            links.forEach((l, i) => {
              const from = wasCut[i] ? CUT_GAP : 0;
              const to = cutNow[i] ? CUT_GAP : 0;
              l.gap = from + (to - from) * p;
              drawLink(i);
            });
          }),
        ]);
      },

      async writeArrive(ms, holders, blocked, dur) {
        for (const i of blocked) if (i < 0 || i >= nF) throw new Error(`막힌 팔로워 색인 ${i} 이 범위 밖이다`);
        const half = dur / 2;
        await Promise.all([
          moveCursor(ms, dur),
          fly(valueText(d.newValue), c.primary, { x: CLIENT.x + CLIENT.w / 2, y: CLIENT.y }, { x: LEADER.x - LEADER.w / 2 - 22, y: LEADER.y }, half),
        ]);
        paintHolders(holders);
        if (blocked.length === 0) return;
        // 받아들인 판 — 끊긴 이음으로 가던 복제가 벽까지 가서 사라진다
        hidePacket();
        const shots = blocked.map((i) => {
          const e = linkEnd(i);
          const f = crossAt - CUT_GAP;
          const to = { x: L0.x + (e.x - L0.x) * f, y: L0.y + (e.y - L0.y) * f };
          const dot = el('circle', { cx: L0.x, cy: L0.y, r: 6, fill: c.primary }, blockedLayer);
          return { dot, to };
        });
        await tween(half, (p) => {
          for (const s of shots) {
            s.dot.setAttribute('cx', String(L0.x + (s.to.x - L0.x) * p));
            s.dot.setAttribute('cy', String(L0.y + (s.to.y - L0.y) * p));
            s.dot.setAttribute('opacity', String(p < 0.7 ? 1 : (1 - p) / 0.3));
          }
        });
        for (const s of shots) s.dot.remove();
        cutLabel.setAttribute('opacity', '1');
      },

      async refuse(ms, dur) {
        // 리더가 적지 않고 쓰기를 튕겨 낸다
        await Promise.all([
          moveCursor(ms, dur),
          slideFlag(ms, true, dur),
          fly(valueText(d.newValue), c.danger, { x: LEADER.x - LEADER.w / 2 - 22, y: LEADER.y }, { x: CLIENT.x, y: CLIENT.y + CLIENT.h / 2 + 16 }, dur),
        ]);
        hidePacket();
        clientReply.textContent = t('label.refused', 'Refused');
        clientReply.setAttribute('fill', c.danger);
      },

      async followerWrite(follower, ms, holders, dur) {
        if (follower < 0 || follower >= nF) throw new Error(`팔로워 색인 ${follower} 이 범위 밖이다`);
        // 리더는 받아들이면 곧 적는다 — holders[0] 이 그것을 말한다
        if (holders.length !== painted.length) throw new Error(`holders 길이 ${holders.length} ≠ 노드 ${painted.length}`);
        paintHolders(painted.map((h, i) => (i === 0 ? holders[0]! : h)));
        const e = linkEnd(follower);
        await Promise.all([moveCursor(ms, dur), fly(valueText(d.newValue), c.primary, L0, { x: e.x - 22, y: e.y }, dur)]);
        hidePacket();
        paintHolders(holders);
        ticks[follower]!.dot.setAttribute('fill', c.primary);
      },

      async ok(ms, holders, dur) {
        paintHolders(holders);
        await Promise.all([
          moveCursor(ms, dur),
          slideFlag(ms, false, dur),
          fly(t('label.ok', 'OK'), c.success, { x: LEADER.x - LEADER.w / 2, y: LEADER.y }, { x: CLIENT.x, y: CLIENT.y + CLIENT.h / 2 + 16 }, dur),
        ]);
        hidePacket();
        clientReply.textContent = t('label.ok', 'OK');
        clientReply.setAttribute('fill', c.success);
      },

      async read(which, ms, values, stale, dur) {
        if (values.length !== nF || stale.length !== nF) throw new Error('읽기 값의 길이가 팔로워 수와 다르다');
        const dots = which === 'answer' ? answerDots : lateDots;
        const fromX = dots.x ?? ax(ms);
        const toX = ax(ms);
        dots.x = toX;
        dots.g.setAttribute('opacity', '1');
        dots.dots.forEach((dot, i) => {
          dot.setAttribute('fill', stale[i] ? c.danger : c.bg);
          dot.setAttribute('stroke', stale[i] ? c.danger : c.primary);
        });
        readChips.forEach((r, i) => {
          r.label.textContent = valueText(values[i]!);
          r.label.setAttribute('fill', stale[i] ? c.danger : c.text);
          r.box.setAttribute('stroke', stale[i] ? c.danger : c.border);
          r.box.setAttribute('stroke-width', stale[i] ? '2' : '1.5');
          r.g.setAttribute('opacity', '1');
        });
        const startX = FOLLOWER_X + FOLLOWER_W / 2 - READ_W / 2;
        await Promise.all([
          moveCursor(ms, dur),
          tween(dur, (p) => {
            dots.place(fromX + (toX - fromX) * p);
            for (const r of readChips) r.place(startX + (READ_X - startX) * p);
          }),
        ]);
      },

      setCaption(s) {
        caption.textContent = s;
      },

      reset() {
        for (const f of [...finishers]) f();
        clearRound();
        flagX = null;
        flag.setAttribute('opacity', '0');
        for (const dots of [answerDots, lateDots]) {
          dots.x = null;
          dots.g.setAttribute('opacity', '0');
        }
        reachNow = d.delays.map(() => 1);
        wallOn = false;
        wallGrow = 0;
        drawWall();
        links.forEach((l, i) => {
          l.gap = 0;
          drawLink(i);
        });
        ticks.forEach((tk) => {
          tk.cross.setAttribute('opacity', '0');
          tk.dot.setAttribute('stroke', c.primary);
        });
        cursorMs = 0;
        cursor.setAttribute('opacity', '0');
        caption.textContent = '';
      },
    };
    return stage as unknown as ViewInstance;
  },
};
