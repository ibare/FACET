/**
 * multiway-branch stage — 걸러 내려가다 빠져나간다.
 *
 * 맨 바깥 줄은 왼쪽에 위에서 아래로 선다. 흐름(구슬)은 그 옆의 세로 길을 따라 떨어진다.
 * 조건 머리줄마다 길을 가로막는 문짝이 있다. 조건이 거짓이면 문짝이 아래로 열리고 구슬은
 * 다음 조건까지 떨어진다. 참이면 문짝은 닫힌 채 옆문으로 굴러 나가 그 갈래의 몸(오른쪽)에
 * 들어간다. 몸을 마치면 오른쪽 난간을 타고 내려가 사슬 아래로 합류하는데, 그 사이 아래
 * 조건들은 한 번도 묻지 않은 채 지나쳐진다.
 *
 * 장면의 자취(visits)에서 화면 전체를 세운다 — `step` 은 운동을 고르는 데만 쓴다.
 */
import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import {
  bodyOf,
  chainsOf,
  type Chain,
  type MultiwayBranchScene,
  type SceneLine,
  type SceneTest,
  type SceneValue,
} from './scene.js';

const H = 420;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 아래 문안 두 줄이 차지하는 높이 */
const CAPTION_H = 58;
/** 한 줄 칸의 상한 */
const UNIT_MAX = 46;
const BALL_R = 9;
/** 거짓 문짝이 열리는 각 */
const DOOR_OPEN_DEG = 75;
const FRAME_MS = 16;

type Pt = { x: number; y: number };

type Layout = {
  unit: number;
  boxH: number;
  headX: number;
  headW: number;
  laneX: number;
  bodyX: number;
  bodyW: number;
  railX: number;
  topY: number;
  y: number[];
  chains: Chain[];
  mergeY: Map<Chain, number>;
};

function r1(v: number): number {
  const n = Math.round(v * 10) / 10;
  return n === 0 ? 0 : n;
}

function fmt(v: SceneValue): string {
  return typeof v === 'number' ? String(v) : `"${v}"`;
}

function chainOfLine(chains: readonly Chain[], line: number): Chain | undefined {
  return chains.find((c) => line >= c.heads[0] && line <= c.end);
}

function layoutOf(lines: readonly SceneLine[], W: number): Layout {
  const chains = chainsOf(lines);
  const lastHeads = new Set(chains.map((c) => c.heads[c.heads.length - 1]));
  const TOP_PAD = 0.7;
  const MERGE_GAP = 0.8;
  let units = TOP_PAD;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].indent !== 0) continue;
    units += Math.max(1, bodyOf(lines, i).length);
    if (lastHeads.has(i)) units += MERGE_GAP;
  }
  const area = H - CAPTION_H - 10;
  const unit = Math.min(UNIT_MAX, area / Math.max(units, 1));
  const y: number[] = new Array<number>(lines.length).fill(0);
  const mergeY = new Map<Chain, number>();
  let cursor = unit * TOP_PAD;
  const topY = cursor * 0.25;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].indent !== 0) continue;
    const body = bodyOf(lines, i);
    const n = Math.max(1, body.length);
    y[i] = r1(cursor + (n * unit) / 2);
    body.forEach((j, k) => {
      y[j] = r1(cursor + (k + 0.5) * unit);
    });
    cursor += n * unit;
    if (lastHeads.has(i)) {
      const c = chains.find((ch) => ch.heads[ch.heads.length - 1] === i);
      if (c) mergeY.set(c, r1(cursor + (MERGE_GAP * unit) / 2));
      cursor += MERGE_GAP * unit;
    }
  }
  const laneX = Math.round(W * 0.4);
  const bodyX = Math.round(W * 0.56);
  return {
    unit,
    boxH: r1(Math.min(unit - 6, 38)),
    headX: 12,
    headW: laneX - 26 - 12,
    laneX,
    bodyX,
    bodyW: Math.round(W * 0.25),
    railX: Math.round(W * 0.9),
    topY: r1(topY),
    y,
    chains,
    mergeY,
  };
}

function pointOf(L: Layout, lines: readonly SceneLine[], line: number): Pt {
  return lines[line].indent === 0 ? { x: L.laneX, y: L.y[line] } : { x: L.bodyX - 16, y: L.y[line] };
}

/** 머리줄 — 몸 줄이면 그 몸을 가진 맨 바깥 줄 */
function headOf(lines: readonly SceneLine[], line: number): number {
  for (let i = line; i >= 0; i -= 1) if (lines[i].indent === 0) return i;
  return 0;
}

/** 흐름이 from 에서 line 으로 가는 길 */
function pathOf(L: Layout, lines: readonly SceneLine[], from: number | null, to: number): Pt[] {
  const end = pointOf(L, lines, to);
  if (from === null) return [{ x: end.x, y: L.topY }, end];
  const start = pointOf(L, lines, from);
  const fromTop = lines[from].indent === 0;
  const toTop = lines[to].indent === 0;
  if (fromTop && !toTop) {
    const hy = L.y[headOf(lines, to)];
    return dedupe([start, { x: L.laneX, y: hy }, end]);
  }
  if (!fromTop && toTop) {
    const chain = chainOfLine(L.chains, from);
    const my = chain ? L.mergeY.get(chain) : undefined;
    if (my !== undefined) {
      const ly = r1(start.y + L.unit / 2 - 2);
      return dedupe([
        start,
        { x: start.x, y: ly },
        { x: L.railX, y: ly },
        { x: L.railX, y: my },
        { x: L.laneX, y: my },
        end,
      ]);
    }
  }
  return dedupe([start, end]);
}

function dedupe(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || q.x !== p.x || q.y !== p.y) out.push(p);
  }
  return out;
}

function lengthOf(pts: readonly Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i += 1) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s;
}

/** 길 위 p(0~1) 까지의 앞부분 — 끝점이 곧 그 자리 */
function prefixOf(pts: readonly Pt[], p: number): Pt[] {
  const total = lengthOf(pts);
  if (pts.length === 0) return [];
  let left = total * p;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (left >= d) {
      out.push(b);
      left -= d;
      continue;
    }
    const k = d === 0 ? 0 : left / d;
    out.push({ x: r1(a.x + (b.x - a.x) * k), y: r1(a.y + (b.y - a.y) * k) });
    break;
  }
  return out;
}

function pointsAttr(pts: readonly Pt[]): string {
  return pts.map((p) => `${r1(p.x)},${r1(p.y)}`).join(' ');
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 이번 걸음에서 흐름이 막 사슬을 벗어났는가 — 그 사슬 */
function leftChain(chains: readonly Chain[], from: number | null, line: number): Chain | undefined {
  if (from === null) return undefined;
  const c = chainOfLine(chains, from);
  return c && line > c.end ? c : undefined;
}

type Motion = {
  ball: SVGCircleElement | null;
  trail: SVGPolylineElement | null;
  door: { el: SVGLineElement; hinge: Pt; open: boolean } | null;
  /** 흐름이 닿은 뒤에야 보일 것 */
  onArrive: SVGElement[];
  /** 구슬이 그 높이를 지나야 보일 것 */
  onPass: { y: number; el: SVGElement }[];
};

export const multiwayBranchStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<MultiwayBranchScene> {
    const svg = params.canvas;
    const W = PIECE_CANVAS_W;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      attrs: Record<string, string | number>,
    ): SVGTextElement {
      const node = el('text', { x: r1(x), y: r1(y), ...attrs }, parent);
      node.textContent = text;
      return node;
    }

    function captionFor(scene: MultiwayBranchScene, L: Layout | null): [string, string] {
      const step = scene.step;
      if (!step) return ['', ''];
      if (step.kind === 'start') return [t('caption.start', 'Nothing has run yet.'), ''];
      const line = scene.lines[step.line];
      let first = '';
      if (step.test) {
        const tt: SceneTest = step.test;
        const cond =
          tt.l !== undefined && tt.op !== undefined && tt.r !== undefined
            ? `${fmt(tt.l)} ${tt.op} ${fmt(tt.r)}`
            : line.text.replace(/^(if|else if)\s+/, '');
        first = tt.result
          ? t('caption.true', '{cond} is true — leave through this branch.', { cond })
          : t('caption.false', '{cond} is false — drop to the next.', { cond });
      } else if (step.assigned) {
        const vars = { name: step.assigned.name, value: fmt(step.assigned.value) };
        if (step.assigned.declared) first = t('caption.declare', 'Declare {name} = {value}', vars);
        else if (line.indent > 0) first = t('caption.body', 'Inside the branch: {name} = {value}', vars);
        else first = t('caption.assign', 'Set {name} = {value}', vars);
      } else if (step.shown !== undefined) {
        first = t('caption.show', 'Shown: {out}', { out: step.shown });
      }
      let second = '';
      const c = L ? leftChain(L.chains, step.from, step.line) : undefined;
      if (c) {
        const conds = c.heads.filter((h) => scene.lines[h].kind !== 'else');
        const askedSet = new Set(scene.visits.filter((v) => v.test).map((v) => v.line));
        const asked = conds.filter((h) => askedSet.has(h)).length;
        const rest = conds.length - asked;
        if (rest > 0) {
          second = t(
            'caption.passed',
            'Conditions asked: {asked} of {total}. Passed without asking: {rest}.',
            { asked, total: conds.length, rest },
          );
        }
      }
      return [first, second];
    }

    /** 장면 전체를 세운다. 운동이 손댈 요소를 돌려준다 */
    function drawStatic(scene: MultiwayBranchScene): Motion {
      svg.textContent = '';
      const motion: Motion = { ball: null, trail: null, door: null, onArrive: [], onPass: [] };
      const lines = scene.lines;
      if (lines.length === 0) return motion;
      const L = layoutOf(lines, W);

      const tests = new Map<number, SceneTest>();
      const visited = new Set<number>();
      let furthest = -1;
      for (const v of scene.visits) {
        visited.add(v.line);
        if (v.test) tests.set(v.line, v.test);
        furthest = Math.max(furthest, v.line);
      }
      const current = scene.visits.length > 0 ? scene.visits[scene.visits.length - 1].line : null;
      const step = scene.step && scene.step.kind === 'line' ? scene.step : null;
      const justLeft = step ? leftChain(L.chains, step.from, step.line) : undefined;
      const passedChains = new Set(L.chains.filter((c) => furthest > c.end));

      const guides = el('g', { fill: 'none', stroke: colors.border, 'stroke-width': 1.5 }, svg);
      const trails = el(
        'g',
        { fill: 'none', stroke: colors.itemActive, 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: 0.6 },
        svg,
      );
      const boxes = el('g', {}, svg);
      const doors = el('g', { 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
      const top = el('g', {}, svg);

      // 세로 길 — 맨 바깥 줄 사이. else 로 끝나는 사슬의 마지막 머리 아래는 떨어질 길이 없다
      const tops: number[] = [];
      for (let i = 0; i < lines.length; i += 1) if (lines[i].indent === 0) tops.push(i);
      if (tops.length > 0) {
        el('line', { x1: L.laneX, y1: L.topY, x2: L.laneX, y2: L.y[tops[0]] }, guides);
      }
      for (let k = 0; k + 1 < tops.length; k += 1) {
        const a = tops[k];
        const b = tops[k + 1];
        const c = L.chains.find((ch) => ch.heads[ch.heads.length - 1] === a);
        const my = c ? L.mergeY.get(c) : undefined;
        // 합류 자리에서 다음 줄까지
        if (my !== undefined) el('line', { x1: L.laneX, y1: my, x2: L.laneX, y2: L.y[b] }, guides);
        if (c && lines[a].kind === 'else') continue;
        el('line', { x1: L.laneX, y1: L.y[a], x2: L.laneX, y2: my ?? L.y[b] }, guides);
      }
      // 옆문과 난간 — 몸으로 나가는 길, 몸에서 합류로 내려가는 길
      for (const c of L.chains) {
        const my = L.mergeY.get(c);
        let railTop: number | null = null;
        c.heads.forEach((h, k) => {
          const body = c.bodies[k];
          if (body.length === 0) return;
          el(
            'line',
            { x1: L.laneX, y1: L.y[h], x2: L.bodyX - 16, y2: L.y[h], 'stroke-dasharray': '4 4' },
            guides,
          );
          const last = body[body.length - 1];
          const ly = r1(L.y[last] + L.unit / 2 - 2);
          el('polyline', { points: pointsAttr([{ x: L.bodyX - 16, y: L.y[last] }, { x: L.bodyX - 16, y: ly }, { x: L.railX, y: ly }]) }, guides);
          if (railTop === null) railTop = ly;
        });
        if (my !== undefined && railTop !== null) {
          el('polyline', { points: pointsAttr([{ x: L.railX, y: railTop }, { x: L.railX, y: my }, { x: L.laneX, y: my }]) }, guides);
        }
      }

      // 지나온 길
      let prev: number | null = null;
      for (let k = 0; k < scene.visits.length; k += 1) {
        const v = scene.visits[k];
        const pl = el('polyline', { points: pointsAttr(pathOf(L, lines, prev, v.line)) }, trails);
        if (k === scene.visits.length - 1) motion.trail = pl;
        prev = v.line;
      }

      // 줄 상자
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const y = L.y[i];
        const chain = chainOfLine(L.chains, i);
        const passed = chain !== undefined && passedChains.has(chain) && !visited.has(i);
        const isCurrent = current === i;
        const isTop = line.indent === 0;
        const x = isTop ? L.headX : L.bodyX + (line.indent - 1) * 14;
        const w = isTop ? L.headW : L.bodyW - (line.indent - 1) * 14;
        const isCond = line.kind === 'if' || line.kind === 'elseIf';
        const bodyRan = !isTop && visited.has(i);
        el(
          'rect',
          {
            x: r1(x),
            y: r1(y - L.boxH / 2),
            width: r1(w),
            height: L.boxH,
            rx: 6,
            fill: isTop || bodyRan ? colors.bgSubtle : colors.bg,
            stroke: isCurrent ? colors.itemActive : colors.border,
            'stroke-width': isCurrent ? 2 : 1,
            ...(passed ? { 'stroke-dasharray': '3 3' } : {}),
          },
          boxes,
        );
        label(boxes, x + 10, isCond ? y - 3 : y + 5, line.text, {
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: passed ? colors.textMuted : colors.text,
        });

        if (isCond) {
          const test = tests.get(i);
          if (test) {
            const cmp =
              test.l !== undefined && test.op !== undefined && test.r !== undefined
                ? `${fmt(test.l)} ${test.op} ${fmt(test.r)}`
                : '';
            const g = el('g', {}, boxes);
            if (cmp) {
              label(g, x + 10, y + 12, cmp, {
                'font-family': fonts.mono,
                'font-size': fontSizes.xs,
                fill: colors.textMuted,
              });
            }
            label(
              g,
              x + w - 10,
              y + 12,
              test.result ? t('label.true', 'true') : t('label.false', 'false'),
              {
                'font-family': fonts.body,
                'font-size': fontSizes.sm,
                'font-weight': 600,
                'text-anchor': 'end',
                fill: test.result ? colors.success : colors.textMuted,
              },
            );
            if (isCurrent && step && step.line === i) motion.onArrive.push(g);
          } else if (passed) {
            const tag = label(boxes, x + 10, y + 12, t('label.notAsked', 'not asked'), {
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              'font-style': 'italic',
              fill: colors.textMuted,
            });
            if (justLeft && justLeft === chain) motion.onPass.push({ y, el: tag });
          }
          // 문짝 — 길을 가로막는다. 거짓이면 아래로 열려 있다
          const hinge = { x: L.laneX - 14, y: r1(y + BALL_R + 3) };
          const open = test !== undefined && !test.result;
          const door = el(
            'line',
            {
              x1: hinge.x,
              y1: hinge.y,
              x2: L.laneX + 14,
              y2: hinge.y,
              stroke: test ? (test.result ? colors.success : colors.textMuted) : colors.text,
              ...(open ? { transform: `rotate(${DOOR_OPEN_DEG} ${hinge.x} ${hinge.y})` } : {}),
            },
            doors,
          );
          if (isCurrent && step && step.line === i) motion.door = { el: door, hinge, open };
        }

        // 출력
        const shownHere = scene.visits.filter((v) => v.line === i && v.shown !== undefined);
        if (shownHere.length > 0) {
          const g = el('g', {}, boxes);
          el(
            'rect',
            {
              x: L.bodyX,
              y: r1(y - L.boxH / 2),
              width: L.bodyW,
              height: L.boxH,
              rx: 6,
              fill: colors.bg,
              stroke: colors.success,
              'stroke-width': 1.5,
            },
            g,
          );
          label(g, L.bodyX + 10, y + 4, t('label.output', 'output'), {
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          });
          label(g, L.bodyX + L.bodyW - 12, y + 6, shownHere.map((v) => v.shown ?? '').join(' '), {
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
            'font-weight': 600,
            'text-anchor': 'end',
            fill: colors.text,
          });
          if (isCurrent && step && step.line === i) motion.onArrive.push(g);
        }
      }

      // 흐름
      if (current !== null) {
        const p = pointOf(L, lines, current);
        motion.ball = el('circle', { cx: p.x, cy: p.y, r: BALL_R, fill: colors.itemActive }, top);
      }

      // 문안
      const [first, second] = captionFor(scene, L);
      label(top, W / 2, H - CAPTION_H + 22, first, {
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'text-anchor': 'middle',
        fill: colors.text,
      });
      if (second) {
        label(top, W / 2, H - CAPTION_H + 44, second, {
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
          fill: colors.textMuted,
        });
      }
      return motion;
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const id = setTimeout(() => {
          timers.delete(id);
          waiters.delete(wake);
          resolve();
        }, ms);
        const wake = (): void => {
          clearTimeout(id);
          timers.delete(id);
          waiters.delete(wake);
          resolve();
        };
        timers.add(id);
        waiters.add(wake);
      });
    }

    async function move(scene: MultiwayBranchScene, motion: Motion, mine: number): Promise<void> {
      const step = scene.step;
      if (!step || step.kind !== 'line' || !motion.ball) return;
      const L = layoutOf(scene.lines, W);
      const path = pathOf(L, scene.lines, step.from, step.line);
      const len = lengthOf(path);
      if (len === 0) return;
      const ms = Math.max(350, Math.min(700, 250 + len * 0.8));
      const frames = Math.max(1, Math.ceil(ms / FRAME_MS));
      // 조건 머리에 닿는 걸음은 앞 70% 가 떨어짐, 나머지가 문짝
      const travel = motion.door ? 0.7 : 1;
      const alive = (): boolean => mine === gen && !destroyed;

      const paint = (p: number): void => {
        const q = ease(Math.min(1, p / travel));
        const pre = prefixOf(path, q);
        const at = pre[pre.length - 1];
        motion.ball?.setAttribute('cx', String(r1(at.x)));
        motion.ball?.setAttribute('cy', String(r1(at.y)));
        motion.trail?.setAttribute('points', pointsAttr(pre));
        const arrived = p >= travel;
        for (const e of motion.onArrive) {
          if (arrived) e.removeAttribute('visibility');
          else e.setAttribute('visibility', 'hidden');
        }
        for (const o of motion.onPass) {
          if (at.y >= o.y) o.el.removeAttribute('visibility');
          else o.el.setAttribute('visibility', 'hidden');
        }
        if (motion.door) {
          const d = motion.door;
          const k = motion.door.open ? Math.max(0, (p - travel) / (1 - travel)) : 0;
          if (k > 0) d.el.setAttribute('transform', `rotate(${r1(DOOR_OPEN_DEG * ease(k))} ${d.hinge.x} ${d.hinge.y})`);
          else d.el.removeAttribute('transform');
        }
      };

      paint(0);
      for (let f = 1; f <= frames; f += 1) {
        await wait(FRAME_MS);
        if (!alive()) return;
        paint(f / frames);
      }
    }

    return {
      async render(
        next: MultiwayBranchScene,
        _prev: MultiwayBranchScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        const motion = drawStatic(next);
        if (!opts.animate || destroyed) return;
        await move(next, motion, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
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
