/**
 * 언제나 1등만 — stage.
 *
 * 동사는 "되돌아온다". 고른 토큰은 앞 토큰 자리에서 떠나 문장 끝에 붙는다. 그 토큰이
 * 이미 문장에 있던 것이면 줄 끝에서 꺾여 **그 토큰이 처음 있던 칸 아래**로 돌아가
 * 새 줄을 연다. 그 뒤로 오는 토큰은 저마다 윗줄의 같은 칸 아래에 내려앉는다 —
 * 문장이 지나온 길을 되밟는 것이 줄이 겹쳐 쌓이는 모양으로 보인다.
 *
 * 칸 · 줄은 문장에서 셈한다: 처음 오는 토큰은 새 칸, 되풀이된 토큰은 처음 있던 칸.
 * 칸이 앞 토큰의 칸보다 오른쪽이 아니면 줄을 바꾼다.
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
import type { AlwaysTheHighestScene } from './scene.js';

const H = 340;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 좌우 여백 */
const MARGIN = 40;
/** 칸 폭 상한 */
const SLOT_MAX = 180;
/** 토큰 상자 */
const BOX_W_MAX = 112;
const BOX_H = 34;
/** 줄이 시작하는 높이 · 줄 간격 상한 */
const ROWS_TOP = 64;
const ROW_MAX = 88;
/** 되돌아가는 굽이가 상자 밖으로 불룩한 정도 */
const BULGE = 44;
/** 토큰이 떠나 자리에 닿기까지 */
const MOVE_MS = 700;

type Pt = { x: number; y: number };
type Place = { col: number; row: number };

function r1(v: number): number {
  const out = Math.round(v * 10) / 10;
  return out === 0 ? 0 : out;
}

function fmt(p: number): string {
  return p.toFixed(2);
}

/** 칸 · 줄 — 처음 오는 토큰은 새 칸, 되풀이된 토큰은 처음 있던 칸. */
function placesOf(scene: AlwaysTheHighestScene): Place[] {
  const out: Place[] = [];
  let fresh = 0;
  scene.sentence.forEach((entry, i) => {
    const firstAt = entry.pick ? entry.pick.firstAt : -1;
    const twin = firstAt >= 0 ? out[firstAt] : undefined;
    const col = twin ? twin.col : fresh;
    if (!twin) fresh += 1;
    const before = out[i - 1];
    const row = before ? (col <= before.col ? before.row + 1 : before.row) : 0;
    out.push({ col, row });
  });
  return out;
}

type Geometry = {
  centers: Pt[];
  boxW: number;
  rowH: number;
};

function geometryOf(places: Place[]): Geometry {
  const cols = Math.max(1, ...places.map((p) => p.col + 1));
  const rows = Math.max(1, ...places.map((p) => p.row + 1));
  const slot = Math.min(SLOT_MAX, (W - MARGIN * 2) / cols);
  const boxW = Math.min(BOX_W_MAX, slot * 0.72);
  const rowH = Math.min(ROW_MAX, (H - ROWS_TOP - 8) / rows);
  const centers = places.map((p) => ({
    x: r1(MARGIN + slot * (p.col + 0.5)),
    y: r1(ROWS_TOP + BOX_H * 0.65 + rowH * p.row),
  }));
  return { centers, boxW, rowH };
}

function cubic(a: Pt, b: Pt, c: Pt, d: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
}

/**
 * 줄 끝 상자 오른쪽에서 나와 두 줄 사이로 꺾여 왼쪽으로 건너가고, 새 줄 첫 상자
 * 왼쪽으로 들어가는 굽이. 점 열로 돌려준다 (그린 길과 운동이 같은 점을 쓰게).
 */
function returnPoints(from: Pt, to: Pt, boxW: number, rowH: number): Pt[] {
  const a = { x: from.x + boxW / 2 + 4, y: from.y };
  const midY = from.y + rowH * 0.68;
  const b = { x: a.x, y: midY };
  const c = { x: to.x - boxW / 2 - 4, y: midY };
  const d = { x: c.x, y: to.y };
  const pts: Pt[] = [];
  const N = 14;
  for (let i = 0; i <= N; i += 1) {
    pts.push(cubic(a, { x: a.x + BULGE, y: a.y }, { x: b.x + BULGE, y: b.y }, b, i / N));
  }
  for (let i = 1; i <= N; i += 1) {
    pts.push(cubic(c, { x: c.x - BULGE, y: c.y }, { x: d.x - BULGE, y: d.y }, d, i / N));
  }
  return pts.map((p) => ({ x: r1(p.x), y: r1(p.y) }));
}

function lengthOf(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) {
    len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  return len;
}

/** 점 열 위에서 길이 비율 t 의 자리 */
function pointAt(pts: Pt[], t: number): Pt {
  const total = lengthOf(pts);
  let want = total * t;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (want <= seg || i === pts.length - 1) {
      const k = seg === 0 ? 1 : Math.min(1, want / seg);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    want -= seg;
  }
  return pts[pts.length - 1] ?? { x: 0, y: 0 };
}

function dOf(pts: Pt[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${r1(p.x)} ${r1(p.y)}`).join(' ');
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** 윗줄에서 같은 칸에 있던 토큰 — 되밟는 짝 */
function aboveOf(places: Place[], i: number): number {
  const me = places[i];
  if (!me) return -1;
  for (let j = i - 1; j >= 0; j -= 1) {
    const p = places[j]!;
    if (p.col === me.col && p.row === me.row - 1) return j;
  }
  return -1;
}

export const alwaysTheHighestStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<AlwaysTheHighestScene> {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 정적 그리기가 세운 손잡이 — 운동이 옮긴다 */
    let tokenNodes: SVGGElement[] = [];
    let arcNodes = new Map<number, { node: SVGPathElement; pts: Pt[] }>();

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

    function captionOf(scene: AlwaysTheHighestScene): string {
      const step = scene.step;
      if (step.kind === 'prompt') {
        const token = scene.sentence[0]?.token ?? '';
        return t(
          'caption.prompt',
          'Prompt: {token}. Each step looks only at the previous token and takes the top one.',
          { token },
        );
      }
      if (step.kind === 'pick') {
        const entry = scene.sentence[step.at];
        const pick = entry?.pick;
        if (!entry || !pick) return '';
        const vars = {
          prev: pick.prev,
          token: entry.token,
          p: fmt(pick.p),
          second: pick.second,
          p2: fmt(pick.secondP),
        };
        if (pick.firstAt < 0) {
          return t(
            'caption.pick',
            'After {prev}: top {token} {p}, runner-up {second} {p2}. The top one goes on the end.',
            vars,
          );
        }
        const firstRepeat = scene.sentence.findIndex((e) => (e.pick ? e.pick.firstAt >= 0 : false));
        if (firstRepeat === step.at) {
          return t(
            'caption.repeat',
            'After {prev}: top {token} {p}, runner-up {second} {p2}. This token already sat at position {pos}.',
            { ...vars, pos: pick.firstAt + 1 },
          );
        }
        return t(
          'caption.retrace',
          'After {prev}: top {token} {p} again, runner-up {second} {p2}. Same step as the row above.',
          vars,
        );
      }
      if (step.kind === 'done') {
        if (step.loopEnd < 0) {
          return t('caption.doneNoLoop', 'Stopped after {made} new tokens. No token came back.', {
            made: step.made,
          });
        }
        return t(
          'caption.done',
          'Stopped after {made} new tokens. The same {len} tokens went round {rounds} times.',
          { made: step.made, len: step.loopEnd - step.loopStart, rounds: step.rounds },
        );
      }
      return '';
    }

    function drawStatic(scene: AlwaysTheHighestScene): void {
      svg.textContent = '';
      tokenNodes = [];
      arcNodes = new Map();

      const places = placesOf(scene);
      const { centers, boxW, rowH } = geometryOf(places);
      const step = scene.step;
      const current = step.kind === 'pick' ? step.at : -1;
      const above = current >= 0 ? aboveOf(places, current) : -1;

      const caption = el(
        'text',
        {
          x: W / 2,
          y: 30,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
        },
        svg,
      );
      caption.textContent = captionOf(scene);

      // 되돌아가는 굽이 — 줄이 바뀐 자리마다
      const arcs = el('g', {}, svg);
      for (let i = 1; i < places.length; i += 1) {
        if (places[i]!.row === places[i - 1]!.row) continue;
        const pts = returnPoints(centers[i - 1]!, centers[i]!, boxW, rowH);
        const node = el(
          'path',
          {
            d: dOf(pts),
            fill: 'none',
            stroke: colors.itemComparing,
            'stroke-width': 1.5,
            'stroke-linejoin': 'round',
            'stroke-opacity': 0.8,
          },
          arcs,
        );
        arcNodes.set(i, { node, pts });
      }

      const tokens = el('g', {}, svg);
      scene.sentence.forEach((entry, i) => {
        const c = centers[i]!;
        const repeated = entry.pick ? entry.pick.firstAt >= 0 : false;
        const hot = i === current || i === above;
        const g = el('g', { transform: `translate(${c.x} ${c.y})` }, tokens);
        const box = el(
          'rect',
          {
            x: r1(-boxW / 2),
            y: -BOX_H / 2,
            width: r1(boxW),
            height: BOX_H,
            rx: 6,
            fill: repeated ? colors.itemComparing : colors.bgSubtle,
            stroke: repeated ? colors.itemComparing : colors.border,
            'stroke-width': hot ? 2.5 : 1,
          },
          g,
        );
        if (repeated) box.setAttribute('fill-opacity', '0.16');
        if (hot) box.setAttribute('stroke', colors.text);

        const word = el(
          'text',
          {
            x: 0,
            y: 5,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
            fill: colors.text,
          },
          g,
        );
        word.textContent = entry.token;

        const under = el(
          'text',
          {
            x: 0,
            y: BOX_H / 2 + 15,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: entry.pick ? colors.text : colors.textMuted,
          },
          g,
        );
        under.textContent = entry.pick ? fmt(entry.pick.p) : t('label.prompt', 'prompt');

        if (entry.pick) {
          const runner = el(
            'text',
            {
              x: 0,
              y: BOX_H / 2 + 29,
              'text-anchor': 'middle',
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              fill: colors.textMuted,
            },
            g,
          );
          runner.textContent = t('label.second', '2nd {token} {p}', {
            token: entry.pick.second,
            p: fmt(entry.pick.secondP),
          });
        }
        tokenNodes.push(g);
      });
    }

    function tween(ms: number, frame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = performance.now();
        const tick = (): void => {
          if (destroyed) return finish();
          const k = Math.min(1, (performance.now() - start) / ms);
          frame(ease(k));
          if (k >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function flow(next: AlwaysTheHighestScene, mine: number): Promise<void> {
      const step = next.step;
      if (step.kind !== 'pick' || step.at < 1) return;
      const places = placesOf(next);
      const { centers, boxW, rowH } = geometryOf(places);
      const from = centers[step.at - 1]!;
      const to = centers[step.at]!;
      const node = tokenNodes[step.at];
      if (!node) return;

      // 줄이 바뀌면 굽이를 따라 되돌아가고, 아니면 곧장 오른쪽으로 붙는다
      const arc = arcNodes.get(step.at);
      const route: Pt[] = arc
        ? [from, ...returnPoints(from, to, boxW, rowH), to]
        : [from, to];
      const arcLen = arc ? lengthOf(arc.pts) : 0;
      if (arc) arc.node.setAttribute('stroke-dasharray', `${r1(arcLen)} ${r1(arcLen)}`);

      await tween(MOVE_MS, (k) => {
        if (mine !== gen || destroyed) return;
        const p = pointAt(route, k);
        node.setAttribute('transform', `translate(${r1(p.x)} ${r1(p.y)})`);
        if (arc) arc.node.setAttribute('stroke-dashoffset', String(r1(arcLen * (1 - k))));
      });
    }

    return {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        // 앞 장면은 운동을 고르는 데만 — 한 토큰이 막 붙었을 때만 흐른다
        if (!prev || prev.sentence.length !== next.sentence.length - 1) return;
        await flow(next, mine);
        if (mine !== gen || destroyed) return;
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
  },
};
