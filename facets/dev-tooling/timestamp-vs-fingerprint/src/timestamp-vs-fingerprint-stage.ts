/**
 * timestamp-vs-fingerprint 의 stage — 같은 저장 하나가 두 판정으로 갈라진다.
 *
 * 위 가운데에 저장 하나가 있고, 그것이 둘로 나뉘어 왼쪽(시각으로 판정)과 오른쪽(지문으로 판정)의
 * 같은 소스에 내려앉는다. 대상을 볼 때마다 두 쪽 모두 입력의 값(시각 · 지문)이 선을 타고 대상으로
 * 올라간다. 시각 쪽은 늦은 시각이 대상에 닿으면 대상이 다시 세워지고 그 선이 켜져 위로 넘어가고,
 * 지문 쪽은 같은 지문이 닿아 선이 막힌다.
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
import { depthOf, formatTime, shortPrint } from './algorithm.js';
import type { JudgeStep, TimestampVsFingerprintScene } from './scene.js';

const H = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가운데 틈 */
const GAP = 24;
/** 상자 가로 상한 */
const BOX_W_MAX = 112;
const BOX_H = 40;
const CHIP_H = 16;
const CHIP_W = 48;
/** 올라가는 값이 대상 쪽 끝에서 얼마만큼 떨어져 내려앉는가 (선 길이의 비) */
const LAND_AT = 0.42;

const SAVE_Y = 26;
const HEAD_Y = 66;
const ROW_TOP = 118;
const ROW_BOTTOM = 290;
const TALLY_Y = 352;
const CAPTION_Y = 384;

const FLY_MS = 700;
const FRAME_MS = 16;

type Side = 'time' | 'print';
type Pt = { x: number; y: number };

function rnd(v: number): number {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? 0 : r;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function lerp(a: Pt, b: Pt, k: number): Pt {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

export const timestampVsFingerprintStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const smPx = parseFloat(fontSizes.sm);

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
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(rnd(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function text(
      parent: Element,
      x: number,
      y: number,
      body: string,
      opts: { size: string; fill: string; mono?: boolean; weight?: number; anchor?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'text-anchor': opts.anchor ?? 'middle',
          'dominant-baseline': 'middle',
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size,
          'font-weight': opts.weight ?? 400,
          fill: opts.fill,
        },
        parent,
      );
      node.textContent = body;
      return node;
    }

    // ── 자리 셈 ────────────────────────────────────────────────
    const W = PIECE_CANVAS_W;
    const panelW = (W - GAP) / 2;
    const panelX: Record<Side, number> = { time: 0, print: panelW + GAP };

    type Geo = { pos: Map<string, Pt>; boxW: number };

    function geometry(scene: TimestampVsFingerprintScene): Geo {
      const depth = depthOf(scene.rules, scene.sources);
      const names = [...scene.sources.map((s) => s.name), ...scene.rules.map((r) => r.target)];
      let maxDepth = 0;
      for (const d of depth.values()) maxDepth = Math.max(maxDepth, d);
      const rows: string[][] = Array.from({ length: maxDepth + 1 }, () => []);
      for (const n of names) {
        const d = depth.get(n);
        if (d === undefined) throw new Error(`깊이가 없다: ${n}`);
        rows[d].push(n);
      }
      const widest = Math.max(...rows.map((r) => r.length));
      const boxW = Math.min(BOX_W_MAX, panelW / widest - 20);
      const pitch = maxDepth === 0 ? 0 : (ROW_BOTTOM - ROW_TOP) / maxDepth;
      const pos = new Map<string, Pt>();
      rows.forEach((row, d) => {
        row.forEach((n, i) => {
          pos.set(n, { x: (panelW * (i + 0.5)) / row.length, y: ROW_BOTTOM - d * pitch });
        });
      });
      return { pos, boxW };
    }

    function at(geo: Geo, side: Side, name: string): Pt {
      const p = geo.pos.get(name);
      if (!p) throw new Error(`자리가 없다: ${name}`);
      return { x: panelX[side] + p.x, y: p.y };
    }

    /** 대상 상자의 아래 끝에서 입력 상자의 위 끝까지 */
    function edge(geo: Geo, side: Side, target: string, input: string): { from: Pt; to: Pt } {
      const a = at(geo, side, input);
      const b = at(geo, side, target);
      return { from: { x: a.x, y: a.y - BOX_H / 2 }, to: { x: b.x, y: b.y + BOX_H / 2 } };
    }

    function landing(geo: Geo, side: Side, target: string, input: string): Pt {
      const e = edge(geo, side, target, input);
      return lerp(e.to, e.from, LAND_AT);
    }

    // ── 장면에서 읽는 값 ──────────────────────────────────────
    function timeOf(scene: TimestampVsFingerprintScene, name: string, pending: boolean): number {
      const s = scene.step;
      if (pending && s) {
        if (s.kind === 'save' && s.file === name) return s.was;
        if (s.kind === 'judge' && s.target === name) return s.time.targetWas;
      }
      const f = scene.times.find((x) => x.name === name);
      if (!f) throw new Error(`시각이 없다: ${name}`);
      return f.at;
    }

    function printOf(scene: TimestampVsFingerprintScene, name: string, pending: boolean): string {
      const s = scene.step;
      if (pending && s && s.kind === 'save' && s.file === name) return s.printWas;
      const f = scene.prints.find((x) => x.name === name);
      if (!f) throw new Error(`지문이 없다: ${name}`);
      return f.print;
    }

    function judgedOf(scene: TimestampVsFingerprintScene, pending: boolean) {
      const s = scene.step;
      if (pending && s && s.kind === 'judge') return scene.judged.filter((j) => j.target !== s.target);
      return scene.judged;
    }

    function chip(parent: Element, p: Pt, body: string): SVGGElement {
      const g = el('g', { transform: `translate(${rnd(p.x)},${rnd(p.y)})` }, parent);
      el(
        'rect',
        { x: -CHIP_W / 2, y: -CHIP_H / 2, width: CHIP_W, height: CHIP_H, rx: 3, fill: colors.primary },
        g,
      );
      text(g, 0, 0, body, { size: fontSizes.xs, fill: colors.textInverse, mono: true });
      return g;
    }

    // ── 정적 그리기 ──────────────────────────────────────────
    /** pending 이면 이번 걸음의 결과를 아직 얹지 않는다 (운동이 그 자리로 가는 중) */
    function drawStatic(scene: TimestampVsFingerprintScene, pending: boolean): Geo {
      svg.textContent = '';
      const geo = geometry(scene);
      const root = el('g', {}, svg);
      const step = scene.step;
      const judged = judgedOf(scene, pending);
      const targets = new Set(scene.rules.map((r) => r.target));

      // 가운데 가름선
      el(
        'line',
        { x1: W / 2, y1: HEAD_Y - 12, x2: W / 2, y2: TALLY_Y + 10, stroke: colors.border, 'stroke-width': 1 },
        root,
      );

      // 저장 — 두 쪽이 함께 받은 사건 하나
      if (scene.saved) {
        const label = t('label.saveChip', 'Saved again: {file} {at}', {
          file: scene.saved.file,
          at: formatTime(scene.saved.at),
        });
        const w = Math.min(W - 40, label.length * smPx * 0.62 + 28);
        el(
          'rect',
          { x: W / 2 - w / 2, y: SAVE_Y - 12, width: w, height: 24, rx: 12, fill: colors.accent },
          root,
        );
        text(root, W / 2, SAVE_Y, label, { size: fontSizes.sm, fill: colors.stateInk, mono: true, weight: 600 });
      }

      const heads: Record<Side, string> = {
        time: t('label.byTime', 'Judged by time'),
        print: t('label.byPrint', 'Judged by fingerprint'),
      };

      for (const side of ['time', 'print'] as const) {
        const px = panelX[side];
        text(root, px + panelW / 2, HEAD_Y, heads[side], {
          size: fontSizes.md,
          fill: colors.text,
          weight: 600,
        });

        // 선
        for (const rule of scene.rules) {
          const v = judged.find((j) => j.target === rule.target);
          for (const input of rule.inputs) {
            const e = edge(geo, side, rule.target, input);
            let lit = false;
            if (v && side === 'time' && v.timeRebuilt) {
              lit = v.timeLater.includes(input);
            }
            if (v && side === 'print' && v.printRebuilt) lit = true;
            el(
              'line',
              {
                x1: e.from.x,
                y1: e.from.y,
                x2: e.to.x,
                y2: e.to.y,
                stroke: lit ? colors.itemActive : colors.border,
                'stroke-width': lit ? 3 : 1.5,
              },
              root,
            );
            const stopped = v && !(side === 'time' ? v.timeRebuilt : v.printRebuilt);
            if (stopped) {
              // 막힘 — 대상 바로 아래에서 선을 가로지르는 막대
              const m = lerp(e.to, e.from, 0.16);
              const dx = e.from.x - e.to.x;
              const dy = e.from.y - e.to.y;
              const len = Math.hypot(dx, dy);
              const nx = (-dy / len) * 9;
              const ny = (dx / len) * 9;
              el(
                'line',
                {
                  x1: m.x - nx,
                  y1: m.y - ny,
                  x2: m.x + nx,
                  y2: m.y + ny,
                  stroke: colors.textMuted,
                  'stroke-width': 3,
                  'stroke-linecap': 'round',
                },
                root,
              );
            }
          }
        }

        // 상자
        for (const name of [...scene.sources.map((s) => s.name), ...scene.rules.map((r) => r.target)]) {
          const p = at(geo, side, name);
          const v = judged.find((j) => j.target === name);
          const rebuilt = v ? (side === 'time' ? v.timeRebuilt : v.printRebuilt) : false;
          const current =
            !!step &&
            ((step.kind === 'judge' && step.target === name) || (step.kind === 'save' && step.file === name));
          el(
            'rect',
            {
              x: p.x - geo.boxW / 2,
              y: p.y - BOX_H / 2,
              width: geo.boxW,
              height: BOX_H,
              rx: 5,
              fill: rebuilt ? colors.itemActive : colors.bg,
              stroke: current ? colors.primary : colors.border,
              'stroke-width': current ? 2.5 : 1.5,
            },
            root,
          );
          const ink = rebuilt ? colors.stateInk : colors.text;
          const muted = rebuilt ? colors.stateInk : colors.textMuted;
          let value: string | null = null;
          let valueInk = ink;
          let valueMono = true;
          if (side === 'time') {
            value = formatTime(timeOf(scene, name, pending));
          } else if (!targets.has(name)) {
            value = shortPrint(printOf(scene, name, pending));
          } else {
            const kept = scene.recorded.filter((r) => r.target === name);
            if (kept.length > 0) {
              value = t('label.recorded', 'kept {print}', {
                print: kept.map((r) => shortPrint(r.print)).join(' '),
              });
              valueInk = muted;
              valueMono = false;
            }
          }
          text(root, p.x, value === null ? p.y : p.y - 8, name, {
            size: fontSizes.sm,
            fill: ink,
            mono: true,
            weight: 600,
          });
          if (value !== null) text(root, p.x, p.y + 9, value, {
              size: fontSizes.xs,
              fill: valueInk,
              mono: valueMono,
            });
        }

        // 지문 쪽 소스의 내용 — 지문이 여기서 나온다
        if (side === 'print') {
          for (const s of scene.sources) {
            const p = at(geo, side, s.name);
            text(root, p.x, p.y + BOX_H / 2 + 14, s.content, {
              size: fontSizes.xs,
              fill: colors.textMuted,
              mono: true,
            });
          }
        }

        // 이번 판정 — 올라온 값과 견줌
        if (step && step.kind === 'judge' && !pending) drawJudge(root, geo, side, scene, step);

        // 다시 세운 수
        const n = judged.filter((j) => (side === 'time' ? j.timeRebuilt : j.printRebuilt)).length;
        text(root, px + panelW / 2, TALLY_Y, t('label.rebuilt', 'Rebuilt: {n}', { n }), {
          size: fontSizes.md,
          fill: colors.text,
          weight: 600,
        });
      }

      text(root, W / 2, CAPTION_Y, caption(scene), { size: fontSizes.sm, fill: colors.text });
      return geo;
    }

    function inputValue(side: Side, step: JudgeStep, input: string): string | null {
      if (side === 'time') {
        const i = step.time.inputs.find((x) => x.name === input);
        if (!i) throw new Error(`입력 시각이 없다: ${input}`);
        return formatTime(i.at);
      }
      const s = step.print.sources.find((x) => x.name === input);
      return s ? shortPrint(s.now) : null;
    }

    function drawJudge(
      root: Element,
      geo: Geo,
      side: Side,
      scene: TimestampVsFingerprintScene,
      step: JudgeStep,
    ): void {
      const rule = scene.rules.find((r) => r.target === step.target);
      if (!rule) throw new Error(`규칙이 없다: ${step.target}`);
      for (const input of rule.inputs) {
        const v = inputValue(side, step, input);
        if (v !== null) chip(root, landing(geo, side, step.target, input), v);
      }
      const p = at(geo, side, step.target);
      text(root, p.x, p.y - BOX_H / 2 - 10, comparison(side, step), {
        size: fontSizes.xs,
        fill: colors.text,
        mono: true,
        weight: 600,
      });
    }

    function comparison(side: Side, step: JudgeStep): string {
      if (side === 'time') {
        const tw = formatTime(step.time.targetWas);
        if (step.time.rebuilt) {
          const later = step.time.inputs.filter((i) => step.time.later.includes(i.name));
          const a = Math.max(...later.map((i) => i.at));
          return t('cmp.later', '{a} > {b}', { a: formatTime(a), b: tw });
        }
        const a = Math.max(...step.time.inputs.map((i) => i.at));
        return t('cmp.notLater', '{a} ≤ {b}', { a: formatTime(a), b: tw });
      }
      if (step.print.sources.length > 0) {
        return step.print.sources
          .map((s) =>
            s.now === s.recorded
              ? t('cmp.same', '{a} = {b}', { a: shortPrint(s.now), b: shortPrint(s.recorded) })
              : t('cmp.differ', '{a} ≠ {b}', { a: shortPrint(s.now), b: shortPrint(s.recorded) }),
          )
          .join('  ');
      }
      if (step.print.changed.length > 0) {
        return t('cmp.inputRebuilt', 'Rebuilt input: {name}', { name: step.print.changed.join(' ') });
      }
      return t('cmp.noneRebuilt', 'No input rebuilt');
    }

    function caption(scene: TimestampVsFingerprintScene): string {
      const s = scene.step;
      if (!s) return t('caption.start', 'After the last build: file times and kept fingerprints.');
      if (s.kind === 'save') {
        const vars = {
          was: formatTime(s.was),
          at: formatTime(s.at),
          printWas: shortPrint(s.printWas),
          printNow: shortPrint(s.printNow),
        };
        return s.printWas === s.printNow
          ? t('caption.saveSame', 'Saved again, same content — time {was} → {at} · fingerprint {printWas} → {printNow}', vars)
          : t('caption.saveChanged', 'Saved with new content — time {was} → {at} · fingerprint {printWas} → {printNow}', vars);
      }
      const verdict = (rebuilt: boolean): string =>
        rebuilt ? t('verdict.rebuild', 'rebuild') : t('verdict.keep', 'keep');
      return t('caption.judge', 'Checking {target} — time: {time} · fingerprint: {print}', {
        target: s.target,
        time: verdict(s.time.rebuilt),
        print: verdict(s.print.rebuilt),
      });
    }

    // ── 운동 ─────────────────────────────────────────────────
    function sleepFrame(): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    async function tween(mine: number, ms: number, draw: (k: number) => void): Promise<boolean> {
      const start = Date.now();
      for (;;) {
        if (destroyed || mine !== gen) return false;
        const k = Math.min(1, (Date.now() - start) / ms);
        draw(ease(k));
        if (k >= 1) return true;
        await sleepFrame();
      }
    }

    async function flySave(mine: number, scene: TimestampVsFingerprintScene): Promise<boolean> {
      const s = scene.step;
      if (!s || s.kind !== 'save') return true;
      const geo = drawStatic(scene, true);
      const fly = el('g', {}, svg);
      const from: Pt = { x: W / 2, y: SAVE_Y };
      const legs = (['time', 'print'] as const).map((side) => {
        const to = at(geo, side, s.file);
        const body = side === 'time' ? formatTime(s.at) : shortPrint(s.printNow);
        return { from, to, g: chip(fly, from, body) };
      });
      return tween(mine, FLY_MS, (k) => {
        for (const leg of legs) {
          const p = lerp(leg.from, leg.to, k);
          leg.g.setAttribute('transform', `translate(${rnd(p.x)},${rnd(p.y)})`);
        }
      });
    }

    async function flyJudge(mine: number, scene: TimestampVsFingerprintScene): Promise<boolean> {
      const s = scene.step;
      if (!s || s.kind !== 'judge') return true;
      const rule = scene.rules.find((r) => r.target === s.target);
      if (!rule) throw new Error(`규칙이 없다: ${s.target}`);
      const geo = drawStatic(scene, true);
      const fly = el('g', {}, svg);
      const later = s.time.later;
      const legs: { from: Pt; to: Pt; g: SVGGElement; trail: SVGLineElement | null }[] = [];
      for (const side of ['time', 'print'] as const) {
        for (const input of rule.inputs) {
          const body = inputValue(side, s, input);
          if (body === null) continue;
          const e = edge(geo, side, s.target, input);
          const to = landing(geo, side, s.target, input);
          const lit = side === 'time' ? later.includes(input) : s.print.rebuilt;
          const trail = lit
            ? el(
                'line',
                {
                  x1: e.from.x,
                  y1: e.from.y,
                  x2: e.from.x,
                  y2: e.from.y,
                  stroke: colors.itemActive,
                  'stroke-width': 3,
                },
                fly,
              )
            : null;
          legs.push({ from: e.from, to, g: chip(fly, e.from, body), trail });
        }
      }
      return tween(mine, FLY_MS, (k) => {
        for (const leg of legs) {
          const p = lerp(leg.from, leg.to, k);
          leg.g.setAttribute('transform', `translate(${rnd(p.x)},${rnd(p.y)})`);
          if (leg.trail) {
            leg.trail.setAttribute('x2', String(rnd(p.x)));
            leg.trail.setAttribute('y2', String(rnd(p.y)));
          }
        }
      });
    }

    return {
      async render(
        next: TimestampVsFingerprintScene,
        prev: TimestampVsFingerprintScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const moved = prev !== null && next.step !== null && next.step !== prev.step;
        if (!opts.animate || !moved) {
          drawStatic(next, false);
          return;
        }
        const ok = next.step?.kind === 'save' ? await flySave(mine, next) : await flyJudge(mine, next);
        if (!ok || destroyed || mine !== gen) return;
        drawStatic(next, false);
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
