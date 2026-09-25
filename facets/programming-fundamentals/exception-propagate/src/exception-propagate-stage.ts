/**
 * 예외 전파의 무대.
 *
 * 줄을 덩이로 나눠 부르는 차례대로 층층이 쌓는다 — 맨 바깥이 위, 한 번 부를 때마다 한 층 아래로,
 * 오른쪽으로 한 칸씩 물러난다. 부르면 위층의 부른 줄에서 아래층 덩이로 고리가 내려가고 틀이 선다.
 *
 * 동사는 "틀을 건너뛰며 거슬러 오른다" 다. 던져진 예외(붉은 알약)는 자기 줄에서 떠나 그 틀을
 * 세운 고리를 거꾸로 타고 **위층의 부른 줄로 올라간다.** 떠난 틀은 점선 테두리만 남고 남은 줄에
 * 줄이 그어진다. 닿은 자리가 try 몸 안이면 알약은 catch 줄로 떨어져 잡힌다.
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
import {
  blocksOf,
  type ExceptionPropagateScene,
  type SceneBlock,
  type SceneValue,
} from './scene';

const W = PIECE_CANVAS_W;
const H = 440;
const SVG = 'http://www.w3.org/2000/svg';

/** 가장자리 여백 */
const M = 16;
/** 출력 칸 폭 */
const OUT_W = 128;
/** 덩이와 출력 칸 사이 */
const OUT_GAP = 14;
/** 층 하나가 오른쪽으로 물러나는 폭의 상한 */
const STEP_X_MAX = 44;
/** 덩이 폭의 하한 — 층이 많아져도 코드가 들어갈 자리 */
const BLOCK_W_MIN = 240;
/** 덩이 위아래 안쪽 여백 · 덩이 사이 */
const PAD = 6;
const BLOCK_GAP = 22;
/** 위 여백 · 아래 캡션 자리 */
const TOP = 12;
const CAPTION_H = 52;
/** 줄 높이 상한 */
const LINE_H_MAX = 24;
/** 줄 번호 칸 · 들여쓰기 한 칸 */
const GUTTER = 32;
const INDENT_W = 22;
/** 예외 알약 */
const PILL_W = 88;
const PILL_H = 20;
/** 한 걸음의 운동 */
const MOVE_MS = 380;
const FRAME_MS = 16;

type Pt = { x: number; y: number };

type Geometry = {
  blocks: { block: SceneBlock; x: number; y: number; w: number; h: number }[];
  rowY: Map<number, number>;
  blockOf: Map<number, number>;
  lineH: number;
  charW: number;
  stepX: number;
};

function r1(v: number): number {
  const n = Math.round(v * 10) / 10;
  return n === 0 ? 0 : n;
}

function show(v: SceneValue): string {
  return v === null ? 'null' : String(v);
}

function layout(scene: ExceptionPropagateScene): Geometry {
  const blocks = blocksOf(scene.lines).filter((b) => b.lines.length > 0);
  const maxLevel = blocks.reduce((m, b) => Math.max(m, b.level), 0);
  const room = W - 2 * M - OUT_W - OUT_GAP;
  const stepX = maxLevel === 0 ? 0 : Math.min(STEP_X_MAX, (room - BLOCK_W_MIN) / maxLevel);
  const w = room - maxLevel * stepX;
  const total = scene.lines.length;
  const avail =
    H - TOP - CAPTION_H - Math.max(0, blocks.length - 1) * BLOCK_GAP - blocks.length * 2 * PAD;
  const lineH = total === 0 ? LINE_H_MAX : Math.min(LINE_H_MAX, avail / total);
  const rowY = new Map<number, number>();
  const blockOf = new Map<number, number>();
  let y = TOP;
  const placed = blocks.map((block, bi) => {
    const h = block.lines.length * lineH + 2 * PAD;
    block.lines.forEach((li, row) => {
      rowY.set(li, y + PAD + row * lineH + lineH / 2);
      blockOf.set(li, bi);
    });
    const out = { block, x: M + block.level * stepX, y, w, h };
    y += h + BLOCK_GAP;
    return out;
  });
  // 고정폭 글꼴 한 글자의 폭 — 코드는 fontSizes.md 로 그리므로 그 크기에서 셈한다
  const charW = parseFloat(fontSizes.md) * 0.6;
  return { blocks: placed, rowY, blockOf, lineH, charW, stepX };
}

export const exceptionPropagateStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<ExceptionPropagateScene> {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function mk<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }
    function write(
      parent: Element,
      x: number,
      y: number,
      s: string,
      style: { size: string; fill: string; mono?: boolean; anchor?: string; weight?: number },
    ): SVGTextElement {
      const node = mk(
        'text',
        {
          x,
          y,
          fill: style.fill,
          'font-family': style.mono === true ? fonts.mono : fonts.body,
          'font-size': style.size,
          'text-anchor': style.anchor ?? 'start',
          'dominant-baseline': 'central',
        },
        parent,
      );
      if (style.weight !== undefined) node.setAttribute('font-weight', String(style.weight));
      node.textContent = s;
      return node;
    }

    // ---------- 자리 셈 ----------

    function codeX(g: Geometry, line: number, indent: number): number {
      const b = g.blocks[g.blockOf.get(line) ?? 0];
      return b.x + GUTTER + indent * INDENT_W;
    }
    function blockRight(g: Geometry, line: number): number {
      const b = g.blocks[g.blockOf.get(line) ?? 0];
      return b.x + b.w;
    }
    /** 예외 알약이 줄 위에 앉는 자리(가운데). */
    function anchor(g: Geometry, line: number): Pt {
      return { x: blockRight(g, line) - 8 - PILL_W / 2, y: g.rowY.get(line) ?? 0 };
    }
    /** 아래층 덩이와 위층 덩이 사이의 세로 길 — 부른 고리와 예외가 함께 탄다. */
    function rail(g: Geometry, callee: number, caller: number): number {
      const a = blockRight(g, callee);
      const b = blockRight(g, caller);
      return a > b ? (a + b) / 2 : a + 12;
    }
    /** 예외가 줄 a 에서 줄 b 로 가는 길. 덩이가 다르면 고리를 거꾸로 탄다. */
    function route(g: Geometry, a: number, b: number): Pt[] {
      const p = anchor(g, a);
      const q = anchor(g, b);
      if (g.blockOf.get(a) === g.blockOf.get(b)) return [p, q];
      const x = rail(g, a, b);
      return [p, { x, y: p.y }, { x, y: q.y }, q];
    }
    function lengthOf(pts: Pt[]): number {
      let n = 0;
      for (let i = 1; i < pts.length; i += 1)
        n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      return n;
    }
    function pointAt(pts: Pt[], p: number): Pt {
      const total = lengthOf(pts);
      let left = total * p;
      for (let i = 1; i < pts.length; i += 1) {
        const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (left <= d && d > 0) {
          const f = left / d;
          return {
            x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
            y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
          };
        }
        left -= d;
      }
      return pts[pts.length - 1];
    }
    function ptsAttr(pts: Pt[]): string {
      return pts.map((p) => `${r1(p.x)},${r1(p.y)}`).join(' ');
    }

    // ---------- 정적 그리기 ----------

    type Handles = {
      g: Geometry;
      pill: SVGGElement | null;
      lastLeg: SVGPolylineElement | null;
      lastLegPts: Pt[];
      bar: SVGRectElement | null;
      links: Map<string, SVGPolylineElement>;
      strikes: Map<number, SVGLineElement>;
      lastOut: SVGTextElement | null;
    };

    function fnLabel(fn: string | null): string {
      return fn === null ? t('label.top', 'top level') : fn;
    }

    function drawStatic(scene: ExceptionPropagateScene): Handles {
      svg.textContent = '';
      const g = layout(scene);
      const h: Handles = {
        g,
        pill: null,
        lastLeg: null,
        lastLegPts: [],
        bar: null,
        links: new Map(),
        strikes: new Map(),
        lastOut: null,
      };
      const lines = scene.lines;
      const step = scene.step;
      const mono = fontSizes.md;
      const small = fontSizes.xs;

      const boxes = mk('g', {}, svg);
      const bars = mk('g', {}, svg);
      const texts = mk('g', {}, svg);
      const links = mk('g', {}, svg);
      const path = mk('g', {}, svg);
      const top = mk('g', {}, svg);

      // 덩이 — 맨 바깥은 늘 서 있다. 함수는 부르면 틀이 서고, 예외가 떠나면 점선만 남는다
      g.blocks.forEach(({ block, x, y, w, h: bh }) => {
        let frame: (typeof scene.frames)[number] | null = null;
        for (const f of scene.frames) if (f.fn === block.fn) frame = f;
        const live = block.fn === null || frame?.state === 'live';
        const passed = frame?.state === 'passed';
        const rect = mk(
          'rect',
          {
            x,
            y,
            width: w,
            height: bh,
            rx: 6,
            fill: live ? colors.bgSubtle : 'none',
            stroke: passed ? colors.danger : live ? colors.primary : colors.border,
            'stroke-width': live ? 1.5 : 1,
          },
          boxes,
        );
        if (!live) rect.setAttribute('stroke-dasharray', passed ? '6 4' : '3 3');

        const tagY = g.rowY.get(block.lines[0]) ?? y;
        // 함수 덩이의 오른쪽 끝에는 부른 고리가 내려앉는다 — 이름표는 그 앞에 둔다
        const tagX = block.fn === null ? x + w - 8 : x + w - g.stepX / 2 - 10;
        if (block.fn === null) {
          write(boxes, tagX, tagY, t('label.top', 'top level'), {
            size: small,
            fill: colors.textMuted,
            anchor: 'end',
          });
        } else if (passed) {
          write(boxes, tagX, tagY, t('label.skipped', 'skipped'), {
            size: small,
            fill: colors.danger,
            anchor: 'end',
            weight: 600,
          });
        } else if (frame !== null) {
          const head = lines[block.lines[0]];
          const binds = head.params.map((name, i) =>
            t('label.bind', '{name} = {value}', {
              name,
              value: show(i < frame.args.length ? frame.args[i] : null),
            }),
          );
          write(boxes, tagX, tagY, binds.join(', '), {
            size: fontSizes.sm,
            fill: colors.primary,
            anchor: 'end',
            mono: true,
            weight: 600,
          });
        }
      });

      // 지금 밟는 줄
      if (step.kind !== 'start' && g.rowY.has(step.line)) {
        const b = g.blocks[g.blockOf.get(step.line) ?? 0];
        const exc = step.kind === 'throw' || step.kind === 'arrive';
        const bar = mk(
          'rect',
          {
            x: b.x + 2,
            y: (g.rowY.get(step.line) ?? 0) - g.lineH / 2 + 1,
            width: b.w - 4,
            height: g.lineH - 2,
            rx: 3,
            fill: exc ? colors.danger : colors.primary,
            'fill-opacity': exc ? 0.14 : 0.1,
          },
          bars,
        );
        h.bar = bar;
      }

      // 줄 — 번호 · 글자. 밟은 줄은 번호가 짙고, 밟지 않게 된 줄은 흐려지고 줄이 그어진다
      lines.forEach((l, i) => {
        const y = g.rowY.get(i);
        if (y === undefined) return;
        const b = g.blocks[g.blockOf.get(i) ?? 0];
        const visited = scene.visited.includes(i);
        const skipped = scene.skipped.includes(i);
        write(texts, b.x + GUTTER - 10, y, String(i + 1), {
          size: small,
          fill: visited ? colors.text : colors.textMuted,
          anchor: 'end',
          weight: visited ? 700 : 400,
          mono: true,
        });
        const cx = codeX(g, i, l.indent);
        write(texts, cx, y, l.text, {
          size: mono,
          fill: skipped ? colors.textMuted : colors.text,
          mono: true,
        });
        if (skipped) {
          const strike = mk(
            'line',
            {
              x1: cx - 2,
              y1: y,
              x2: cx + l.text.length * g.charW + 2,
              y2: y,
              stroke: colors.danger,
              'stroke-width': 1.5,
            },
            texts,
          );
          h.strikes.set(i, strike);
        }
      });

      // 부른 고리 — 부른 줄에서 아래층 덩이로
      for (const f of scene.frames) {
        const bi = g.blocks.findIndex((b) => b.block.fn === f.fn);
        if (bi < 0 || !g.rowY.has(f.callLine)) continue;
        const callee = g.blocks[bi];
        const first = callee.block.lines[0];
        const x = rail(g, first, f.callLine);
        const y = g.rowY.get(f.callLine) ?? 0;
        const pts = [
          { x: blockRight(g, f.callLine), y },
          { x, y },
          { x, y: callee.y },
        ];
        const link = mk(
          'polyline',
          {
            points: ptsAttr(pts),
            fill: 'none',
            stroke: f.state === 'live' ? colors.primary : colors.textMuted,
            'stroke-width': 1.25,
          },
          links,
        );
        mk(
          'polygon',
          {
            points: ptsAttr([
              { x: x - 4, y: callee.y - 6 },
              { x: x + 4, y: callee.y - 6 },
              { x, y: callee.y },
            ]),
            fill: f.state === 'live' ? colors.primary : colors.textMuted,
          },
          links,
        );
        h.links.set(f.fn, link);
      }

      // 예외가 지나온 길과 알약
      if (scene.exc !== null) {
        const exc = scene.exc;
        for (let i = 1; i < exc.path.length; i += 1) {
          const pts = route(g, exc.path[i - 1], exc.path[i]);
          const leg = mk(
            'polyline',
            {
              points: ptsAttr(pts),
              fill: 'none',
              stroke: colors.danger,
              'stroke-width': 2.5,
              'stroke-linejoin': 'round',
            },
            path,
          );
          if (i === exc.path.length - 1) {
            h.lastLeg = leg;
            h.lastLegPts = pts;
          }
        }
        const at = anchor(g, exc.path[exc.path.length - 1]);
        const pill = mk('g', { transform: `translate(${r1(at.x)},${r1(at.y)})` }, top);
        mk(
          'rect',
          {
            x: -PILL_W / 2,
            y: -PILL_H / 2,
            width: PILL_W,
            height: PILL_H,
            rx: PILL_H / 2,
            fill: exc.caught ? colors.primary : colors.danger,
          },
          pill,
        );
        write(pill, 0, 0, exc.error, {
          size: fontSizes.sm,
          fill: exc.caught ? colors.textInverse : colors.stateInk,
          mono: true,
          anchor: 'middle',
          weight: 700,
        });
        h.pill = pill;
      }

      // 출력
      const ox = W - M - OUT_W;
      const oy = g.blocks.length > 0 ? g.blocks[0].y : TOP;
      if (lines.length > 0) mk(
        'line',
        { x1: ox, y1: oy, x2: ox, y2: oy + Math.max(g.lineH * 4, 60), stroke: colors.border },
        top,
      );
      if (lines.length > 0) write(top, ox + 10, oy + 8, t('label.output', 'output'), {
        size: small,
        fill: colors.textMuted,
      });
      scene.out.forEach((s, i) => {
        const node = write(top, ox + 10, oy + 8 + (i + 1) * g.lineH, s, {
          size: mono,
          fill: colors.text,
          mono: true,
        });
        if (i === scene.out.length - 1) h.lastOut = node;
      });

      // 캡션 — 지금 일어나는 일만
      const [c1, c2] = caption(scene, g);
      write(top, M, H - CAPTION_H + 16, c1, { size: fontSizes.md, fill: colors.text });
      if (c2 !== '') {
        write(top, M, H - CAPTION_H + 36, c2, {
          size: fontSizes.md,
          fill: step.kind === 'arrive' && !step.caught ? colors.danger : colors.textMuted,
        });
      }
      return h;
    }

    function caption(scene: ExceptionPropagateScene, g: Geometry): [string, string] {
      const step = scene.step;
      if (step.kind === 'start') return [t('caption.start', 'Nothing has run yet.'), ''];
      const line = step.line + 1;
      const owner = g.blocks[g.blockOf.get(step.line) ?? 0]?.block.fn ?? null;
      switch (step.kind) {
        case 'enter':
          return [t('caption.enter', 'Line {line}: into the try body.', { line }), ''];
        case 'call':
          return [
            t('caption.call', 'Line {line} calls {fn} — a new frame stands.', { line, fn: step.fn }),
            '',
          ];
        case 'test':
          return [
            t('caption.test', 'Line {line}: the condition is {value}.', {
              line,
              value: step.value ? t('label.true', 'true') : t('label.false', 'false'),
            }),
            '',
          ];
        case 'assign':
          return [
            t('caption.assign', 'Line {line}: {name} = {value}.', {
              line,
              name: step.to,
              value: show(step.value),
            }),
            '',
          ];
        case 'show':
          return [t('caption.show', 'Line {line} shows: {out}', { line, out: step.out }), ''];
        case 'line':
          return [t('caption.line', 'Line {line}.', { line }), ''];
        case 'return':
          return [
            t('caption.return', 'Line {line}: {fn} returns and its frame comes down.', {
              line,
              fn: fnLabel(owner),
            }),
            '',
          ];
        case 'throw':
          return [
            t('caption.throw', 'Line {line} throws {error} inside {fn}.', {
              line,
              error: step.error,
              fn: fnLabel(owner),
            }),
            '',
          ];
        case 'arrive':
          return [
            t('caption.arrive', '{error} leaves {left} and reaches line {line} in {fn}.', {
              error: step.error,
              left: step.left,
              line,
              fn: fnLabel(owner),
            }),
            step.caught
              ? t('caption.inTry', 'This call site is inside try.')
              : t('caption.noTry', 'No try here — the rest of {fn} is skipped as well.', {
                  fn: fnLabel(owner),
                }),
          ];
        case 'catch':
          return [
            t('caption.catch', 'Line {line}: catch {error} catches it.', {
              line,
              error: step.error,
            }),
            t('caption.passed', 'Frames skipped without catching: {n}.', {
              n: scene.frames.filter((f) => f.state === 'passed').length,
            }),
          ];
      }
    }

    // ---------- 운동 ----------

    function tween(mine: number, draw: (p: number) => void): Promise<void> {
      const frames = Math.max(1, Math.round(MOVE_MS / FRAME_MS));
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let i = 0;
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = i / frames;
          draw(1 - (1 - p) * (1 - p));
          if (i >= frames) {
            finish();
            return;
          }
          i += 1;
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    function grow(line: SVGGeometryElement | SVGLineElement, len: number, p: number): void {
      line.setAttribute('stroke-dasharray', `${r1(len)} ${r1(len)}`);
      line.setAttribute('stroke-dashoffset', String(r1(len * (1 - p))));
    }

    async function move(scene: ExceptionPropagateScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind === 'start') return;
      const g = h.g;

      if ((step.kind === 'arrive' || step.kind === 'catch') && h.pill !== null) {
        // 예외가 고리를 거꾸로 타고 위층의 부른 줄로 오른다 (잡는 걸음에서는 catch 줄로 떨어진다)
        const pill = h.pill;
        const pts = h.lastLegPts;
        const len = lengthOf(pts);
        const fresh: SVGLineElement[] = [];
        h.strikes.forEach((s, li) => {
          const inLeft =
            step.kind === 'arrive'
              ? g.blocks[g.blockOf.get(li) ?? 0]?.block.fn === step.left
              : g.blockOf.get(li) === g.blockOf.get(step.line);
          if (inLeft) fresh.push(s);
        });
        const lens = fresh.map((s) => Number(s.getAttribute('x2')) - Number(s.getAttribute('x1')));
        await tween(mine, (p) => {
          const at = pointAt(pts, p);
          pill.setAttribute('transform', `translate(${r1(at.x)},${r1(at.y)})`);
          if (h.lastLeg !== null) grow(h.lastLeg, len, p);
          fresh.forEach((s, i) => grow(s, lens[i], p));
        });
        return;
      }

      if (step.kind === 'throw' && h.pill !== null) {
        // 던진 줄의 글자 끝에서 알약이 튀어나온다
        const pill = h.pill;
        const l = scene.lines[step.line];
        const end = codeX(g, step.line, l.indent) + l.text.length * g.charW + 6 + PILL_W / 2;
        const to = anchor(g, step.line);
        const from = Math.min(end, to.x);
        await tween(mine, (p) => {
          const x = from + (to.x - from) * p;
          const s = 0.5 + 0.5 * p;
          pill.setAttribute('transform', `translate(${r1(x)},${r1(to.y)}) scale(${r1(s * 100) / 100})`);
        });
        return;
      }

      const bar = h.bar;
      const link = step.kind === 'call' ? h.links.get(step.fn) ?? null : null;
      const linkLen = link === null ? 0 : lengthOf(parsePts(link.getAttribute('points') ?? ''));
      const out = step.kind === 'show' ? h.lastOut : null;
      const fromY = step.from === null ? undefined : g.rowY.get(step.from);
      const toY = g.rowY.get(step.line) ?? 0;
      const fromBlock = step.from === null ? null : g.blockOf.get(step.from) ?? null;
      const sameBlock = fromBlock === g.blockOf.get(step.line);
      const outX = out === null ? 0 : Number(out.getAttribute('x'));
      const outY = out === null ? 0 : Number(out.getAttribute('y'));
      const srcX = codeX(g, step.line, scene.lines[step.line].indent);
      await tween(mine, (p) => {
        // 지금 줄 막대는 앞 줄에서 미끄러져 온다 (같은 덩이 안에서만)
        if (bar !== null && fromY !== undefined && sameBlock) {
          bar.setAttribute('transform', `translate(0,${r1((fromY - toY) * (1 - p))})`);
        }
        if (link !== null) grow(link, linkLen, p);
        if (out !== null) {
          // 출력 한 줄이 그 줄에서 출력 칸으로 건너간다
          out.setAttribute('x', String(r1(srcX + (outX - srcX) * p)));
          out.setAttribute('y', String(r1(toY + (outY - toY) * p)));
        }
      });
    }

    function parsePts(s: string): Pt[] {
      return s
        .split(' ')
        .filter((x) => x !== '')
        .map((pair) => {
          const [x, y] = pair.split(',').map(Number);
          return { x, y };
        });
    }

    return {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate) return;
        await move(next, h, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
