/**
 * mix-and-cannot-unmix 무대 — 사다리 둘.
 *
 * 왼쪽은 섞지 않은 값 g^k, 오른쪽은 섞은 값 g^k mod p. 칸은 둘 다 작은 값이 아래다.
 * 지수를 하나 올릴 때마다 두 쪽의 공이 새 칸으로 **뛴다** — 오르면 오른쪽으로, 내리면
 * 왼쪽으로 활을 그린다. 섞지 않은 쪽은 늘 한 칸 위로 짧게 뛰고, 섞은 쪽은 위아래로
 * 멀리 튄다. 칸 옆 동그라미에 그 칸에 닿은 지수가 찍힌다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { Direction } from './algorithm.js';
import type { MixScene, MixVisit } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 432;
const W = PIECE_CANVAS_W;

const HEADER_Y = 24;
const TITLE_Y = 58;
const FORMULA_Y = 76;
const ZONE_Y = 104;
const RUNG_TOP = 128;
const RUNG_BOTTOM = 344;
const CAPTION_Y = [374, 396, 418] as const;

const JUMP_MS = 300;
const TICK_MS = 16;
const BALL_R = 7;
const STAMP_R = 10;

type SideKey = 'plain' | 'mixed';

type SideGeom = {
  key: SideKey;
  x0: number;
  w: number;
  cx: number;
  bulgeMax: number;
  labelX: number;
  stampX: number;
  rungs: number[];
  color: string;
};

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

function valueOf(v: MixVisit, key: SideKey): number {
  return key === 'plain' ? v.plain : v.mixed;
}

function dirOf(v: MixVisit, key: SideKey): Direction {
  return key === 'plain' ? v.plainDir : v.mixedDir;
}

function rungIndex(side: SideGeom, value: number): number {
  const i = side.rungs.indexOf(value);
  if (i < 0) throw new Error(`mix-and-cannot-unmix-stage: ${side.key} 값 ${value} 의 칸이 없다`);
  return i;
}

function rungY(side: SideGeom, idx: number): number {
  const n = side.rungs.length;
  if (n < 2) throw new Error(`mix-and-cannot-unmix-stage: ${side.key} 칸이 둘보다 적다`);
  const gap = (RUNG_BOTTOM - RUNG_TOP) / (n - 1);
  return RUNG_BOTTOM - idx * gap;
}

/** 두 칸 사이 활 — 오르면 오른쪽, 내리면 왼쪽으로 부푼다. 끝점과 조절점을 돌려준다. */
function arcOf(side: SideGeom, fromY: number, toY: number, d: Direction) {
  if (d === 'none') throw new Error('mix-and-cannot-unmix-stage: 방향 없는 걸음에는 활이 없다');
  const sign = d === 'up' ? 1 : -1;
  const bulge = Math.min(side.bulgeMax, 14 + Math.abs(toY - fromY) * 0.25);
  // 이차 곡선의 최대 벌어짐은 조절점 벌어짐의 절반이다
  return {
    x0: side.cx,
    y0: fromY,
    cx: side.cx + sign * bulge * 2,
    cy: (fromY + toY) / 2,
    x1: side.cx,
    y1: toY,
  };
}

/** [0, t] 만큼 자른 이차 곡선 (de Casteljau). */
function partialArc(a: ReturnType<typeof arcOf>, t: number) {
  const qx = a.x0 + (a.cx - a.x0) * t;
  const qy = a.y0 + (a.cy - a.y0) * t;
  const u = 1 - t;
  const ex = u * u * a.x0 + 2 * u * t * a.cx + t * t * a.x1;
  const ey = u * u * a.y0 + 2 * u * t * a.cy + t * t * a.y1;
  return { qx, qy, ex, ey };
}

export const mixAndCannotUnmixStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    const margin = W * 0.03;
    const gutter = W * 0.035;
    const panelW = (W - margin * 2 - gutter) / 2;

    function geom(key: SideKey, x0: number, rungs: number[], color: string): SideGeom {
      const cx = x0 + panelW * 0.46;
      const bulgeMax = panelW * 0.24;
      return {
        key,
        x0,
        w: panelW,
        cx,
        bulgeMax,
        labelX: cx - bulgeMax - 12,
        stampX: cx + bulgeMax + 26,
        rungs,
        color,
      };
    }

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function write(
      parent: Element,
      x: number,
      y: number,
      body: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'middle',
        'dominant-baseline': 'central',
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        'font-weight': opts.weight ?? 'normal',
        fill: opts.fill ?? colors.text,
      });
      node.textContent = body;
      return node;
    }

    /** 장면 하나를 통째로 세운다. progress 는 이번 걸음 뜀의 진행 (1 이면 멈춘 화면). */
    function draw(scene: MixScene, progress: number): void {
      svg.textContent = '';
      const root = el(svg, 'g', {});
      const { p, g } = scene.given;

      const plainX = margin;
      const mixedX = margin + panelW + gutter;

      // 칸 목록이 오기 전(silent init 앞)에는 제목만 둔다
      const titles: Array<[number, string, string]> = [
        [plainX, t('label.plain', 'Unmixed value'), t('formula.plain', '{g}^k', { g })],
        [mixedX, t('label.mixed', 'Mixed value'), t('formula.mixed', '{g}^k mod {p}', { g, p })],
      ];
      for (const [x0, name, formula] of titles) {
        write(root, x0 + panelW / 2, TITLE_Y, name, { size: fontSizes.md, weight: '600' });
        write(root, x0 + panelW / 2, FORMULA_Y, formula, { fill: colors.textMuted, mono: true });
      }

      const base = scene.derived;
      if (base === null) return;
      const A = base.A;

      const sides: SideGeom[] = [
        geom('plain', plainX, base.plainRungs, colors.primary),
        geom('mixed', mixedX, base.mixedSlots, colors.itemComparing),
      ];

      const trail = scene.trail;
      const moving = scene.step !== null && progress < 1;
      const settled = moving ? trail.slice(0, -1) : trail;
      const metVisit = settled.find((v) => v.met) ?? null;
      // 오름 · 내림 누계는 알고리즘이 셈해 보낸 값 — 멈춘 마지막 걸음의 것, 없으면 걸음 0 의 것
      const lastSettled = settled[settled.length - 1];
      const upTally = lastSettled ? lastSettled.ups : base.startUps;
      const downTally = lastSettled ? lastSettled.downs : base.startDowns;

      // 머리줄 — 공개값 A 와 숨긴 지수 a
      write(root, margin, HEADER_Y, t('label.public', 'Public: A = {g}^a mod {p} = {A}', { g, p, A }), {
        anchor: 'start',
        weight: '600',
      });
      if (metVisit) {
        write(root, W - margin, HEADER_Y, t('label.found', 'Exponent that met A: {k}', { k: metVisit.k }), {
          anchor: 'end',
          weight: '600',
        });
      } else {
        write(root, W - margin, HEADER_Y, t('label.hidden', 'Hidden: a'), {
          anchor: 'end',
          fill: colors.textMuted,
        });
      }

      const summary = scene.summary !== null && !moving ? scene.summary : null;

      for (const side of sides) {
        const layer = el(root, 'g', {});

        // 오름 · 내림 칸 머리 — 지금까지 선 방향의 수
        const ups = upTally[side.key];
        const downs = downTally[side.key];
        write(layer, side.cx - side.bulgeMax / 2 - 6, ZONE_Y, t('label.down', 'Down {n}', { n: downs }), {
          fill: colors.textMuted,
        });
        write(layer, side.cx + side.bulgeMax / 2 + 6, ZONE_Y, t('label.up', 'Up {n}', { n: ups }), {
          fill: colors.textMuted,
        });
        write(layer, side.stampX, ZONE_Y, t('label.exponent', 'Exponent'), { fill: colors.textMuted });

        // 칸 — 값 글자와 가로 막대
        const reached = new Map<number, number>();
        for (const v of settled) reached.set(valueOf(v, side.key), v.k);

        side.rungs.forEach((value, idx) => {
          const y = rungY(side, idx);
          const hit = reached.has(value);
          const isA = side.key === 'mixed' && value === A;
          el(layer, 'line', {
            x1: side.cx - 20,
            x2: side.cx + 20,
            y1: y,
            y2: y,
            stroke: hit ? side.color : colors.border,
            'stroke-width': hit ? 2 : 1,
            'stroke-linecap': 'round',
          });
          if (isA) {
            const bw = 34;
            el(layer, 'rect', {
              x: side.labelX - bw + 6,
              y: y - 9,
              width: bw,
              height: 18,
              rx: 4,
              fill: colors.accent,
            });
            write(layer, side.labelX - bw - 4, y, 'A', { anchor: 'end', weight: '700' });
          }
          write(layer, side.labelX, y, String(value), {
            anchor: 'end',
            mono: true,
            fill: isA ? colors.stateInk : hit ? colors.text : colors.textMuted,
            weight: isA ? '700' : 'normal',
          });

          // 지수 도장
          const k = reached.get(value);
          const accentStamp =
            (isA && k !== undefined) ||
            (summary !== null && side.key === 'plain' && value === summary.plainAtMet);
          if (k !== undefined) {
            el(layer, 'circle', {
              cx: side.stampX,
              cy: y,
              r: STAMP_R,
              fill: accentStamp ? colors.accent : colors.bgSubtle,
              stroke: accentStamp ? colors.stateInk : side.color,
              'stroke-width': accentStamp ? 1.5 : 1,
            });
            write(layer, side.stampX, y, String(k), {
              mono: true,
              fill: accentStamp ? colors.stateInk : colors.text,
              weight: accentStamp ? '700' : 'normal',
            });
          } else if (isA) {
            el(layer, 'circle', {
              cx: side.stampX,
              cy: y,
              r: STAMP_R,
              fill: 'none',
              stroke: colors.textMuted,
              'stroke-dasharray': '3 3',
            });
            write(layer, side.stampX, y, '?', { fill: colors.textMuted });
          }
        });

        // 지나간 뜀의 활
        const path = (d: string, current: boolean) =>
          el(layer, 'path', {
            d,
            fill: 'none',
            stroke: side.color,
            'stroke-width': current ? 2 : 1.25,
            'stroke-opacity': current ? 1 : 0.4,
            'stroke-linecap': 'round',
          });
        for (let i = 1; i < trail.length; i += 1) {
          const v = trail[i]!;
          const before = trail[i - 1]!;
          const last = i === trail.length - 1 && scene.step !== null;
          const fromY = rungY(side, rungIndex(side, valueOf(before, side.key)));
          const toY = rungY(side, rungIndex(side, valueOf(v, side.key)));
          const arc = arcOf(side, fromY, toY, dirOf(v, side.key));
          if (last && moving) {
            const cut = partialArc(arc, progress);
            path(
              `M ${round(arc.x0)} ${round(arc.y0)} Q ${round(cut.qx)} ${round(cut.qy)} ${round(cut.ex)} ${round(cut.ey)}`,
              true,
            );
          } else {
            path(
              `M ${round(arc.x0)} ${round(arc.y0)} Q ${round(arc.cx)} ${round(arc.cy)} ${round(arc.x1)} ${round(arc.y1)}`,
              last,
            );
          }
        }

        // 공 — 이번 지수의 칸에 선다 (뛰는 중이면 활 위 그 자리)
        const cur = trail[trail.length - 1];
        if (cur !== undefined) {
          const toY = rungY(side, rungIndex(side, valueOf(cur, side.key)));
          let bx = side.cx;
          let by = toY;
          let r = BALL_R;
          if (moving) {
            const before = trail[trail.length - 2];
            if (before === undefined) {
              // 첫 지수 — 앞 칸이 없어 제자리에서 자라난다
              r = BALL_R * progress;
            } else {
              const fromY = rungY(side, rungIndex(side, valueOf(before, side.key)));
              const cut = partialArc(arcOf(side, fromY, toY, dirOf(cur, side.key)), progress);
              bx = cut.ex;
              by = cut.ey;
            }
          }
          el(layer, 'circle', { cx: bx, cy: by, r, fill: side.color, stroke: colors.bg, 'stroke-width': 1.5 });
        }
      }

      // 캡션 — 지금 걸음이 말하는 것
      const lines: string[] = [];
      const now = trail[trail.length - 1];
      if (now === undefined) {
        lines.push(t('caption.start', 'Only A is public. Both sides raise the exponent one at a time.'));
      } else {
        if (now.plainDir === 'down') {
          throw new Error('mix-and-cannot-unmix-stage: 섞지 않은 값이 내렸다 — g 가 1 보다 커야 한다');
        }
        const vars = { k: now.k, plain: now.plain, mixed: now.mixed };
        if (now.mixedDir === 'none') {
          lines.push(t('caption.first', 'Exponent {k}: unmixed {plain} · mixed {mixed}', vars));
        } else if (now.mixedDir === 'up') {
          lines.push(t('caption.up', 'Exponent {k}: unmixed up → {plain} · mixed up → {mixed}', vars));
        } else {
          lines.push(t('caption.down', 'Exponent {k}: unmixed up → {plain} · mixed down → {mixed}', vars));
        }
        if (now.met && !moving) {
          lines.push(t('caption.met', 'Mixed equals A here — exponent {k}', { k: now.k }));
        }
        if (summary !== null) {
          lines.push(
            t('caption.rankMixed', 'Among mixed values, A {A}: rank {rank} from smallest (of {count}) · exponent {k}', {
              A,
              rank: summary.rankA,
              count: summary.count,
              k: summary.metK,
            }),
          );
          lines.push(
            t('caption.rankPlain', 'Among unmixed values, {value}: rank {rank} from smallest (of {count}) · exponent {k}', {
              value: summary.plainAtMet,
              rank: summary.plainRank,
              count: summary.count,
              k: summary.metK,
            }),
          );
        }
      }
      if (lines.length > CAPTION_Y.length) {
        throw new Error('mix-and-cannot-unmix-stage: 캡션 줄이 자리보다 많다');
      }
      lines.forEach((line, i) => {
        write(root, W / 2, CAPTION_Y[i]!, line, { fill: i === 0 ? colors.text : colors.textMuted });
      });
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = () => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    async function jump(scene: MixScene, mine: number): Promise<void> {
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const raw = Math.min(1, (Date.now() - start) / JUMP_MS);
        if (raw >= 1) break;
        draw(scene, ease(raw));
        await wait(TICK_MS);
      }
      if (mine !== gen || destroyed) return;
      draw(scene, 1);
    }

    return {
      render(next: MixScene, _prev: MixScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return Promise.resolve();
        if (!opts.animate || next.step === null) {
          draw(next, 1);
          return Promise.resolve();
        }
        return jump(next, mine);
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
