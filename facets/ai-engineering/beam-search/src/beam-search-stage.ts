/**
 * beam-search stage — 가지가 뻗고, 솎이고, 지워진 자리를 다른 줄기가 채운다.
 *
 * 왼쪽에서 오른쪽으로 자라는 나무다. 세로줄 하나가 한 깊이(프롬프트 · 첫 낱말 ·
 * 둘째 · 셋째)이고, 줄마다 위쪽 `폭` 칸이 **빔 자리**다.
 *
 * - 뻗기: 살아 있는 줄기에서 가지가 뻗어 나가 줄 아래로 늘어선다.
 * - 지우기: 지우기가 켜진 깊이에서는 점수 없이 먼저 뻗고, 올 수 없는 가지가 그어진 뒤
 *   떨어진다. 남은 형제가 그 자리를 메우며 올라온다.
 * - 솎기: 점수 높은 가지가 빔 자리로 **올라가고**, 나머지는 **끊겨 떨어진다.**
 * - 답: 마지막 빔 첫 칸까지 이어진 줄기를 굵게 긋는다. 앞 판의 답 줄기에서
 *   **옮겨 타듯** 흘러간다.
 * - 판이 바뀌면 빔 자리의 띠가 새 폭으로 늘거나 준다.
 *
 * 문안은 `params.t` 로만. 색은 `getColors(theme)`, 글꼴은 `fonts` · `fontSizes`.
 */

import {
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 344;
const COLS = 4;
const PAD_X = 12;
const HEAD_H = 34;
const ROOT_W = 132;
const NODE_W = 124;
const NODE_H = 26;
/** 한 줄에 서는 가지의 최대 — 폭 4 · 지우기 끔의 둘째 깊이 여덟. */
const ROWS_MAX = 8;
const ROW_PITCH = 32;
const CAPTION_Y = HEAD_H + ROWS_MAX * ROW_PITCH + 22;
const FALL = 46;

/**
 * 백만분율 점수를 백분율 글자로 — 정수로 셈해 끝자리가 흐려지지 않게.
 *
 * 판정 3 (C10) — 수에 붙은 기호 표기(`14.175%`)라 조사·어순이 끼어들 자리가 없다. 표식이다.
 */
export function formatScore(score: number): string {
  const whole = Math.floor(score / 10000);
  const frac = String(score % 10000).padStart(4, '0').replace(/0+$/, '');
  return frac === '' ? `${whole}%` : `${whole}.${frac}%`;
}

type Mark = 'bare' | 'live' | 'beam' | 'erased' | 'cut';

type Node = {
  word: string;
  prob: number;
  score: number | null;
  carried: boolean;
  /** 앞 줄의 번호. 뿌리는 −1. */
  parent: number;
  mark: Mark;
  x: number;
  y: number;
  a: number;
  fx: number;
  fy: number;
  fa: number;
  tx: number;
  ty: number;
  ta: number;
};

/** 뿌리와 첫 줄 사이의 틈 — 확률 글자가 들어갈 자리. */
const ROOT_GAP = 56;

function colX(c: number): number {
  if (c === 0) return PAD_X;
  const first = PAD_X + ROOT_W + ROOT_GAP;
  const last = W - PAD_X - NODE_W;
  return first + ((last - first) * (c - 1)) / (COLS - 2);
}

function rowY(i: number): number {
  return HEAD_H + i * ROW_PITCH + ROW_PITCH / 2;
}

function nodeW(c: number): number {
  return c === 0 ? ROOT_W : NODE_W;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function readPrompt(initialData: Record<string, unknown> | undefined): string {
  const p = initialData?.prompt;
  return typeof p === 'string' ? p : '';
}

export type BeamSearchStage = {
  startRound(width: number, dur: number): void;
  showErase(items: { parent: number; word: string; prob: number; erased: boolean }[], dur: number): void;
  expand(
    items: { parent: number; word: string; prob: number; score: number; carried: boolean }[],
    dur: number,
  ): void;
  prune(kept: number[], dur: number): void;
  answer(dur: number): void;
  setCaption(text: string): void;
  reset(): void;
};

export const beamSearchStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & BeamSearchStage {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const prompt = readPrompt(params.initialData);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent.appendChild(e);
      return e;
    };

    svg.textContent = '';
    el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }, svg);
    const bandLayer = el('g', {}, svg);
    const headLayer = el('g', {}, svg);
    const edgeLayer = el('g', {}, svg);
    const pathLayer = el('g', {}, svg);
    const nodeLayer = el('g', {}, svg);
    const caption = el(
      'text',
      {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      },
      svg,
    );

    // ── 모형 ────────────────────────────────────────────────────────────────
    const makeRoot = (): Node => {
      const x = colX(0);
      const y = rowY(0);
      return {
        word: prompt,
        prob: 100,
        score: 1_000_000,
        carried: false,
        parent: -1,
        mark: 'beam',
        x, y, a: 1, fx: x, fy: y, fa: 1, tx: x, ty: y, ta: 1,
      };
    };
    let columns: Node[][] = [[makeRoot()]];
    /** 떨어지는 중인 것 — 흐름이 끝나면 버린다. */
    let falling: { col: number; node: Node }[] = [];
    let band = { now: 1, from: 1, to: 1 };
    /** 답 줄기의 세로 자리. 앞 판의 것이 ghost, 지금 것이 흐른다. */
    let ghost: number[] | null = null;
    let route: { now: number[]; from: number[]; to: number[] } | null = null;
    /** 답 줄기 위의 마디 — 테두리를 강조한다. */
    const routeNodes = new Set<Node>();

    let frame: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const nodes = (): { col: number; node: Node }[] => {
      const out: { col: number; node: Node }[] = [];
      columns.forEach((col, c) => col.forEach((node) => out.push({ col: c, node })));
      return out;
    };

    const rowsOf = (c: number): number => Math.max(columns[c]?.length ?? 0, 1);
    const pitchFor = (c: number): number => Math.min(ROW_PITCH, (ROWS_MAX * ROW_PITCH) / rowsOf(c));
    const yAt = (c: number, i: number): number => HEAD_H + i * pitchFor(c) + pitchFor(c) / 2;

    // ── 그리기 ──────────────────────────────────────────────────────────────
    const aliveSet = (): Set<Node> => {
      // 마지막 줄의 빔 줄기에서 거슬러 올라가며 살아 있는 것을 모은다.
      const alive = new Set<Node>();
      const last = columns.length - 1;
      let idx = new Set<number>(columns[last]!.map((_, i) => i));
      for (let c = last; c >= 0; c--) {
        const up = new Set<number>();
        for (const i of idx) {
          const n = columns[c]![i];
          if (!n) continue;
          alive.add(n);
          if (n.parent >= 0) up.add(n.parent);
        }
        idx = up;
      }
      return alive;
    };

    const drawBand = () => {
      bandLayer.textContent = '';
      const rows = band.now;
      if (rows <= 0) return;
      const x0 = colX(1) - 10;
      const x1 = colX(COLS - 1) + NODE_W + 8;
      const pitch = ROW_PITCH;
      el(
        'rect',
        {
          x: x0,
          y: HEAD_H + 1,
          width: x1 - x0,
          height: Math.max(0, rows * pitch - 2),
          rx: 6,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-dasharray': '4 3',
        },
        bandLayer,
      );
      const lbl = el(
        'text',
        {
          x: PAD_X,
          y: HEAD_H + rows * pitch + 12,
          'text-anchor': 'start',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        },
        bandLayer,
      );
      lbl.textContent = t('label.beam', 'beam slots: {width}', { width: Math.round(band.to) });
    };

    const drawHead = () => {
      headLayer.textContent = '';
      for (let c = 0; c < COLS; c++) {
        const tx = el(
          'text',
          {
            x: colX(c) + 2,
            y: HEAD_H - 12,
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          },
          headLayer,
        );
        tx.textContent =
          c === 0 ? t('label.prompt', 'prompt') : t('label.word', 'word {n}', { n: c });
      }
    };

    const drawNodes = () => {
      edgeLayer.textContent = '';
      nodeLayer.textContent = '';
      const alive = aliveSet();
      const all = [...nodes(), ...falling];
      for (const { col, node } of all) {
        if (col === 0) continue;
        const parent = columns[col - 1]?.[node.parent];
        if (!parent) continue;
        const px = parent.x + nodeW(col - 1);
        const py = parent.y;
        const cx = node.x;
        const cy = node.y;
        const mid = (px + cx) / 2;
        const dead = !alive.has(node) && node.mark === 'beam';
        const stroke =
          node.mark === 'erased' ? colors.danger : node.mark === 'cut' || dead ? colors.border : colors.textMuted;
        el(
          'path',
          {
            d: `M${px} ${py} C${mid} ${py} ${mid} ${cy} ${cx} ${cy}`,
            fill: 'none',
            stroke,
            'stroke-width': node.mark === 'beam' && !dead ? 1.6 : 1.1,
            'stroke-dasharray': node.carried || node.mark === 'erased' || dead ? '4 3' : 'none',
            opacity: node.a,
          },
          edgeLayer,
        );
        if (!node.carried) {
          const pl = el(
            'text',
            {
              x: cx - 6,
              y: cy - 5,
              'text-anchor': 'end',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: node.mark === 'erased' ? colors.danger : colors.textMuted,
              opacity: node.a,
            },
            edgeLayer,
          );
          // 판정 3 (C10) — 수에 붙은 기호 표기(`45%`). 표식이라 키를 만들지 않는다.
          pl.textContent = `${node.prob}%`;
        }
      }
      for (const { col, node } of all) {
        const w = nodeW(col);
        const dead = !alive.has(node) && node.mark === 'beam';
        const g = el('g', { opacity: node.a }, nodeLayer);
        const fill =
          node.mark === 'beam' && !dead ? colors.bgSubtle : colors.bg;
        const onRoute = routeNodes.has(node);
        const stroke = onRoute
          ? colors.accent
          : node.mark === 'erased'
            ? colors.danger
            : node.mark === 'beam' && !dead
              ? colors.primary
              : colors.border;
        el(
          'rect',
          {
            x: node.x,
            y: node.y - NODE_H / 2,
            width: w,
            height: NODE_H,
            rx: 4,
            fill,
            stroke,
            'stroke-width': onRoute ? 2.5 : node.mark === 'beam' && !dead ? 1.4 : 1,
            'stroke-dasharray': node.mark === 'erased' ? '3 2' : 'none',
          },
          g,
        );
        const word = el(
          'text',
          {
            x: node.x + 7,
            y: node.y + 4,
            'font-family': col === 0 ? fonts.body : fonts.mono,
            'font-size': col === 0 ? fontSizes.sm : fontSizes.md,
            fill:
              node.mark === 'erased'
                ? colors.danger
                : node.mark === 'cut' || dead
                  ? colors.textMuted
                  : colors.text,
          },
          g,
        );
        word.textContent = node.carried ? t('label.ended', 'ended') : node.word;
        if (node.mark === 'erased') {
          el(
            'line',
            {
              x1: node.x + 4,
              y1: node.y,
              x2: node.x + w - 4,
              y2: node.y,
              stroke: colors.danger,
              'stroke-width': 1.5,
            },
            g,
          );
        }
        if (col > 0 && node.score !== null) {
          const sc = el(
            'text',
            {
              x: node.x + w - 6,
              y: node.y + 4,
              'text-anchor': 'end',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: colors.textMuted,
            },
            g,
          );
          sc.textContent = formatScore(node.score);
        }
      }
    };

    const drawRoute = () => {
      pathLayer.textContent = '';
      const line = (ys: number[], color: string, width: number, dash: string) => {
        if (ys.length < 2) return;
        let d = `M${colX(0) + ROOT_W} ${ys[0]}`;
        for (let c = 1; c < ys.length; c++) {
          const px = c === 1 ? colX(0) + ROOT_W : colX(c - 1) + NODE_W;
          const cx = colX(c);
          const mid = (px + cx) / 2;
          d += ` C${mid} ${ys[c - 1]} ${mid} ${ys[c]} ${cx} ${ys[c]}`;
          if (c < ys.length - 1) d += ` L${cx + NODE_W} ${ys[c]}`;
        }
        el(
          'path',
          { d, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-dasharray': dash, 'stroke-linecap': 'round' },
          pathLayer,
        );
      };
      if (ghost && !route) line(ghost, colors.textMuted, 1.5, '2 4');
      if (route) line(route.now, colors.accent, 5, 'none');
    };

    const drawAll = () => {
      if (destroyed) return;
      drawBand();
      drawHead();
      drawRoute();
      drawNodes();
    };

    // ── 흐름 ────────────────────────────────────────────────────────────────
    const stopClock = () => {
      if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      if (timer !== null) clearTimeout(timer);
      frame = null;
      timer = null;
    };

    const settle = () => {
      stopClock();
      for (const { node } of [...nodes(), ...falling]) {
        node.x = node.tx;
        node.y = node.ty;
        node.a = node.ta;
      }
      falling = [];
      band.now = band.to;
      if (route) route.now = route.to.slice();
      drawAll();
    };

    const apply = (e: number) => {
      for (const { node } of [...nodes(), ...falling]) {
        node.x = node.fx + (node.tx - node.fx) * e;
        node.y = node.fy + (node.ty - node.fy) * e;
        node.a = node.fa + (node.ta - node.fa) * e;
      }
      band.now = band.from + (band.to - band.from) * e;
      if (route) route.now = route.to.map((y, i) => (route!.from[i] ?? y) + (y - (route!.from[i] ?? y)) * e);
    };

    /** 목표 자리를 정한 뒤 부른다. 앞 흐름은 끝 자리로 마저 보낸 뒤 새로 시작한다. */
    const flow = (dur: number) => {
      stopClock();
      for (const { node } of [...nodes(), ...falling]) {
        node.fx = node.x;
        node.fy = node.y;
        node.fa = node.a;
      }
      band.from = band.now;
      if (route) route.from = route.now.slice();
      if (dur <= 0 || destroyed) {
        settle();
        return;
      }
      const start = Date.now();
      const tick = () => {
        frame = null;
        timer = null;
        if (destroyed) return;
        const p = Math.min(1, (Date.now() - start) / dur);
        apply(ease(p));
        drawAll();
        if (p >= 1) {
          settle();
          return;
        }
        if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(tick);
        else timer = setTimeout(tick, 16);
      };
      tick();
    };

    /** 앞 줄의 부모 자리에서 출발하는 새 가지. */
    const sprout = (col: number, parent: number, i: number): Node => {
      const p = columns[col - 1]?.[parent];
      const x0 = p ? p.x + nodeW(col - 1) - NODE_W * 0.6 : colX(col);
      const y0 = p ? p.y : rowY(0);
      return {
        word: '',
        prob: 0,
        score: null,
        carried: false,
        parent,
        mark: 'live',
        x: x0, y: y0, a: 0,
        fx: x0, fy: y0, fa: 0,
        tx: colX(col), ty: rowY(i), ta: 1,
      };
    };

    /** 떨어뜨린다 — 아래로 밀리며 사라진다. */
    const drop = (col: number, node: Node, mark: Mark) => {
      node.mark = mark;
      node.ty = node.y + FALL;
      node.ta = 0;
      falling.push({ col, node });
    };

    /** 지금 자리 번호대로 목표 자리를 다시 매긴다. */
    const place = (c: number) => {
      const col = columns[c] ?? [];
      col.forEach((n, i) => {
        n.tx = colX(c);
        n.ty = yAt(c, i);
      });
    };

    let pendingBare: Node[] | null = null;

    const api: BeamSearchStage = {
      startRound(width, dur) {
        settle();
        // 앞 판의 답 줄기를 ghost 로 남긴다 — 새 답이 거기서 옮겨 탄다.
        if (route) ghost = route.to.slice();
        route = null;
        pendingBare = null;
        // 앞 판의 가지는 뿌리로 걷혀 들어간다.
        const root = columns[0]![0]!;
        for (let c = 1; c < columns.length; c++) {
          for (const n of columns[c]!) {
            n.tx = root.x + ROOT_W - NODE_W;
            n.ty = root.y;
            n.ta = 0;
            falling.push({ col: c, node: n });
          }
        }
        // 줄은 뿌리만 남긴다. 걷히는 가지는 선 없이 뿌리로 모인다.
        columns = [columns[0]!];
        for (const f of falling) f.node.parent = -1;
        routeNodes.clear();
        band.to = width;
        flow(dur);
      },
      showErase(items, dur) {
        settle();
        const c = columns.length;
        const col: Node[] = [];
        items.forEach((it, i) => {
          const n = sprout(c, it.parent, i);
          n.word = it.word;
          n.prob = it.prob;
          n.mark = it.erased ? 'erased' : 'bare';
          col.push(n);
        });
        columns.push(col);
        place(c);
        pendingBare = col;
        flow(dur);
      },
      expand(items, dur) {
        settle();
        let c = columns.length;
        let col: Node[] = [];
        if (pendingBare) {
          // 지우기 걸음에서 뻗어 둔 줄 — 지운 것은 떨어지고 남은 형제가 올라와 메운다.
          c = columns.length - 1;
          const bare = pendingBare;
          pendingBare = null;
          columns[c] = [];
          const survivors: Node[] = [];
          for (const n of bare) {
            if (n.mark === 'erased') drop(c, n, 'erased');
            else survivors.push(n);
          }
          let s = 0;
          for (const it of items) {
            if (it.carried) {
              const n = sprout(c, it.parent, col.length);
              n.word = it.word;
              n.carried = true;
              n.score = it.score;
              col.push(n);
              continue;
            }
            const n = survivors[s++];
            if (!n) continue;
            n.mark = 'live';
            n.score = it.score;
            col.push(n);
          }
        } else {
          for (const it of items) {
            const n = sprout(c, it.parent, col.length);
            n.word = it.word;
            n.prob = it.prob;
            n.score = it.score;
            n.carried = it.carried;
            col.push(n);
          }
        }
        // 지운 것이 떨어지는 동안 부모를 찾도록 줄을 먼저 세운다.
        columns[c] = col;
        place(c);
        flow(dur);
      },
      prune(kept, dur) {
        settle();
        const c = columns.length - 1;
        const col = columns[c] ?? [];
        const keptSet = new Set(kept);
        col.forEach((n, i) => {
          if (!keptSet.has(i)) drop(c, n, 'cut');
        });
        const next: Node[] = [];
        for (const i of kept) {
          const n = col[i];
          if (!n) continue;
          n.mark = 'beam';
          next.push(n);
        }
        columns[c] = next;
        place(c);
        flow(dur);
      },
      answer(dur) {
        settle();
        // 마지막 줄 첫 칸에서 뿌리까지 거슬러 세로 자리를 모은다.
        const ys: number[] = [];
        let c = columns.length - 1;
        let i = 0;
        while (c >= 0) {
          const n = columns[c]?.[i];
          if (!n) break;
          ys.unshift(n.ty);
          routeNodes.add(n);
          i = n.parent;
          c -= 1;
        }
        const from = ghost && ghost.length === ys.length ? ghost.slice() : ys.map(() => ys[0]!);
        route = { now: from.slice(), from, to: ys };
        ghost = null;
        flow(dur);
      },
      setCaption(text) {
        caption.textContent = text;
      },
      reset() {
        stopClock();
        columns = [[makeRoot()]];
        falling = [];
        band = { now: 1, from: 1, to: 1 };
        ghost = null;
        route = null;
        routeNodes.clear();
        pendingBare = null;
        caption.textContent = '';
        drawAll();
      },
    };

    drawAll();

    return {
      ...api,
      destroy() {
        destroyed = true;
        stopClock();
        svg.textContent = '';
      },
    };
  },
};
