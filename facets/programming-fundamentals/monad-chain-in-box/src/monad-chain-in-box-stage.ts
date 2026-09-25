/**
 * monad-chain-in-box stage — 상자가 이음을 따라 흐른다.
 *
 * 왼쪽에 프로그램, 그 줄 옆에 이름마다 상자 한 칸, 오른쪽에 상자를 받는 함수(`half`)의 자리.
 * 찬 상자의 이음은 상자를 열어 값을 함수 자리까지 실어 가고, 함수에서 **새 상자**가 나와
 * 다음 줄의 칸으로 돌아온다 — 길이 함수 자리를 돌아 나온다. 빈 상자의 이음은 함수 자리에
 * 닿지 않고 짧게 꺾여 빈 상자를 그대로 다음 칸에 내려놓는다. 끝 화면에 두 가지 길이 함께 남는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { MonadChainInBoxScene, SceneBox, Slot } from './scene';

const H = 400;
const SVGNS = 'http://www.w3.org/2000/svg';

/** 이음 하나가 흐르는 시간. 걸음 벽시계 = 이것 + stepMs. */
const CALL_MS = 1000;
const SKIP_MS = 700;
const BIND_MS = 500;
const SHOW_MS = 500;

type Pt = { x: number; y: number };

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
}

function mk(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function polyLen(pts: Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i += 1) {
    s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return s;
}

function pointAt(pts: Pt[], d: number): Pt {
  let left = d;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= seg || i === pts.length - 1) {
      const u = seg === 0 ? 1 : clamp01(left / seg);
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    left -= seg;
  }
  return pts[pts.length - 1];
}

function polyD(pts: Pt[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${r2(p.x)},${r2(p.y)}`).join(' ');
}

/** 캔버스에서 역산한 자리. 줄 수와 글자 수가 정하고, 상수는 상한 · 여백만 둔다. */
type Geo = {
  pad: number;
  charW: number;
  codeX: number;
  codeRight: number;
  rowTop: number;
  rowH: number;
  slotX: number;
  boxW: number;
  bodyH: number;
  lidH: number;
  stationX: number;
  stationW: number;
  stationTop: number;
  stationBottom: number;
  captionY: number;
};

function geometry(scene: MonadChainInBoxScene): Geo {
  const W = PIECE_CANVAS_W;
  const pad = 16;
  const fs = parseFloat(fontSizes.sm);
  const charW = fs * 0.62;
  const codeX = pad + 12;
  let maxChars = 1;
  for (const l of scene.lines) maxChars = Math.max(maxChars, l.indent * 4 + l.text.length);
  const codeRight = codeX + maxChars * charW;
  const captionH = 44;
  const rows = scene.lines.length + 1; // 줄들 + 출력 한 줄
  const rowH = Math.min(36, (H - pad - captionH) / Math.max(rows, 1));
  const rowTop = pad;
  const boxW = Math.min(52, fs * 4);
  const bodyH = rowH * 0.56;
  const lidH = Math.max(4, rowH * 0.16);
  const slotX = codeRight + 28;
  // 함수 자리 — 폭은 글자에서, 자리는 오른쪽 끝에서
  const stationW = Math.max(18 * charW, 150);
  const stationX = W - pad - stationW;
  const slotLines = scene.slotLines;
  const lo = slotLines.length > 0 ? Math.min(...slotLines) : 0;
  const hi = slotLines.length > 0 ? Math.max(...slotLines) : 0;
  return {
    pad,
    charW,
    codeX,
    codeRight,
    rowTop,
    rowH,
    slotX,
    boxW,
    bodyH,
    lidH,
    stationX,
    stationW,
    stationTop: rowTop + rowH * lo,
    stationBottom: rowTop + rowH * (hi + 1),
    captionY: H - 16,
  };
}

function rowY(g: Geo, line: number): number {
  return g.rowTop + g.rowH * (line + 0.5);
}

/** 찬 이음의 길 — 앞 상자의 오른쪽에서 함수 자리로 나가 돌아 다음 상자로 들어온다. */
function callRoute(g: Geo, fromLine: number, line: number): Pt[] {
  const right = g.slotX + g.boxW;
  const turn = g.stationX + 14;
  const yOut = rowY(g, fromLine) + g.rowH * 0.2;
  const yIn = rowY(g, line) - g.rowH * 0.2;
  return [
    { x: right, y: yOut },
    { x: turn, y: yOut },
    { x: turn, y: yIn },
    { x: right + 2, y: yIn },
  ];
}

/** 빈 이음의 길 — 함수 자리에 닿지 않고 곧 꺾여 다음 상자로. */
function skipRoute(g: Geo, fromLine: number, line: number): Pt[] {
  const right = g.slotX + g.boxW;
  const turn = right + 20;
  const yOut = rowY(g, fromLine) + g.rowH * 0.2;
  const yIn = rowY(g, line) - g.rowH * 0.2;
  return [
    { x: right, y: yOut },
    { x: turn, y: yOut },
    { x: turn, y: yIn },
    { x: right + 2, y: yIn },
  ];
}

type BoxHandle = { g: SVGElement; lid: SVGElement };

type Motion =
  | { kind: 'bind'; box: BoxHandle; fromX: number }
  | {
      kind: 'call';
      src: BoxHandle | null;
      box: BoxHandle;
      path: SVGElement;
      head: SVGElement;
      note: SVGElement;
      route: Pt[];
      n: number;
      tokenLayer: SVGElement;
      srcCenter: Pt;
    }
  | { kind: 'skip'; box: BoxHandle; path: SVGElement; head: SVGElement; route: Pt[]; dy: number }
  | { kind: 'show'; text: SVGElement; dx: number; dy: number };

export const monadChainInBoxStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const fsSm = fontSizes.sm;
    const fsXs = fontSizes.xs;
    const fsMd = fontSizes.md;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function drawBox(
      layer: SVGElement,
      g: Geo,
      line: number,
      box: SceneBox,
      hot: boolean,
    ): BoxHandle {
      const y = rowY(g, line);
      const bodyTop = y - g.bodyH / 2 + g.lidH / 2;
      const grp = mk('g', {}, layer);
      const stroke = hot ? colors.itemActive : box.kind === 'box' ? colors.text : colors.textMuted;
      const width = hot ? 2 : 1.4;
      const dash = box.kind === 'empty' ? '4 3' : 'none';
      mk(
        'rect',
        {
          x: g.slotX,
          y: bodyTop,
          width: g.boxW,
          height: g.bodyH,
          rx: 2,
          fill: box.kind === 'box' ? colors.bgSubtle : 'none',
          stroke,
          'stroke-width': width,
          'stroke-dasharray': dash,
        },
        grp,
      );
      if (box.kind === 'box') {
        const tx = mk(
          'text',
          {
            x: g.slotX + g.boxW / 2,
            y: bodyTop + g.bodyH / 2 + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fsSm,
            'font-weight': 600,
            fill: colors.text,
          },
          grp,
        );
        tx.textContent = String(box.v);
      }
      const lid = mk('g', {}, grp);
      mk(
        'rect',
        {
          x: g.slotX - 3,
          y: bodyTop - g.lidH - 1,
          width: g.boxW + 6,
          height: g.lidH,
          rx: 1.5,
          fill: box.kind === 'box' ? colors.bgSubtle : 'none',
          stroke,
          'stroke-width': width,
          'stroke-dasharray': dash,
        },
        lid,
      );
      return { g: grp, lid };
    }

    function arrowHead(layer: SVGElement, at: Pt, color: string): SVGElement {
      const s = 6;
      return mk(
        'path',
        {
          d: `M${r2(at.x)},${r2(at.y)} L${r2(at.x + s)},${r2(at.y - s * 0.7)} L${r2(at.x + s)},${r2(at.y + s * 0.7)} Z`,
          fill: color,
        },
        layer,
      );
    }

    /** 그 장면의 화면 전체. 운동에 필요한 손잡이를 돌려준다. */
    function drawStatic(scene: MonadChainInBoxScene): Motion | null {
      svg.textContent = '';
      if (scene.lines.length === 0) return null;
      const g = geometry(scene);
      const step = scene.step;
      const curLine = step && step.kind !== 'start' ? step.line : -1;

      // ── 프로그램
      const code = mk('g', {}, svg);
      if (curLine >= 0) {
        const y = g.rowTop + g.rowH * curLine;
        mk(
          'rect',
          { x: g.codeX - 8, y: y + 2, width: g.codeRight - g.codeX + 14, height: g.rowH - 4, rx: 3, fill: colors.bgSubtle },
          code,
        );
        mk('rect', { x: g.codeX - 8, y: y + 2, width: 3, height: g.rowH - 4, fill: colors.itemActive }, code);
      }
      scene.lines.forEach((l, i) => {
        const tx = mk(
          'text',
          {
            x: g.codeX + l.indent * 4 * g.charW,
            y: rowY(g, i) + 4,
            'font-family': fonts.mono,
            'font-size': fsSm,
            fill: i === curLine ? colors.text : colors.textMuted,
          },
          code,
        );
        tx.textContent = l.text;
      });

      const calls = scene.slots.filter((s) => s.via.kind === 'call');
      const skips = scene.slots.filter((s) => s.via.kind === 'skip');

      // ── 함수 자리 (이음이 하나라도 있었으면)
      const station = mk('g', {}, svg);
      const routes = mk('g', {}, svg);
      const boxes = mk('g', {}, svg);
      const tokenLayer = mk('g', {}, svg);
      if (calls.length + skips.length > 0) {
        mk(
          'rect',
          {
            x: g.stationX,
            y: g.stationTop,
            width: g.stationW,
            height: g.stationBottom - g.stationTop,
            rx: 6,
            fill: colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
          },
          station,
        );
        const title = mk(
          'text',
          {
            x: g.stationX + g.stationW / 2,
            y: g.stationTop - (calls.length > 0 ? 22 : 8),
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fsMd,
            'font-weight': 700,
            fill: colors.text,
          },
          station,
        );
        title.textContent = scene.fnName;
        const first = calls[0];
        if (first && first.via.kind === 'call' && first.via.condLine >= 0) {
          const head = mk(
            'text',
            {
              x: g.stationX + g.stationW / 2,
              y: g.stationTop - 7,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fsXs,
              fill: colors.textMuted,
            },
            station,
          );
          head.textContent = scene.lines[first.via.condLine]?.text ?? '';
        }
      }

      let motion: Motion | null = null;
      const handles = new Map<number, BoxHandle>();
      const hotLine = step && (step.kind === 'bind' || step.kind === 'call' || step.kind === 'skip') ? step.line : -1;

      const drawSlot = (s: Slot): void => {
        handles.set(s.line, drawBox(boxes, g, s.line, s.out, s.line === hotLine));
      };
      for (const s of scene.slots) drawSlot(s);

      for (const s of scene.slots) {
        const via = s.via;
        if (via.kind === 'call') {
          const hot = s.line === hotLine;
          const color = hot ? colors.itemActive : colors.primary;
          const pts = callRoute(g, via.fromLine, s.line);
          const path = mk(
            'path',
            { d: polyD(pts), fill: 'none', stroke: color, 'stroke-width': hot ? 2 : 1.5, 'stroke-linejoin': 'round' },
            routes,
          );
          const head = arrowHead(routes, pts[pts.length - 1], color);
          const midY = (pts[1].y + pts[2].y) / 2 + 4;
          const note = mk('g', {}, station);
          const call = mk(
            'text',
            {
              x: g.stationX + 26,
              y: midY,
              'font-family': fonts.mono,
              'font-size': fsSm,
              fill: colors.text,
            },
            note,
          );
          call.textContent = `${scene.fnName}(${via.n})`;
          const tag = mk(
            'text',
            {
              x: g.stationX + g.stationW - 10,
              y: midY,
              'text-anchor': 'end',
              'font-family': fonts.mono,
              'font-size': fsSm,
              'font-weight': via.cond ? 700 : 400,
              fill: via.cond ? colors.danger : colors.textMuted,
            },
            note,
          );
          tag.textContent = String(via.cond);
          if (hot && step && step.kind === 'call') {
            const src = handles.get(via.fromLine) ?? null;
            const box = handles.get(s.line);
            if (box) {
              motion = {
                kind: 'call',
                src,
                box,
                path,
                head,
                note,
                route: pts,
                n: via.n,
                tokenLayer,
                srcCenter: { x: g.slotX + g.boxW / 2, y: rowY(g, via.fromLine) },
              };
            }
          }
        } else if (via.kind === 'skip') {
          const hot = s.line === hotLine;
          const color = hot ? colors.itemActive : colors.textMuted;
          const pts = skipRoute(g, via.fromLine, s.line);
          const path = mk(
            'path',
            {
              d: polyD(pts),
              fill: 'none',
              stroke: color,
              'stroke-width': hot ? 2 : 1.5,
              'stroke-dasharray': '4 3',
              'stroke-linejoin': 'round',
            },
            routes,
          );
          const head = arrowHead(routes, pts[pts.length - 1], color);
          const lab = mk(
            'text',
            {
              x: g.stationX + 26,
              y: (pts[1].y + pts[2].y) / 2 + 4,
              'font-family': fonts.body,
              'font-size': fsXs,
              'font-style': 'italic',
              fill: colors.textMuted,
            },
            station,
          );
          lab.textContent = t('label.notCalled', 'not called');
          if (hot && step && step.kind === 'skip') {
            const box = handles.get(s.line);
            if (box) {
              motion = {
                kind: 'skip',
                box,
                path,
                head,
                route: pts,
                dy: rowY(g, via.fromLine) - rowY(g, s.line),
              };
            }
          }
        } else if (s.line === hotLine && step && step.kind === 'bind') {
          const box = handles.get(s.line);
          const l = scene.lines[s.line];
          if (box && l) {
            const codeEnd = g.codeX + (l.indent * 4 + l.text.length) * g.charW;
            motion = { kind: 'bind', box, fromX: codeEnd - g.boxW - g.slotX };
          }
        }
      }

      // ── 출력
      const outY = rowY(g, scene.lines.length);
      const outLabel = mk(
        'text',
        {
          x: g.codeX,
          y: outY + 4,
          'font-family': fonts.body,
          'font-size': fsSm,
          fill: colors.textMuted,
        },
        svg,
      );
      outLabel.textContent = t('label.output', 'output');
      if (scene.output) {
        const outText = mk(
          'text',
          {
            x: g.slotX + g.boxW / 2,
            y: outY + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fsSm,
            'font-weight': 700,
            fill: colors.text,
          },
          svg,
        );
        outText.textContent = scene.output.code;
        if (step && step.kind === 'show' && step.fromLine >= 0) {
          motion = { kind: 'show', text: outText, dx: 0, dy: rowY(g, step.fromLine) - outY };
        }
      }

      // ── 캡션 — 지금 일어나는 일만
      const caption = mk(
        'text',
        {
          x: g.pad,
          y: g.captionY,
          'font-family': fonts.body,
          'font-size': fsMd,
          fill: colors.text,
        },
        svg,
      );
      caption.textContent = captionOf(scene);
      return motion;
    }

    function captionOf(scene: MonadChainInBoxScene): string {
      const step = scene.step;
      if (!step || step.kind === 'start') return t('caption.start', 'No line has run yet.');
      const slot = scene.slots.find((s) => s.line === (step.kind === 'show' ? -2 : step.line));
      const nameOf = (line: number): string => scene.slots.find((s) => s.line === line)?.name ?? '';
      if (step.kind === 'bind' && slot) {
        return t('caption.bind', 'A value goes into a box: {name} = {code}', {
          name: slot.name,
          code: slot.code,
        });
      }
      if (step.kind === 'call' && slot && slot.via.kind === 'call') {
        return t('caption.call', 'then opens {from} and hands {n} to {fn}. A new box comes back: {name} = {code}', {
          from: nameOf(step.fromLine),
          n: slot.via.n,
          fn: scene.fnName,
          name: slot.name,
          code: slot.code,
        });
      }
      if (step.kind === 'skip' && slot) {
        return t('caption.skip', '{from} is empty, so then skips {fn}. The empty box passes on: {name} = {code}', {
          from: nameOf(step.fromLine),
          fn: scene.fnName,
          name: slot.name,
          code: slot.code,
        });
      }
      if (step.kind === 'show' && scene.output) {
        const calls = scene.slots.filter((s) => s.via.kind === 'call').length;
        const links = calls + scene.slots.filter((s) => s.via.kind === 'skip').length;
        return t('caption.show', 'Output: {code} · {fn} called: {calls} · then links: {links}', {
          code: scene.output.code,
          fn: scene.fnName,
          calls,
          links,
        });
      }
      return '';
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = clamp01((Date.now() - start) / ms);
          frame(p);
          if (p >= 1) {
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

    async function play(m: Motion, mine: number): Promise<void> {
      if (m.kind === 'bind') {
        await tween(BIND_MS, mine, (p) => {
          const e = ease(p);
          m.box.g.setAttribute('transform', `translate(${r2(m.fromX * (1 - e))},0)`);
        });
        return;
      }
      if (m.kind === 'show') {
        await tween(SHOW_MS, mine, (p) => {
          const e = ease(p);
          m.text.setAttribute('transform', `translate(${r2(m.dx * (1 - e))},${r2(m.dy * (1 - e))})`);
        });
        return;
      }
      if (m.kind === 'skip') {
        const L = polyLen(m.route);
        const end = m.route[m.route.length - 1];
        const yA = m.route[0].y;
        const yB = end.y;
        m.path.setAttribute('stroke-dasharray', `${r2(L)} ${r2(L)}`);
        await tween(SKIP_MS, mine, (p) => {
          const e = ease(p);
          const d = L * e;
          m.path.setAttribute('stroke-dashoffset', String(r2(L - d)));
          m.head.setAttribute('opacity', e >= 1 ? '1' : '0');
          const at = pointAt(m.route, d);
          const down = yB === yA ? 1 : clamp01((at.y - yA) / (yB - yA));
          m.box.g.setAttribute('transform', `translate(${r2(at.x - end.x)},${r2(m.dy * (1 - down))})`);
        });
        return;
      }
      // call — 한 머리가 길을 따라 간다. 꺾이기 전엔 값을, 꺾인 뒤엔 새 상자를 싣는다.
      const L = polyLen(m.route);
      const outLen = polyLen(m.route.slice(0, 2));
      const turnLen = polyLen(m.route.slice(0, 3));
      const end = m.route[m.route.length - 1];
      m.path.setAttribute('stroke-dasharray', `${r2(L)} ${r2(L)}`);
      const token = mk(
        'text',
        {
          x: m.srcCenter.x,
          y: m.srcCenter.y + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fsSm,
          'font-weight': 700,
          fill: colors.itemActive,
        },
        m.tokenLayer,
      );
      token.textContent = String(m.n);
      await tween(CALL_MS, mine, (p) => {
        const e = ease(p);
        const d = L * e;
        m.path.setAttribute('stroke-dashoffset', String(r2(L - d)));
        m.head.setAttribute('opacity', e >= 1 ? '1' : '0');
        // 앞 상자의 뚜껑 — 값이 떠나는 동안 열렸다가 닫힌다
        if (m.src) {
          const open = d < outLen ? Math.min(1, d / (outLen * 0.25)) : Math.max(0, 1 - (d - outLen) / (outLen * 0.3));
          m.src.lid.setAttribute('transform', `translate(0,${r2(-7 * open)})`);
        }
        const at = pointAt(m.route, d);
        if (d < outLen) {
          // 값이 상자에서 나와 함수 자리로
          const lift = Math.min(1, d / (outLen * 0.2));
          const fromX = m.srcCenter.x;
          const x = lift < 1 ? fromX : at.x;
          const y = lift < 1 ? m.srcCenter.y + (at.y - m.srcCenter.y) * lift : at.y;
          token.setAttribute('x', String(r2(x)));
          token.setAttribute('y', String(r2(y + 4)));
          token.setAttribute('opacity', '1');
        } else {
          token.setAttribute('opacity', '0');
        }
        m.note.setAttribute('opacity', d >= outLen ? '1' : '0');
        if (d < turnLen) {
          m.box.g.setAttribute('opacity', '0');
        } else {
          m.box.g.setAttribute('opacity', '1');
          m.box.g.setAttribute('transform', `translate(${r2(at.x - end.x)},0)`);
        }
      });
    }

    return {
      async render(next: MonadChainInBoxScene, _prev: MonadChainInBoxScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const motion = drawStatic(next);
        if (!opts.animate || !motion) return;
        await play(motion, mine);
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
  },
};
