/**
 * dangling-reference 무대 — 왼쪽에 프로그램, 오른쪽에 자리들이 주소 차례로 놓인다.
 *
 * 동사: 주인 없는 자리를 가리킨 채 남는다.
 * - 부르면 함수의 틀이 위에서 내려와 자리 위에 덮이고, 그 안의 이름표가 자리에 붙는다
 * - 돌아오면 틀이 이름표째 들려 올라가 사라진다 — 자리 상자와 그 안의 값은 제자리에 남는다
 * - 돌려준 주소는 틀 위에 떠 있다가 받는 자리로 내려앉고, 그 자리에서 가리키는 화살이 뻗는다.
 *   화살은 그 뒤로 한 번도 움직이지 않는다
 * - 다음 틀이 같은 자리에 내려와 새 값을 넣으면 옛 값이 아래로 밀려난다
 * - 따라가 읽으면 점이 화살을 타고 가고, 그 자리의 값이 출력으로 날아간다
 *
 * 값의 색은 그 값을 쓴 틀의 색이다 — 출력으로 나간 값이 누구의 것인지 색이 말한다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { DanglingScene, SceneVal } from './scene';

const H = 330;
const PAD = 16;
const DUR = 400;
const FRAME_MS = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로 자리 — 캔버스 세로가 고정이라 상수로 둔다 */
const Y = {
  retMid: 26,
  frameTop: 44,
  frameTitle: 61,
  tag: 86,
  boxTop: 98,
  boxH: 62,
  frameBottom: 176,
  dip: 218,
  codeTop: 30,
  codeBottom: 224,
  output: 252,
  rule: 270,
  caption: 292,
  captionGap: 20,
} as const;

const r = (v: number): number => {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
};

const fmtVal = (v: SceneVal): string => (v === null ? '' : v.t === 'num' ? String(v.n) : `@${v.a}`);

type Geo = {
  codeX: number;
  codeRight: number;
  cw: number;
  lineH: number;
  lineY: (i: number) => number;
  colX: (addr: number) => number;
  boxW: number;
  first: number;
  last: number;
  outX: number;
};

type Handles = {
  hl: SVGRectElement | null;
  frames: Map<string, SVGGElement>;
  cells: Map<number, SVGGElement>;
  vals: Map<number, SVGTextElement>;
  tags: Map<number, SVGGElement>;
  arrows: Map<number, { path: SVGPathElement; head: SVGPolygonElement; len: number; pts: number[] }>;
  ret: SVGGElement | null;
  outs: SVGTextElement[];
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  s: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el('text', { x, y, ...attrs }, parent);
  node.textContent = s;
  return node;
}

/** 삼차 베지어 위의 점 */
function bez(pts: number[], p: number): [number, number] {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = pts;
  const q = 1 - p;
  const a = q * q * q;
  const b = 3 * q * q * p;
  const c = 3 * q * p * p;
  const d = p * p * p;
  return [a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3];
}

function bezLen(pts: number[]): number {
  let len = 0;
  let [px, py] = bez(pts, 0);
  for (let i = 1; i <= 24; i += 1) {
    const [x, y] = bez(pts, i / 24);
    len += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return len;
}

/** 캡션 줄 나누기 — 글자 폭을 글꼴 크기에서 어림한다 */
function wrap(s: string, px: number, width: number): string[] {
  const wide = (ch: string): boolean => /[ᄀ-ᇿ⺀-鿿가-힯＀-￯]/.test(ch);
  const w = (ch: string): number => (wide(ch) ? px : px * 0.56);
  const out: string[] = [];
  let cur = '';
  let curW = 0;
  let lastSpace = -1;
  for (const ch of s) {
    cur += ch;
    curW += w(ch);
    if (ch === ' ') lastSpace = cur.length;
    if (curW > width) {
      if (lastSpace > 0) {
        out.push(cur.slice(0, lastSpace).trimEnd());
        cur = cur.slice(lastSpace);
      } else {
        out.push(cur.slice(0, -1));
        cur = ch;
      }
      curW = [...cur].reduce((a, c) => a + w(c), 0);
      lastSpace = -1;
    }
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

function caption(scene: DanglingScene, t: Translate): string {
  const s = scene.step;
  switch (s.k) {
    case 'start':
      return t('caption.start', 'No line has run yet.');
    case 'call':
      return s.slot
        ? t('caption.callLet', '{name} takes slot {addr} first, still empty. Then {fn}() is called — a new frame is set up.', {
            name: s.slot.name,
            addr: `@${s.slot.addr}`,
            fn: s.fn,
          })
        : t('caption.call', '{fn}() is called — a new frame is set up.', { fn: s.fn });
    case 'assign': {
      const vars = { fn: s.fn ?? '', name: s.name, addr: `@${s.addr}`, value: fmtVal(s.val) };
      if (s.fn === null) return t('caption.assignOuter', '{name} takes slot {addr} and gets {value}.', vars);
      return s.pointedBy
        ? t('caption.assignPointed', 'Inside {fn}(), {name} takes slot {addr} and gets {value} — the very slot {holder} points to.', {
            ...vars,
            holder: s.pointedBy,
          })
        : t('caption.assign', 'Inside {fn}(), {name} takes slot {addr} and gets {value}.', vars);
    }
    case 'return':
      return s.ofName
        ? t('caption.returnAddr', '{fn}() hands back {value}, the address of {name}.', {
            fn: s.fn,
            value: fmtVal(s.val),
            name: s.ofName,
          })
        : t('caption.return', '{fn}() hands back {value}.', { fn: s.fn, value: fmtVal(s.val) });
    case 'back': {
      const first = s.gone[0];
      if (!first) return t('caption.backEmpty', '{fn}() returns — its frame is lifted.', { fn: s.fn });
      const vars = {
        fn: s.fn,
        gone: s.gone.map((g) => g.name).join(', '),
        slot: `@${first.addr}`,
        old: fmtVal(first.val),
      };
      if (s.to)
        return t(
          'caption.backSet',
          '{fn}() returns — its frame is lifted and the name {gone} is gone, yet slot {slot} still holds {old}. {name} now holds {value}.',
          { ...vars, name: s.to.name, value: fmtVal(s.val) },
        );
      if (s.heldBy)
        return t(
          'caption.backHeld',
          '{fn}() returns — its frame is lifted and the name {gone} is gone, yet slot {slot} still holds {old}. {holder} still holds {slot}.',
          { ...vars, holder: s.heldBy },
        );
      return t(
        'caption.backPlain',
        '{fn}() returns — its frame is lifted and the name {gone} is gone, yet slot {slot} still holds {old}.',
        vars,
      );
    }
    case 'show': {
      if (!s.deref) return t('caption.show', 'Shown: {value}.', { value: fmtVal(s.val) });
      const vars = { name: s.deref.name, addr: `@${s.deref.addr}`, value: fmtVal(s.val) };
      const was = fmtVal(s.deref.was);
      return was !== '' && was !== vars.value
        ? t('caption.showChanged', 'Following the address {addr} in {name} reads {value}, not the {was} that was there when {name} got it.', {
            ...vars,
            was,
          })
        : t('caption.showDeref', 'Following the address {addr} in {name} reads {value}.', vars);
    }
    default:
      return '';
  }
}

export const danglingReferenceStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const codePx = parseFloat(fontSizes.sm);
    const valPx = parseFloat(fontSizes.lg);
    const capPx = parseFloat(fontSizes.sm);
    const W = PIECE_CANVAS_W;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    const fnColor = (scene: DanglingScene, fn: string | null): string => {
      if (fn === null) return colors.text;
      const i = scene.fns.indexOf(fn);
      const pal = categorical(Math.max(1, scene.fns.length));
      return i >= 0 ? pal[i] : colors.text;
    };

    function geo(scene: DanglingScene): Geo {
      const cw = codePx * 0.6;
      const maxChars = scene.lines.reduce((m, l) => Math.max(m, l.indent * 4 + l.text.length), 10);
      const codeX = PAD + 10;
      const codeRight = codeX + maxChars * cw + 12;
      const lineH = Math.min(26, (Y.codeBottom - Y.codeTop) / Math.max(1, scene.lines.length));
      const addrs = [
        ...scene.cells.map((c) => c.addr),
        ...scene.frames.map((f) => f.base),
        ...(scene.step.k === 'back' ? [scene.step.base] : []),
      ];
      const first = addrs.length > 0 ? Math.min(...addrs) : 100;
      const last = addrs.length > 0 ? Math.max(...addrs) : 100;
      const n = last - first + 1;
      const memL = codeRight + 28;
      const memR = W - PAD;
      const colW = Math.min(170, (memR - memL) / n);
      const off = memL + (memR - memL - colW * n) / 2;
      return {
        codeX,
        codeRight,
        cw,
        lineH,
        lineY: (i) => Y.codeTop + lineH * (i + 0.5),
        colX: (addr) => off + colW * (addr - first + 0.5),
        boxW: Math.min(118, colW - 30),
        first,
        last,
        outX: codeX + 58,
      };
    }

    /** 틀 판 하나 — 정적 그리기와 들려 나가는 운동이 함께 쓴다 */
    function drawFrame(
      parent: Element,
      g: Geo,
      scene: DanglingScene,
      fn: string,
      base: number,
      lastAddr: number,
      tags: { name: string; addr: number }[],
    ): SVGGElement {
      const color = fnColor(scene, fn);
      const grp = el('g', {}, parent);
      const x0 = g.colX(base) - g.boxW / 2 - 12;
      const x1 = g.colX(Math.max(base, lastAddr)) + g.boxW / 2 + 12;
      el(
        'rect',
        {
          x: x0,
          y: Y.frameTop,
          width: x1 - x0,
          height: Y.frameBottom - Y.frameTop,
          rx: 8,
          fill: color,
          'fill-opacity': 0.1,
          stroke: color,
          'stroke-width': 1.5,
        },
        grp,
      );
      label(grp, x0 + 10, Y.frameTitle, t('label.frame', 'frame of {fn}()', { fn }), {
        fill: color,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'font-weight': 600,
      });
      for (const tag of tags) {
        label(grp, g.colX(tag.addr), Y.tag, tag.name, {
          fill: color,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 600,
          'text-anchor': 'middle',
        });
      }
      return grp;
    }

    function arrowPts(g: Geo, from: number, to: number): number[] {
      const bb = Y.boxTop + Y.boxH;
      const hx = g.colX(from);
      const tx = g.colX(to);
      return [hx, bb, hx, Y.dip, tx, Y.dip, tx, bb + 10];
    }

    function drawStatic(scene: DanglingScene): Handles {
      svg.textContent = '';
      const h: Handles = {
        hl: null,
        frames: new Map(),
        cells: new Map(),
        vals: new Map(),
        tags: new Map(),
        arrows: new Map(),
        ret: null,
        outs: [],
      };
      if (scene.lines.length === 0) return h;
      const g = geo(scene);

      // 코드
      if (scene.at !== null) {
        h.hl = el(
          'rect',
          {
            x: PAD,
            y: g.lineY(scene.at) - g.lineH / 2,
            width: g.codeRight - PAD,
            height: g.lineH,
            rx: 3,
            fill: colors.accent,
            'fill-opacity': 0.3,
          },
          svg,
        );
      }
      scene.lines.forEach((ln, i) => {
        label(svg, g.codeX + ln.indent * 4 * g.cw, g.lineY(i) + codePx * 0.35, ln.text, {
          fill: colors.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        });
      });

      // 출력
      label(svg, g.codeX, Y.output, t('label.output', 'output'), {
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
      });
      scene.out.forEach((o, i) => {
        h.outs.push(
          label(svg, g.outX + i * 40, Y.output + 1, fmtVal(o.val), {
            fill: fnColor(scene, o.by),
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
            'font-weight': 700,
          }),
        );
      });

      // 가리키는 화살 — 자리 안의 주소가 보이는 자리를 향할 때
      for (const c of scene.cells) {
        if (!c.val || c.val.t !== 'addr' || c.val.a < g.first || c.val.a > g.last) continue;
        const pts = arrowPts(g, c.addr, c.val.a);
        const [x0, y0, x1, y1, x2, y2, x3, y3] = pts;
        const path = el(
          'path',
          {
            d: `M ${r(x0)} ${r(y0)} C ${r(x1)} ${r(y1)}, ${r(x2)} ${r(y2)}, ${r(x3)} ${r(y3)}`,
            fill: 'none',
            stroke: colors.primary,
            'stroke-width': 2,
          },
          svg,
        );
        const head = el(
          'polygon',
          { points: `${r(x3)},${r(y3 - 9)} ${r(x3 - 5)},${r(y3 + 1)} ${r(x3 + 5)},${r(y3 + 1)}`, fill: colors.primary },
          svg,
        );
        h.arrows.set(c.addr, { path, head, len: bezLen(pts), pts });
      }

      // 자리
      for (const c of scene.cells) {
        const x = g.colX(c.addr);
        const grp = el('g', {}, svg);
        const owned = c.owner !== null;
        el(
          'rect',
          {
            x: x - g.boxW / 2,
            y: Y.boxTop,
            width: g.boxW,
            height: Y.boxH,
            rx: 6,
            fill: colors.bg,
            stroke: owned ? colors.border : colors.textMuted,
            'stroke-width': 1.5,
            ...(owned ? {} : { 'stroke-dasharray': '5 4' }),
          },
          grp,
        );
        label(grp, x - g.boxW / 2 + 7, Y.boxTop + 14, `@${c.addr}`, {
          fill: colors.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        h.vals.set(
          c.addr,
          label(grp, x, Y.boxTop + Y.boxH / 2 + valPx * 0.55, fmtVal(c.val), {
            fill: c.val && c.val.t === 'addr' ? colors.primary : fnColor(scene, c.by),
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
            'font-weight': 700,
            'text-anchor': 'middle',
          }),
        );
        h.cells.set(c.addr, grp);
        // 맨 바깥 이름표와 주인 잃은 표는 여기서, 틀 안 이름표는 틀 판이 가진다
        const tag = el('g', {}, svg);
        if (!owned) {
          label(tag, x, Y.tag, t('label.noName', 'no name'), {
            fill: colors.textMuted,
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            'font-style': 'italic',
            'text-anchor': 'middle',
          });
        } else if (c.ownerFn === null && c.owner !== null) {
          label(tag, x, Y.tag, c.owner, {
            fill: colors.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'font-weight': 600,
            'text-anchor': 'middle',
          });
        }
        h.tags.set(c.addr, tag);
      }

      // 서 있는 틀 — 자리 위에 덮인다
      for (const f of scene.frames) {
        const mine = scene.cells.filter((c) => c.ownerFn === f.fn && c.owner !== null);
        const lastAddr = mine.reduce((m, c) => Math.max(m, c.addr), f.base);
        h.frames.set(
          f.fn,
          drawFrame(
            svg,
            g,
            scene,
            f.fn,
            f.base,
            lastAddr,
            mine.map((c) => ({ name: c.owner as string, addr: c.addr })),
          ),
        );
      }

      // 돌려주고 아직 받지 않은 값 — 틀 위에 뜬다
      if (scene.ret) {
        const f = scene.frames.find((fr) => fr.fn === scene.ret?.fn);
        const cx = f ? g.colX(f.base) : g.colX(g.last);
        h.ret = drawChip(svg, cx, Y.retMid, fmtVal(scene.ret.val), colors.primary);
      }

      // 캡션
      el('line', { x1: PAD, y1: Y.rule, x2: W - PAD, y2: Y.rule, stroke: colors.border, 'stroke-width': 1 }, svg);
      wrap(caption(scene, t), capPx, W - PAD * 2)
        .slice(0, 2)
        .forEach((s, i) => {
          label(svg, PAD, Y.caption + i * Y.captionGap, s, {
            fill: colors.text,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
          });
        });
      return h;
    }

    function drawChip(parent: Element, cx: number, cy: number, s: string, color: string): SVGGElement {
      const grp = el('g', { transform: `translate(${r(cx)} ${r(cy)})` }, parent);
      const w = s.length * valPx * 0.6 + 16;
      el('rect', { x: -w / 2, y: -12, width: w, height: 24, rx: 12, fill: colors.bg, stroke: color, 'stroke-width': 1.5 }, grp);
      label(grp, 0, valPx * 0.36, s, {
        fill: color,
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': 700,
        'text-anchor': 'middle',
      });
      return grp;
    }

    const move = (node: Element, dx: number, dy: number): void => {
      node.setAttribute('transform', `translate(${r(dx)} ${r(dy)})`);
    };
    const fade = (node: Element, o: number): void => {
      node.setAttribute('opacity', String(r(o)));
    };
    const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2);
    const seg = (p: number, a: number, b: number): number => ease(Math.min(1, Math.max(0, (p - a) / (b - a))));

    /** 한 시계 — 끝나거나 세대가 바뀌거나 거두어지면 풀린다 */
    function clock(mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        let n = 0;
        const total = Math.max(1, Math.round(DUR / FRAME_MS));
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, n / total);
          frame(p);
          if (p >= 1) return finish();
          n += 1;
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function animateStep(next: DanglingScene, h: Handles, mine: number): Promise<void> {
      const g = geo(next);
      const s = next.step;
      const layer = el('g', {}, svg);
      const hlFrom = s.k !== 'start' && s.from !== null && next.at !== null ? g.lineY(s.from) - g.lineY(next.at) : 0;

      const frame = (p: number): void => {
        if (h.hl) move(h.hl, 0, hlFrom * (1 - seg(p, 0, 0.6)));
      };
      let body: (p: number) => void = () => undefined;

      if (s.k === 'call') {
        const fg = h.frames.get(s.fn);
        const slotG = s.slot ? h.cells.get(s.slot.addr) : undefined;
        const slotTag = s.slot ? h.tags.get(s.slot.addr) : undefined;
        body = (p) => {
          const q = seg(p, 0.15, 1);
          if (fg) {
            move(fg, 0, -44 * (1 - q));
            fade(fg, q);
          }
          const e = seg(p, 0, 0.5);
          for (const node of [slotG, slotTag]) {
            if (!node) continue;
            move(node, 0, -18 * (1 - e));
            fade(node, e);
          }
        };
      } else if (s.k === 'assign') {
        const vt = h.vals.get(s.addr);
        const x = g.colX(s.addr);
        const oldText =
          s.before !== null
            ? label(layer, x, Y.boxTop + Y.boxH / 2 + valPx * 0.55, fmtVal(s.before), {
                fill: fnColor(next, s.beforeBy),
                'font-family': fonts.mono,
                'font-size': fontSizes.lg,
                'font-weight': 700,
                'text-anchor': 'middle',
              })
            : null;
        const fg = s.fn !== null ? h.frames.get(s.fn) : undefined;
        const tagText = fg ? [...fg.querySelectorAll('text')].find((n) => n.textContent === s.name) : undefined;
        const freshCell = s.before === null ? h.cells.get(s.addr) : undefined;
        body = (p) => {
          const q = seg(p, 0.35, 1);
          if (vt) {
            move(vt, 0, -30 * (1 - q));
            fade(vt, q);
          }
          if (oldText) {
            const o = seg(p, 0, 0.6);
            move(oldText, 10 * o, 34 * o);
            fade(oldText, 1 - o);
          }
          if (tagText) fade(tagText, seg(p, 0, 0.4));
          if (freshCell) fade(freshCell, seg(p, 0, 0.4));
        };
      } else if (s.k === 'return') {
        const chip = h.ret;
        const f = next.frames.find((fr) => fr.fn === s.fn);
        const endX = f ? g.colX(f.base) : g.colX(g.last);
        const startX = s.val && s.val.t === 'addr' && s.val.a >= g.first && s.val.a <= g.last ? g.colX(s.val.a) : endX;
        const startY = Y.boxTop + Y.boxH / 2;
        body = (p) => {
          if (!chip) return;
          const q = seg(p, 0, 1);
          move(chip, startX + (endX - startX) * q, startY + (Y.retMid - startY) * q);
          fade(chip, Math.min(1, 0.3 + q));
        };
      } else if (s.k === 'back') {
        const lastAddr = s.gone.reduce((m, x) => Math.max(m, x.addr), s.base);
        const ghost = drawFrame(layer, g, next, s.fn, s.base, lastAddr, s.gone);
        const chip = s.to ? drawChip(layer, g.colX(s.base), Y.retMid, fmtVal(s.val), colors.primary) : null;
        const toX = s.to ? g.colX(s.to.addr) : 0;
        const toY = Y.boxTop + Y.boxH / 2;
        const vt = s.to ? h.vals.get(s.to.addr) : undefined;
        const arrow = s.to ? h.arrows.get(s.to.addr) : undefined;
        const goneTags = s.gone.map((x) => h.tags.get(x.addr));
        body = (p) => {
          const lift = seg(p, 0, 0.6);
          move(ghost, 0, -46 * lift);
          fade(ghost, 1 - lift);
          for (const tg of goneTags) if (tg) fade(tg, seg(p, 0.4, 1));
          if (chip) {
            const q = seg(p, 0.2, 0.8);
            move(chip, g.colX(s.base) + (toX - g.colX(s.base)) * q, Y.retMid + (toY - Y.retMid) * q);
            fade(chip, p >= 0.8 ? 0 : 1);
          }
          if (vt) fade(vt, p >= 0.8 ? 1 : 0);
          if (arrow) {
            const a = seg(p, 0.8, 1);
            arrow.path.setAttribute('stroke-dasharray', `${r(arrow.len)} ${r(arrow.len)}`);
            arrow.path.setAttribute('stroke-dashoffset', String(r(arrow.len * (1 - a))));
            fade(arrow.head, a >= 1 ? 1 : 0);
          }
        };
      } else if (s.k === 'show') {
        const arrow = s.deref ? h.arrows.get(s.deref.slot) : undefined;
        const dot = arrow ? el('circle', { cx: arrow.pts[0], cy: arrow.pts[1], r: 5, fill: colors.primary }, layer) : null;
        const outText = h.outs[h.outs.length - 1];
        const src = s.deref ? g.colX(s.deref.addr) : g.codeX;
        const srcY = Y.boxTop + Y.boxH / 2;
        const chip = drawChip(layer, src, srcY, fmtVal(s.val), fnColor(next, s.by));
        const dstX = g.outX + (h.outs.length - 1) * 40 + 10;
        const dstY = Y.output - 5;
        body = (p) => {
          if (dot && arrow) {
            const [x, y] = bez(arrow.pts, seg(p, 0, 0.45));
            dot.setAttribute('cx', String(r(x)));
            dot.setAttribute('cy', String(r(y)));
            fade(dot, p < 0.5 ? 1 : 0);
          }
          const q = seg(p, 0.5, 1);
          move(chip, src + (dstX - src) * q, srcY + (dstY - srcY) * q);
          fade(chip, p < 0.45 ? 0 : p >= 1 ? 0 : 1);
          if (outText) fade(outText, p >= 1 ? 1 : 0);
        };
      }

      await clock(mine, (p) => {
        frame(p);
        body(p);
      });
    }

    let current: DanglingScene | null = null;

    return {
      render(next: DanglingScene, _prev: DanglingScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return Promise.resolve();
        const mine = (gen += 1);
        current = next;
        const h = drawStatic(next);
        if (!opts.animate || next.step.k === 'start' || next.lines.length === 0) return Promise.resolve();
        return animateStep(next, h, mine).then(() => {
          if (mine === gen && !destroyed && current) drawStatic(current);
        });
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
