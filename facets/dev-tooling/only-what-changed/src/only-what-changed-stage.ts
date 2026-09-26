/**
 * only-what-changed 무대 — 대상을 하나씩 들여다보는 눈금틀이 대상 사이를 뛰어 건넌다.
 *
 * 그림: 소스가 맨 아래 줄, 대상은 깊이만큼 위로 쌓인다(깊이 · 차례는 algorithm 의 함수가 셈한다).
 * - 고침: 고친 소스 자리에 새 카드가 위에서 내려앉고 옛 카드는 줄어 사라진다
 * - 그대로: 눈금틀이 앞 대상에서 뛰어올라 이 대상에 내려앉는다. 대상은 손대지 않는다
 * - 다시: 눈금틀이 내려앉고, 바뀐 입력에서 점이 선을 따라 올라온 뒤, 옛 결과가 줄어 사라지고
 *   새 결과가 입력 쪽에서 솟아 제자리에 선다
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { depthOf, inspectionOrder } from './algorithm.js';
import type { OnlyWhatChangedScene } from './scene.js';

const H = 360;
const SVG_NS = 'http://www.w3.org/2000/svg';

const LEFT = 84; // 줄 이름 자리
const RIGHT_PAD = 12;
const TOP_ROW_Y = 98;
const BOTTOM_ROW_Y = H - 32;
const NODE_W_MAX = 104;
const NODE_H = 38;
const CURSOR_PAD = 6;

const EDIT_MS = 520;
const KEEP_MS = 560;
const REBUILD_MS = 820;

type NodeLook = 'source' | 'edited' | 'previous' | 'kept' | 'rebuilt';
type Point = { x: number; y: number };

function r2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

/** u 를 [a, b] 구간의 0..1 로 편다. */
function span(u: number, a: number, b: number): number {
  if (u <= a) return 0;
  if (u >= b) return 1;
  return (u - a) / (b - a);
}

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

/** 자리 셈 — 소스는 데이터 차례로 맨 아래 줄에 고르게, 대상은 입력들의 가운데 위, 깊이만큼의 줄. */
function placeAll(scene: OnlyWhatChangedScene): { pos: Map<string, Point>; nodeW: number; rowGap: number } {
  const depth = depthOf(scene.rules, scene.sources);
  const order = inspectionOrder(scene.rules, scene.sources);
  let maxDepth = 0;
  for (const d of depth.values()) maxDepth = Math.max(maxDepth, d);
  const rowGap = maxDepth === 0 ? 0 : (BOTTOM_ROW_Y - TOP_ROW_Y) / maxDepth;
  const colGap = (PIECE_CANVAS_W - RIGHT_PAD - LEFT) / scene.sources.length;
  const nodeW = Math.min(NODE_W_MAX, colGap - 18);
  const rowY = (name: string): number => {
    const d = depth.get(name);
    if (d === undefined) throw new Error(`only-what-changed 무대: 깊이를 모르는 ${name}`);
    return BOTTOM_ROW_Y - d * rowGap;
  };
  const pos = new Map<string, Point>();
  scene.sources.forEach((s, i) => pos.set(s, { x: LEFT + colGap * (i + 0.5), y: rowY(s) }));
  for (const name of order) {
    const rule = scene.rules.find((r) => r.target === name);
    if (rule === undefined) throw new Error(`only-what-changed 무대: 규칙 없는 ${name}`);
    let sum = 0;
    for (const i of rule.inputs) {
      const p = pos.get(i);
      if (p === undefined) throw new Error(`only-what-changed 무대: 자리를 모르는 입력 ${i}`);
      sum += p.x;
    }
    pos.set(name, { x: sum / rule.inputs.length, y: rowY(name) });
  }
  return { pos, nodeW, rowGap };
}

function lookOf(scene: OnlyWhatChangedScene, name: string): NodeLook {
  if (scene.sources.includes(name)) return scene.edited.includes(name) ? 'edited' : 'source';
  const v = scene.verdicts.find((x) => x.target === name);
  if (v === undefined) return 'previous';
  return v.rebuilt ? 'rebuilt' : 'kept';
}

export const onlyWhatChangedStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function statusWord(look: NodeLook): string {
      if (look === 'edited') return t('status.edited', 'edited');
      if (look === 'previous') return t('status.previous', 'previous');
      if (look === 'kept') return t('status.kept', 'kept');
      if (look === 'rebuilt') return t('status.rebuilt', 'rebuilt');
      return '';
    }

    /** 카드 하나. 가운데가 (0,0) 인 묶음으로 그리고 자리는 transform 이 준다. */
    function drawCard(parent: Element, name: string, look: NodeLook, at: Point, w: number): SVGGElement {
      const g = make('g', { transform: `translate(${r2(at.x)},${r2(at.y)})` }, parent);
      const hot = look === 'edited' || look === 'rebuilt';
      const fill = hot ? colors.accent : look === 'previous' ? colors.bgSubtle : colors.bg;
      const stroke = hot ? colors.accent : look === 'kept' ? colors.text : colors.border;
      const ink = hot ? colors.stateInk : colors.text;
      make(
        'rect',
        {
          x: -w / 2,
          y: -NODE_H / 2,
          width: w,
          height: NODE_H,
          rx: 6,
          fill,
          stroke,
          'stroke-width': look === 'kept' ? 2 : 1.2,
        },
        g,
      );
      const word = statusWord(look);
      const nameEl = make(
        'text',
        {
          x: 0,
          y: word === '' ? 4 : -3,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: ink,
        },
        g,
      );
      nameEl.textContent = name;
      if (word !== '') {
        const st = make(
          'text',
          {
            x: 0,
            y: 12,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            'font-weight': look === 'kept' || hot ? 600 : 400,
            fill: hot ? colors.stateInk : look === 'kept' ? colors.text : colors.textMuted,
          },
          g,
        );
        st.textContent = word;
      }
      return g;
    }

    type Handles = {
      pos: Map<string, Point>;
      nodeW: number;
      cards: Map<string, SVGGElement>;
      cursor: SVGRectElement | null;
      fx: SVGGElement;
    };

    function drawStatic(scene: OnlyWhatChangedScene): Handles {
      svg.textContent = '';
      const { pos, nodeW, rowGap } = placeAll(scene);
      const at = (n: string): Point => {
        const p = pos.get(n);
        if (p === undefined) throw new Error(`only-what-changed 무대: 자리를 모르는 ${n}`);
        return p;
      };

      // 머리 두 줄 — 이번 걸음과 셈
      const step = scene.step;
      let line: string;
      if (step.kind === 'start') {
        line = t('caption.start', 'Previous build results: {n}', { n: scene.rules.length });
      } else if (step.kind === 'edit') {
        line = t('caption.edit', 'Edited: {names}', { names: step.sources.join(' · ') });
      } else if (step.rebuilt) {
        line = t('caption.rebuild', 'Rebuilt: {name} — changed input: {inputs}', {
          name: step.target,
          inputs: step.hit.join(' · '),
        });
      } else {
        line = t('caption.keep', 'Kept: {name} — no changed input', { name: step.target });
      }
      const head = make(
        'text',
        { x: 12, y: 24, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600, fill: colors.text },
        svg,
      );
      head.textContent = line;
      const rebuiltN = scene.verdicts.filter((v) => v.rebuilt).length;
      const keptN = scene.verdicts.length - rebuiltN;
      const tally = make(
        'text',
        { x: 12, y: 46, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted },
        svg,
      );
      tally.textContent = t('caption.tally', 'Rebuilt: {r}   Kept: {k}   Not yet checked: {u}', {
        r: rebuiltN,
        k: keptN,
        u: scene.rules.length - scene.verdicts.length,
      });

      // 줄 이름
      const firstSource = scene.sources[0];
      if (firstSource === undefined) throw new Error('only-what-changed 무대: 소스가 없다');
      const srcY = at(firstSource).y;
      let topY = srcY;
      for (const r of scene.rules) topY = Math.min(topY, at(r.target).y);
      const tgtLabel = make(
        'text',
        {
          x: 12,
          y: (topY + srcY - rowGap) / 2 + 4,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        },
        svg,
      );
      tgtLabel.textContent = t('label.targets', 'Targets');
      const srcLabel = make(
        'text',
        { x: 12, y: srcY + 4, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted },
        svg,
      );
      srcLabel.textContent = t('label.sources', 'Sources');

      // 선 — 대상 아래에서 입력 위로. 다시 세움을 낳은 선은 강조
      const edges = make('g', {}, svg);
      for (const r of scene.rules) {
        const v = scene.verdicts.find((x) => x.target === r.target);
        for (const i of r.inputs) {
          const hot = v !== undefined && v.hit.includes(i);
          const a = at(r.target);
          const b = at(i);
          make(
            'line',
            {
              x1: a.x,
              y1: a.y + NODE_H / 2,
              x2: b.x,
              y2: b.y - NODE_H / 2,
              stroke: hot ? colors.accent : colors.border,
              'stroke-width': hot ? 3.5 : 1.2,
            },
            edges,
          );
        }
      }

      // 카드
      const layer = make('g', {}, svg);
      const cards = new Map<string, SVGGElement>();
      for (const s of scene.sources) cards.set(s, drawCard(layer, s, lookOf(scene, s), at(s), nodeW));
      for (const r of scene.rules) cards.set(r.target, drawCard(layer, r.target, lookOf(scene, r.target), at(r.target), nodeW));

      // 눈금틀 — 방금 들여다본 대상 위
      let cursor: SVGRectElement | null = null;
      if (step.kind === 'inspect') {
        const p = at(step.target);
        cursor = make(
          'rect',
          {
            x: p.x - nodeW / 2 - CURSOR_PAD,
            y: p.y - NODE_H / 2 - CURSOR_PAD,
            width: nodeW + CURSOR_PAD * 2,
            height: NODE_H + CURSOR_PAD * 2,
            rx: 9,
            fill: 'none',
            stroke: colors.primary,
            'stroke-width': 2.5,
          },
          svg,
        );
      }
      const fx = make('g', {}, svg);
      return { pos, nodeW, cards, cursor, fx };
    }

    function tween(ms: number, mine: number, frame: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (done) return;
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const u = Math.min(1, (performance.now() - start) / ms);
          frame(u);
          if (u >= 1) {
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

    /** 눈금틀을 앞 자리에서 뛰어 오르게 한다 — 끝 자리까지 아직 못 온 만큼을 뺀다. */
    function hopCursor(h: Handles, to: Point, from: Point, u: number): void {
      if (h.cursor === null) return;
      const e = ease(u);
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      const lift = (26 + dist * 0.18) * 4 * e * (1 - e);
      const dx = (from.x - to.x) * (1 - e);
      const dy = (from.y - to.y) * (1 - e) - lift;
      h.cursor.setAttribute('transform', `translate(${r2(dx)},${r2(dy)})`);
    }

    function cardAt(g: SVGGElement, at: Point, dy: number, scale: number): void {
      g.setAttribute('transform', `translate(${r2(at.x)},${r2(at.y + dy)}) scale(${r2(scale)})`);
    }

    async function animate(scene: OnlyWhatChangedScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      const at = (n: string): Point => {
        const p = h.pos.get(n);
        if (p === undefined) throw new Error(`only-what-changed 무대: 자리를 모르는 ${n}`);
        return p;
      };

      if (step.kind === 'start') return;

      if (step.kind === 'edit') {
        // 새 카드가 위에서 내려앉고 옛 카드는 줄어든다
        const pairs = step.sources.map((s) => {
          const card = h.cards.get(s);
          if (card === undefined) throw new Error(`only-what-changed 무대: 카드 없는 ${s}`);
          const ghost = drawCard(card.parentNode as Element, s, 'source', at(s), h.nodeW);
          card.parentNode?.insertBefore(ghost, card);
          return { s, card, ghost };
        });
        await tween(EDIT_MS, mine, (u) => {
          const e = ease(u);
          for (const { s, card, ghost } of pairs) {
            cardAt(card, at(s), -40 * (1 - e), 1);
            cardAt(ghost, at(s), 0, 1 - span(u, 0.55, 1));
          }
        });
        return;
      }

      const to = at(step.target);
      const from = step.from === null ? { x: -60, y: to.y } : at(step.from);

      if (!step.rebuilt) {
        await tween(KEEP_MS, mine, (u) => hopCursor(h, to, from, u));
        return;
      }

      // 다시 세움 — 눈금틀 → 바뀜이 선을 타고 올라옴 → 옛 결과가 줄고 새 결과가 솟는다
      const card = h.cards.get(step.target);
      if (card === undefined) throw new Error(`only-what-changed 무대: 카드 없는 ${step.target}`);
      const ghost = drawCard(card.parentNode as Element, step.target, 'previous', to, h.nodeW);
      card.parentNode?.insertBefore(ghost, card);
      const pulses = step.hit.map((i) => {
        const dot = make('circle', { cx: 0, cy: 0, r: 0, fill: colors.accent, stroke: colors.text, 'stroke-width': 1.2 }, h.fx);
        return { from: { x: at(i).x, y: at(i).y - NODE_H / 2 }, dot };
      });
      const firstHit = step.hit[0];
      if (firstHit === undefined) throw new Error(`only-what-changed 무대: ${step.target} 의 바뀐 입력이 없다`);
      const rise = at(firstHit).y - to.y;
      await tween(REBUILD_MS, mine, (u) => {
        hopCursor(h, to, from, span(u, 0, 0.35));
        const pu = span(u, 0.3, 0.62);
        const pe = ease(pu);
        for (const { from: f, dot } of pulses) {
          const x = f.x + (to.x - f.x) * pe;
          const y = f.y + (to.y + NODE_H / 2 - f.y) * pe;
          dot.setAttribute('cx', String(r2(x)));
          dot.setAttribute('cy', String(r2(y)));
          dot.setAttribute('r', pu > 0 && pu < 1 ? '5' : '0');
        }
        const bu = span(u, 0.62, 1);
        const be = ease(bu);
        cardAt(ghost, to, 0, 1 - be);
        // 새 결과는 입력 쪽에서 솟아 오른다 — 아직 못 온 거리만큼 아래에
        cardAt(card, to, rise * 0.45 * (1 - be), bu === 0 ? 0 : 0.4 + 0.6 * be);
      });
    }

    const renderer: SceneRenderer<OnlyWhatChangedScene> = {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate) return;
        await animate(next, h, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer;
  },
};
