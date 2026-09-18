/**
 * 구조체 정렬 stage — 필드 블록이 주소 자 위로 내려앉고, 자기 정렬의 배수 자리까지
 * **밀려나며** 빈틈을 벌린다. 순서가 바뀌면 블록들이 **자리를 바꿔** 빈틈을 닫는다.
 *
 * 그림의 층 (위에서 아래로)
 *   선언 트레이   필드가 선언된 차례대로 놓인 집. 첫 판에서 블록이 여기서 떠난다
 *   주소 자       0 … 32 바이트. 놓는 필드의 정렬 배수 자리에 점이 뜬다
 *   레일          블록과 빈틈. 앞 판의 배치는 흐려진 채 남아 있다가 새 자리로 옮겨 간다
 *   읽기 창       어긋난 필드가 걸친 제 크기의 칸 둘
 *   끝 표시       구조체의 끝. 앞 판의 끝은 점선으로 남는다
 *   캡션
 *
 * 세로는 마운트 뒤 바뀌지 않는다 — 가장 큰 배치(32 바이트)가 처음부터 들어간다.
 */

import {
  categorical,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const W = 700;
const H = 264;
/** 바이트 0 의 x. */
const X0 = 30;
/** 한 바이트의 폭. 32 바이트가 640 에 든다. */
const U = 20;
/** 자가 보이는 끝 — 사다리의 가장 큰 배치. */
const MAX_BYTES = 32;

const TRAY_Y = 22;
const BLOCK_H = 30;
const RULER_Y = 96;
const DOT_Y = 110;
const RAIL_Y = 118;
const WIN_Y = 156;
const WIN_H = 12;
const BRACKET_Y = 192;
const CAPTION_Y = 250;
const TRAY_GAP = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

const X = (byte: number): number => X0 + byte * U;

type Field = { name: string; ctype: string; size: number };

function readFields(raw: unknown): Field[] {
  if (!Array.isArray(raw)) return [];
  const out: Field[] = [];
  for (const f of raw) {
    if (typeof f !== 'object' || f === null) continue;
    const { name, ctype, size } = f as { name?: unknown; ctype?: unknown; size?: unknown };
    if (typeof name === 'string' && typeof ctype === 'string' && typeof size === 'number') {
      out.push({ name, ctype, size });
    }
  }
  return out;
}

export type StructPlaceArgs = {
  field: number;
  slot: number;
  from: number;
  offset: number;
  align: number;
  size: number;
  ms: number;
};

export type StructTailArgs = { from: number; size: number; structAlign: number; ms: number };

/** projector 가 부르는 표면. */
export type StructAlignmentStage = {
  reset(): void;
  beginLayout(ms: number): void;
  place(a: StructPlaceArgs): void;
  misalign(field: number, offset: number, size: number): void;
  tail(a: StructTailArgs): void;
  setCaption(text: string): void;
};

export const structAlignmentStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const tr = params.t ?? makeTranslator(params.locale);
    const palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const fields = readFields(params.initialData?.fields);
    const hues = categorical(Math.max(1, fields.length), 'vivid');

    let destroyed = false;
    const frames = new Set<number>();

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = root,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      parent.appendChild(node);
      return node;
    };

    const root = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(root);

    // ── 숫자 여럿을 한꺼번에 옮기는 작은 트윈. 경유점을 같은 간격으로 지난다.
    type Tween = { to(path: number[][], ms: number): void; finish(): void; now(): number[] };
    const tweens: Tween[] = [];
    const tween = (init: number[], draw: (v: number[]) => void): Tween => {
      let cur = init.slice();
      let target = init.slice();
      let frame = 0;
      const stop = () => {
        if (frame !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
        frames.delete(frame);
        frame = 0;
      };
      const t: Tween = {
        to(path, ms) {
          stop();
          const points = [cur.slice(), ...path];
          target = points[points.length - 1]!.slice();
          if (destroyed || isInstant() || ms <= 0 || typeof requestAnimationFrame !== 'function') {
            cur = target.slice();
            draw(cur);
            return;
          }
          const legs = points.length - 1;
          const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
          const step = (now: number) => {
            frames.delete(frame);
            frame = 0;
            if (destroyed) return;
            const p = Math.min(1, (now - start) / ms);
            const at = p * legs;
            const leg = Math.min(legs - 1, Math.floor(at));
            const local = at - leg;
            const e = local < 0.5 ? 2 * local * local : 1 - ((-2 * local + 2) ** 2) / 2;
            const a = points[leg]!;
            const b = points[leg + 1]!;
            cur = a.map((x, i) => x + (b[i]! - x) * e);
            draw(cur);
            if (p < 1) {
              frame = requestAnimationFrame(step);
              frames.add(frame);
            } else {
              cur = target.slice();
            }
          };
          frame = requestAnimationFrame(step);
          frames.add(frame);
        },
        finish() {
          stop();
          cur = target.slice();
          draw(cur);
        },
        now: () => target.slice(),
      };
      tweens.push(t);
      draw(cur);
      return t;
    };

    params.onScrubStart?.(() => {
      for (const t of tweens) t.finish();
    });

    // ── 선언 트레이
    const trayX: number[] = [];
    {
      const tray = el('text', {
        x: X0, y: TRAY_Y - 8, 'font-family': fonts.body, 'font-size': 11, fill: palette.textMuted,
      });
      tray.textContent = tr('label.declaration', 'declaration order');
      let x = X0;
      for (const f of fields) {
        trayX.push(x);
        el('rect', {
          x, y: TRAY_Y, width: f.size * U, height: BLOCK_H, rx: 3,
          fill: 'none', stroke: palette.border, 'stroke-dasharray': '3 3',
        });
        const type = el('text', {
          x: x + (f.size * U) / 2, y: TRAY_Y + BLOCK_H + 13, 'text-anchor': 'middle',
          'font-family': fonts.mono, 'font-size': 10, fill: palette.textMuted,
        });
        type.textContent = f.ctype;
        x += f.size * U + TRAY_GAP;
      }
    }

    // ── 주소 자
    {
      el('line', { x1: X(0), y1: RULER_Y, x2: X(MAX_BYTES), y2: RULER_Y, stroke: palette.textMuted, 'stroke-width': 1 });
      const head = el('text', {
        x: X0, y: RULER_Y - 22, 'font-family': fonts.body, 'font-size': 11, fill: palette.textMuted,
      });
      head.textContent = tr('label.offset', 'offset (bytes)');
      for (let b = 0; b <= MAX_BYTES; b += 1) {
        const big = b % 8 === 0;
        el('line', {
          x1: X(b), y1: RULER_Y, x2: X(b), y2: RULER_Y + (big ? 8 : 4),
          stroke: palette.textMuted, 'stroke-width': big ? 1.4 : 0.8,
        });
        if (b % 4 === 0) {
          const t = el('text', {
            x: X(b), y: RULER_Y - 6, 'text-anchor': 'middle',
            'font-family': fonts.mono, 'font-size': 10, fill: palette.textMuted,
          });
          t.textContent = String(b);
        }
      }
    }
    const dots: SVGCircleElement[] = [];
    for (let b = 0; b <= MAX_BYTES; b += 1) {
      dots.push(el('circle', {
        cx: X(b), cy: DOT_Y, r: 3, fill: palette.accent, stroke: palette.text,
        'stroke-width': 0.6, visibility: 'hidden',
      }));
    }
    const setAlignMarks = (align: number) => {
      dots.forEach((d, b) => d.setAttribute('visibility', align > 0 && b % align === 0 ? 'visible' : 'hidden'));
    };

    // ── 레일: 빈틈 (놓는 차례마다 하나 + 꼬리)
    const gapLayer = el('g', {});
    type Gap = { g: SVGGElement; tw: Tween };
    const gaps: Gap[] = [];
    for (let slot = 0; slot <= fields.length; slot += 1) {
      const isTail = slot === fields.length;
      const g = el('g', {}, gapLayer);
      const rect = el('rect', {
        y: RAIL_Y + 3, height: BLOCK_H - 6, rx: 2,
        fill: palette.bgSubtle, stroke: palette.textMuted, 'stroke-dasharray': '3 2',
      }, g);
      const label = el('text', {
        y: RAIL_Y + BLOCK_H / 2 + 4, 'text-anchor': 'middle',
        'font-family': fonts.mono, 'font-size': 10, fill: palette.textMuted,
      }, g);
      const tailWord = tr('label.tail', 'tail');
      const tw = tween([X0, 0], ([x, w]) => {
        const width = Math.max(0, w!);
        rect.setAttribute('x', String(x));
        rect.setAttribute('width', String(width));
        g.setAttribute('visibility', width > 0.5 ? 'visible' : 'hidden');
        label.setAttribute('x', String(x! + width / 2));
        const bytes = Math.round(width / U);
        label.textContent = width < 16 ? '' : isTail && width >= 44 ? `${tailWord} ${bytes}` : String(bytes);
      });
      gaps.push({ g, tw });
    }

    // ── 레일: 필드 블록
    const blockLayer = el('g', {});
    type Block = { g: SVGGElement; rect: SVGRectElement; tw: Tween };
    const blocks: Block[] = fields.map((f, i) => {
      const g = el('g', {}, blockLayer);
      const rect = el('rect', {
        x: 0, y: 0, width: f.size * U, height: BLOCK_H, rx: 3,
        fill: hues[i % hues.length]!, stroke: palette.text, 'stroke-width': 1,
      }, g);
      const name = el('text', {
        x: (f.size * U) / 2, y: BLOCK_H / 2 + 5, 'text-anchor': 'middle',
        'font-family': fonts.mono, 'font-size': 13, 'font-weight': 700, fill: palette.stateInk,
      }, g);
      name.textContent = f.name;
      const tw = tween([trayX[i] ?? X0, TRAY_Y], ([x, y]) => {
        g.setAttribute('transform', `translate(${x} ${y})`);
      });
      return { g, rect, tw };
    });
    const setStale = (node: SVGGElement, stale: boolean) => {
      node.setAttribute('opacity', stale ? '0.35' : '1');
    };
    const setMisaligned = (b: Block, on: boolean) => {
      b.rect.setAttribute('stroke', on ? palette.danger : palette.text);
      b.rect.setAttribute('stroke-width', on ? '2.5' : '1');
    };

    // ── 읽기 창
    const winLayer = el('g', { visibility: 'hidden' });
    const winA = el('rect', { y: WIN_Y, height: WIN_H, fill: 'none', stroke: palette.danger, 'stroke-width': 1.5 }, winLayer);
    const winB = el('rect', { y: WIN_Y, height: WIN_H, fill: 'none', stroke: palette.danger, 'stroke-width': 1.5 }, winLayer);
    const winLabel = el('text', {
      y: WIN_Y + WIN_H + 13, 'text-anchor': 'middle',
      'font-family': fonts.body, 'font-size': 11, fill: palette.danger,
    }, winLayer);
    const hideWindows = () => winLayer.setAttribute('visibility', 'hidden');

    // ── 끝 표시: 앞 판의 끝(점선)과 지금의 끝
    const ghost = el('g', { visibility: 'hidden' });
    const ghostLine = el('line', {
      y1: RAIL_Y - 6, y2: BRACKET_Y + 4, stroke: palette.textMuted, 'stroke-width': 1.2, 'stroke-dasharray': '4 3',
    }, ghost);
    const ghostLabel = el('text', {
      y: BRACKET_Y + 32, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': 11, fill: palette.textMuted,
    }, ghost);

    const bracket = el('line', { x1: X0, y1: BRACKET_Y, y2: BRACKET_Y, stroke: palette.text, 'stroke-width': 1.5 });
    el('line', { x1: X0, y1: BRACKET_Y - 4, x2: X0, y2: BRACKET_Y + 4, stroke: palette.text, 'stroke-width': 1.5 });
    const endLine = el('line', { y1: RAIL_Y - 6, y2: BRACKET_Y + 4, stroke: palette.text, 'stroke-width': 2 });
    const endLabel = el('text', {
      y: BRACKET_Y + 18, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': 12,
      'font-weight': 700, fill: palette.text,
    });
    const endTw = tween([X0], ([x]) => {
      bracket.setAttribute('x2', String(x));
      endLine.setAttribute('x1', String(x));
      endLine.setAttribute('x2', String(x));
      endLabel.setAttribute('x', String(x));
      const bytes = Math.round((x! - X0) / U);
      endLabel.textContent = tr('label.end', '{n} bytes', { n: bytes });
    });

    // ── 캡션
    const caption = el('text', {
      x: W / 2, y: CAPTION_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': 12, fill: palette.text,
    });

    const reset = () => {
      blocks.forEach((b, i) => {
        b.tw.to([[trayX[i] ?? X0, TRAY_Y]], 0);
        setStale(b.g, false);
        setMisaligned(b, false);
      });
      for (const gp of gaps) {
        gp.tw.to([[X0, 0]], 0);
        setStale(gp.g, false);
      }
      endTw.to([[X0]], 0);
      ghost.setAttribute('visibility', 'hidden');
      hideWindows();
      setAlignMarks(0);
      caption.textContent = '';
    };

    const stage: StructAlignmentStage & ViewInstance = {
      reset,
      beginLayout(ms) {
        for (const b of blocks) setStale(b.g, true);
        for (const gp of gaps) setStale(gp.g, true);
        hideWindows();
        setAlignMarks(0);
        const was = endTw.now()[0]!;
        const wasBytes = Math.round((was - X0) / U);
        if (wasBytes > 0) {
          ghostLine.setAttribute('x1', String(was));
          ghostLine.setAttribute('x2', String(was));
          ghostLabel.setAttribute('x', String(was));
          ghostLabel.textContent = tr('label.was', 'was {n}', { n: wasBytes });
          ghost.setAttribute('visibility', 'visible');
        }
        endTw.to([[X0]], ms);
      },
      place(a) {
        const b = blocks[a.field];
        const gp = gaps[a.slot];
        if (!b || !gp) return;
        hideWindows();
        setAlignMarks(a.align);
        setStale(b.g, false);
        setMisaligned(b, false);
        blockLayer.appendChild(b.g);
        // 끝까지 와서 내려앉고(from), 정렬 배수 자리까지 밀려난다(offset).
        b.tw.to([[X(a.from), RAIL_Y], [X(a.offset), RAIL_Y]], a.ms);
        setStale(gp.g, false);
        gp.tw.to([[X(a.from), 0]], 0);
        gp.tw.to([[X(a.from), 0], [X(a.from), (a.offset - a.from) * U]], a.ms);
        const cur = endTw.now()[0]!;
        endTw.to([[cur], [X(a.offset + a.size)]], a.ms);
      },
      misalign(field, offset, size) {
        const b = blocks[field];
        if (!b || size <= 0) return;
        setMisaligned(b, true);
        const first = Math.floor(offset / size) * size;
        winA.setAttribute('x', String(X(first)));
        winA.setAttribute('width', String(size * U));
        winB.setAttribute('x', String(X(first + size)));
        winB.setAttribute('width', String(size * U));
        winLabel.setAttribute('x', String(X(first + size)));
        winLabel.textContent = tr('label.reads', 'two reads');
        winLayer.setAttribute('visibility', 'visible');
      },
      tail(a) {
        const gp = gaps[fields.length];
        if (!gp) return;
        hideWindows();
        setAlignMarks(a.structAlign);
        setStale(gp.g, false);
        gp.tw.to([[X(a.from), 0]], 0);
        gp.tw.to([[X(a.from), (a.size - a.from) * U]], a.ms);
        endTw.to([[X(a.size)]], a.ms);
      },
      setCaption(text) {
        caption.textContent = text;
      },
      destroy() {
        destroyed = true;
        if (typeof cancelAnimationFrame === 'function') for (const f of frames) cancelAnimationFrame(f);
        frames.clear();
        root.remove();
      },
    };
    reset();
    return stage;
  },
};
