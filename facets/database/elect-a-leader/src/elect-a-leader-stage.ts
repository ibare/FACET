/**
 * elect-a-leader 무대 — 먼저 깨어 표를 모은다.
 *
 * 노드마다 한 줄. 줄 가운데의 막대가 선출 타이머의 남은 몫이다 — 시계가 흐르면 왼쪽으로 줄어들고,
 * 표를 주거나 하트비트를 받으면 다시 늘어난다. 가장 먼저 바닥난 노드의 줄 오른쪽에 표 칸이 열리고,
 * 표 요청이 그 줄에서 다른 줄로 퍼져 나간 뒤, 준 표가 하나씩 그 칸으로 날아와 모인다.
 * 과반 금을 넘는 표가 닿으면 그 줄이 리더가 되고 타이머 막대가 걷힌다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { electInitial, type ElectNodeState, type ElectRole, type ElectScene } from './scene.js';

const H = 330;
const W = PIECE_CANVAS_W;
const SVG = 'http://www.w3.org/2000/svg';

const PAD = 16;
const CLOCK_Y = 24;
const HEAD_Y = 52;
const ROWS_TOP = 62;
const CAPTION_H = 56;
/** 줄 높이의 상한. 노드가 많으면 캔버스에서 역산한 값으로 줄어든다. */
const ROW_H_MAX = 46;

const LANE_X0 = 150;
const LANE_X1 = 392;
const DEADLINE_X = 404;
const MSG_X = 466;
const TRAY_X0 = 508;
const SLOT_PITCH_MAX = 20;
const BAR_H = 14;
const DISC_R = 7;

const MS_TIMEOUT_CLOCK_PER_MS = 4;
const MS_TIMEOUT_CLOCK_MIN = 300;
const MS_TIMEOUT_CLOCK_MAX = 700;
const MS_FLIGHT = 500;
const MS_REFILL = 260;
const MS_CROWN = 340;

type Flight = { kind: 'request' | 'vote' | 'heartbeat'; from: string; to: string; slot: number | null; p: number };

/** 정적 그리기에 얹는 운동 — 끝 자리에 아직 못 온 만큼. 비어 있으면 그 장면 그대로다. */
type Motion = {
  now?: number;
  deadlines?: Map<string, number | null>;
  looks?: Map<string, { role: ElectRole; term: number }>;
  /** 표 칸을 아직 열지 않는다 */
  hideTray?: boolean;
  /** 표 칸에서 가릴 칸 번호들 (0 부터) */
  hideSlots?: Set<number>;
  /** 한 칸의 크기 비율 */
  slotScale?: { slot: number; s: number };
  hideParked?: Set<string>;
  parkedScale?: number;
  crown?: number;
  flights?: Flight[];
};

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
}

function ease(p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(parent: Element, x: number, y: number, text: string, attrs: Record<string, string | number>): SVGTextElement {
  const node = el(parent, 'text', { x, y, ...attrs });
  node.textContent = text;
  return node;
}

/** 글자 폭 어림 — 넓은 글자(한글 · 한자권 · 데바나가리 등)는 한 칸, 나머지는 반 칸 남짓. */
function roughWidth(text: string, px: number): number {
  let w = 0;
  for (const ch of text) w += /[ᄀ-ᇿ⺀-鿿가-힯＀-￯ऀ-ॿ]/.test(ch) ? px : px * 0.56;
  return w;
}

function wrap(text: string, px: number, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const tryLine = cur === '' ? word : `${cur} ${word}`;
    if (cur !== '' && roughWidth(tryLine, px) > maxW) {
      lines.push(cur);
      cur = word;
    } else cur = tryLine;
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

type Layout = {
  rowH: number;
  rowY: Map<string, number>;
  scale: number;
  pitch: number;
};

function layoutOf(scene: ElectScene): Layout {
  const n = scene.nodes.length;
  const rowH = Math.min(ROW_H_MAX, (H - ROWS_TOP - CAPTION_H) / Math.max(1, n));
  const rowY = new Map<string, number>();
  scene.nodes.forEach((node, i) => rowY.set(node.id, ROWS_TOP + rowH * (i + 0.5)));
  const longest = Math.max(1, ...scene.nodes.map((x) => x.timeoutMs));
  const pitch = Math.min(SLOT_PITCH_MAX, (W - PAD - TRAY_X0) / Math.max(1, n));
  return { rowH, rowY, scale: (LANE_X1 - LANE_X0) / longest, pitch };
}

function yOf(lay: Layout, id: string): number {
  const y = lay.rowY.get(id);
  if (y === undefined) throw new Error(`elect-a-leader 무대: 모르는 노드 ${id}`);
  return y;
}

function slotX(lay: Layout, slot: number): number {
  return TRAY_X0 + lay.pitch * (slot + 0.5);
}

export const electALeaderStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const mdPx = parseFloat(fontSizes.md);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function roleText(role: ElectRole): string {
      if (role === 'leader') return t('label.leader', 'Leader');
      if (role === 'candidate') return t('label.candidate', 'Candidate');
      return t('label.follower', 'Follower');
    }

    function caption(scene: ElectScene): string {
      const s = scene.step;
      switch (s.kind) {
        case 'start':
          return t('caption.start', "No leader yet. Every follower's election timer is running down.");
        case 'timeout':
          return t(
            'caption.timeout',
            'At {at} ms the timer of {node} runs out. It becomes a candidate for term {term} and votes for itself.',
            { at: s.at, node: s.node, term: s.term },
          );
        case 'grant':
          return t(
            'caption.grant',
            'At {at} ms the vote request from {from} arrives. Each receiver votes for it and refills its own timer.',
            { at: s.at, from: s.from },
          );
        case 'vote': {
          if (scene.majority === null) throw new Error('elect-a-leader 무대: 과반을 모르는 채 표를 센다');
          return t('caption.vote', 'At {at} ms the vote of {from} arrives. Votes: {votes}. Majority: {majority}.', {
            at: s.at,
            from: s.from,
            votes: s.votes,
            majority: scene.majority,
          });
        }
        case 'leader':
          return t(
            'caption.leader',
            'At {at} ms the vote of {from} arrives. Votes: {votes}, a majority. Leader of term {term}: {node}.',
            { at: s.at, from: s.from, votes: s.votes, term: s.term, node: s.to },
          );
        case 'extra':
          return t('caption.extra', 'At {at} ms the remaining votes arrive. Votes: {votes}. Leader of term {term}: {node}.', {
            at: s.at,
            votes: s.votes,
            term: s.term,
            node: s.to,
          });
        case 'heartbeat':
          return t(
            'caption.heartbeat',
            'At {at} ms the first heartbeat from {leader} arrives. Every follower refills its timer.',
            { at: s.at, leader: s.leader },
          );
      }
    }

    function drawRow(g: Element, lay: Layout, scene: ElectScene, node: ElectNodeState, m: Motion, now: number): void {
      const y = yOf(lay, node.id);
      const look = m.looks?.get(node.id) ?? { role: node.role, term: node.term };
      const deadline = m.deadlines?.has(node.id) ? (m.deadlines.get(node.id) ?? null) : node.deadline;

      // 줄 띠 — 후보 · 리더의 줄은 물든다. 리더 띠는 왼쪽에서 자라 난다.
      if (look.role === 'candidate' || (look.role === 'leader' && (m.crown ?? 1) < 1)) {
        el(g, 'rect', {
          x: PAD - 8, y: y - lay.rowH / 2 + 2, width: W - 2 * PAD + 16, height: lay.rowH - 4, rx: 6,
          fill: colors.itemComparing, 'fill-opacity': 0.12,
        });
      }
      if (look.role === 'leader') {
        const grow = m.crown ?? 1;
        el(g, 'rect', {
          x: PAD - 8, y: y - lay.rowH / 2 + 2, width: (W - 2 * PAD + 16) * grow, height: lay.rowH - 4, rx: 6,
          fill: colors.accent, 'fill-opacity': 0.28,
        });
      }

      label(g, PAD, y + 5, node.id, {
        'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 700, fill: colors.text,
      });
      label(g, PAD + 38, y - 2, roleText(look.role), {
        'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': look.role === 'follower' ? 400 : 700,
        fill: colors.text,
      });
      label(g, PAD + 38, y + 13, t('label.term', 'Term {n}', { n: look.term }), {
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted,
      });

      // 타이머 막대 — 남은 몫 = 마감 − 지금.
      el(g, 'rect', {
        x: LANE_X0, y: y - BAR_H / 2, width: LANE_X1 - LANE_X0, height: BAR_H, rx: 3,
        fill: colors.bgSubtle, stroke: colors.border, 'stroke-dasharray': deadline === null ? '4 3' : 'none',
      });
      if (deadline !== null) {
        const left = Math.max(0, deadline - now);
        const w = left * lay.scale;
        if (w > 0.05) {
          el(g, 'rect', {
            x: LANE_X0, y: y - BAR_H / 2, width: w, height: BAR_H, rx: 3,
            fill: look.role === 'candidate' ? colors.itemComparing : colors.primary,
          });
        }
      }
      label(g, DEADLINE_X, y + 4, deadline === null ? '—' : t('label.ms', '{ms} ms', { ms: deadline }), {
        'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.textMuted,
      });

      // 주었지만 아직 닿지 않은 표 — 준 노드의 줄 끝에 머문다.
      if (scene.inFlight.includes(node.id) && !(m.hideParked?.has(node.id) ?? false)) {
        el(g, 'circle', {
          cx: MSG_X, cy: y, r: DISC_R * (m.parkedScale ?? 1),
          fill: colors.itemComparing, stroke: colors.text, 'stroke-width': 1,
        });
      }
    }

    function drawTray(g: Element, lay: Layout, scene: ElectScene, m: Motion): void {
      if (scene.candidate === null || scene.majority === null || m.hideTray === true) return;
      const y = yOf(lay, scene.candidate);
      const n = scene.nodes.length;
      for (let i = 0; i < n; i += 1) {
        el(g, 'circle', {
          cx: slotX(lay, i), cy: y, r: DISC_R + 1.5,
          fill: 'none', stroke: colors.border, 'stroke-dasharray': '2 2',
        });
      }
      const mx = TRAY_X0 + lay.pitch * scene.majority - 0.5;
      el(g, 'line', {
        x1: mx, y1: y - lay.rowH / 2 + 4, x2: mx, y2: y + lay.rowH / 2 - 4,
        stroke: colors.text, 'stroke-width': 1.5,
      });
      label(g, mx, y - lay.rowH / 2 + 1, t('label.majority', 'Majority: {n}', { n: scene.majority }), {
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted, 'text-anchor': 'end',
      });
      scene.ballots.forEach((_voter, i) => {
        if (m.hideSlots?.has(i) ?? false) return;
        const s = m.slotScale?.slot === i ? m.slotScale.s : 1;
        el(g, 'circle', {
          cx: slotX(lay, i), cy: y, r: DISC_R * s,
          fill: colors.itemComparing, stroke: colors.text, 'stroke-width': 1,
        });
      });
    }

    function drawFlight(g: Element, lay: Layout, f: Flight): void {
      const y0 = yOf(lay, f.from);
      const y1 = yOf(lay, f.to);
      const p = ease(f.p);
      if (f.kind === 'vote') {
        if (f.slot === null) throw new Error('elect-a-leader 무대: 표가 갈 칸이 없다');
        const x1 = slotX(lay, f.slot);
        const cx = lerp(MSG_X, x1, p);
        const cy = lerp(y0, y1, p) - Math.sin(Math.PI * p) * 10;
        el(g, 'circle', { cx, cy, r: DISC_R, fill: colors.itemComparing, stroke: colors.text, 'stroke-width': 1 });
        return;
      }
      // 표 요청 · 하트비트는 줄 끝을 따라 바깥으로 휘어 간다.
      const cx = MSG_X + Math.sin(Math.PI * p) * 16;
      const cy = lerp(y0, y1, p);
      if (f.kind === 'request') {
        el(g, 'rect', {
          x: cx - 6, y: cy - 4.5, width: 12, height: 9, rx: 1.5,
          fill: colors.bg, stroke: colors.itemComparing, 'stroke-width': 1.5,
        });
      } else {
        el(g, 'circle', { cx, cy, r: 5, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 });
      }
    }

    function draw(scene: ElectScene, m: Motion): void {
      svg.textContent = '';
      const lay = layoutOf(scene);
      const now = m.now ?? scene.now;
      const g = el(svg, 'g', {});

      label(g, PAD, CLOCK_Y, t('label.clock', 'Time: {ms} ms', { ms: Math.round(now) }), {
        'font-family': fonts.mono, 'font-size': fontSizes.lg, 'font-weight': 700, fill: colors.text,
      });
      const head = { 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted };
      label(g, LANE_X0, HEAD_Y, t('label.timer', 'Election timer'), head);
      label(g, DEADLINE_X, HEAD_Y, t('label.deadline', 'Deadline'), head);
      label(g, W - PAD, HEAD_Y, t('label.votes', 'Votes'), { ...head, 'text-anchor': 'end' });

      for (const node of scene.nodes) drawRow(g, lay, scene, node, m, now);
      drawTray(g, lay, scene, m);
      for (const f of m.flights ?? []) drawFlight(g, lay, f);

      const lines = wrap(caption(scene), mdPx, W - 2 * PAD).slice(0, 3);
      const top = H - CAPTION_H + 16;
      lines.forEach((line, i) => {
        label(g, PAD, top + i * (mdPx + 5), line, {
          'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text,
        });
      });
    }

    /** 한 시계로 흐른다. 세대가 바뀌거나 거둬지면 곧바로 풀린다. */
    function flow(mine: number, ms: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (ok: boolean): void => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish(false);
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) return finish(true);
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function play(next: ElectScene, mine: number): Promise<void> {
      const s = next.step;
      const alive = (): boolean => mine === gen && !destroyed;
      switch (s.kind) {
        case 'start':
          return;
        case 'timeout': {
          const clockMs = Math.min(
            MS_TIMEOUT_CLOCK_MAX,
            Math.max(MS_TIMEOUT_CLOCK_MIN, (s.at - s.was) * MS_TIMEOUT_CLOCK_PER_MS),
          );
          const looks = new Map([[s.node, { role: 'follower' as ElectRole, term: s.beforeTerm }]]);
          if (!(await flow(mine, clockMs, (p) => draw(next, {
            now: lerp(s.was, s.at, p), deadlines: new Map([[s.node, s.at]]), looks, hideTray: true,
          })))) return;
          const after = next.nodes.find((x) => x.id === s.node)?.deadline;
          if (after === undefined || after === null) throw new Error(`elect-a-leader 무대: 후보 ${s.node} 의 마감이 없다`);
          await flow(mine, MS_REFILL, (p) => draw(next, {
            deadlines: new Map([[s.node, lerp(s.at, after, ease(p))]]), slotScale: { slot: 0, s: ease(p) },
          }));
          return;
        }
        case 'grant': {
          const before = new Map<string, number | null>(s.refills.map((r) => [r.node, r.before]));
          const hideParked = new Set(s.refills.map((r) => r.node));
          if (!(await flow(mine, MS_FLIGHT, (p) => draw(next, {
            now: lerp(s.was, s.at, p), deadlines: before, hideParked,
            flights: s.refills.map((r) => ({ kind: 'request' as const, from: s.from, to: r.node, slot: null, p })),
          })))) return;
          if (!alive()) return;
          await flow(mine, MS_REFILL, (p) => draw(next, {
            deadlines: new Map(s.refills.map((r) => [r.node, lerp(r.before, r.deadline, ease(p))])),
            parkedScale: ease(p),
          }));
          return;
        }
        case 'vote':
        case 'leader': {
          const slot = next.ballots.length - 1;
          const looks = new Map<string, { role: ElectRole; term: number }>();
          const deadlines = new Map<string, number | null>();
          if (s.kind === 'leader') {
            looks.set(s.to, { role: 'candidate', term: s.term });
            deadlines.set(s.to, s.before);
          }
          if (!(await flow(mine, MS_FLIGHT, (p) => draw(next, {
            now: lerp(s.was, s.at, p), hideSlots: new Set([slot]), looks, deadlines,
            flights: [{ kind: 'vote', from: s.from, to: s.to, slot, p }],
          })))) return;
          if (s.kind !== 'leader' || !alive()) return;
          await flow(mine, MS_CROWN, (p) => draw(next, {
            crown: ease(p),
            deadlines: new Map([[s.to, lerp(s.before, s.at, ease(p))]]),
          }));
          return;
        }
        case 'extra': {
          const first = next.ballots.length - s.froms.length;
          const slots = new Set(s.froms.map((_f, i) => first + i));
          await flow(mine, MS_FLIGHT, (p) => draw(next, {
            now: lerp(s.was, s.at, p), hideSlots: slots,
            flights: s.froms.map((f, i) => ({ kind: 'vote' as const, from: f, to: s.to, slot: first + i, p })),
          }));
          return;
        }
        case 'heartbeat': {
          const before = new Map<string, number | null>(s.refills.map((r) => [r.node, r.before]));
          if (!(await flow(mine, MS_FLIGHT, (p) => draw(next, {
            now: lerp(s.was, s.at, p), deadlines: before,
            flights: s.refills.map((r) => ({ kind: 'heartbeat' as const, from: s.leader, to: r.node, slot: null, p })),
          })))) return;
          if (!alive()) return;
          await flow(mine, MS_REFILL, (p) => draw(next, {
            deadlines: new Map(s.refills.map((r) => [r.node, lerp(r.before, r.deadline, ease(p))])),
          }));
          return;
        }
      }
    }

    // 마운트 직후 걸음 0 — initialData 가 없으면 빈 캔버스로 둔다.
    svg.textContent = '';
    if (params.initialData !== undefined) draw(electInitial(params.initialData), {});

    return {
      async render(next: ElectScene, _prev: ElectScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        if (opts.animate) await play(next, mine);
        if (mine !== gen || destroyed) return;
        draw(next, {});
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
