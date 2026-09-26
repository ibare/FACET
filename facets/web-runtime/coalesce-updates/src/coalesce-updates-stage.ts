import type {
  CanvasView,
  Palette,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { CoalesceUpdatesScene, CoalesceUpdatesWriteName } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = PIECE_CANVAS_W;
const H = 530;
const MOVE_MS = 550;

const SLOT_NAMES: CoalesceUpdatesWriteName[] = ['left', 'top'];
const SLOT_COLOR = categorical(2, 'vivid');

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

function text(
  x: number,
  y: number,
  s: string,
  opts: {
    color: string;
    size?: string;
    anchor?: 'start' | 'middle' | 'end';
    family?: string;
    weight?: string;
  },
): SVGTextElement {
  const t = el('text');
  t.setAttribute('x', String(x));
  t.setAttribute('y', String(y));
  t.setAttribute('font-size', opts.size ?? fontSizes.sm);
  t.setAttribute('font-family', opts.family ?? fonts.body);
  t.setAttribute('fill', opts.color);
  t.setAttribute('text-anchor', opts.anchor ?? 'start');
  if (opts.weight) t.setAttribute('font-weight', opts.weight);
  t.textContent = s;
  return t;
}

function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill?: string; stroke?: string; strokeWidth?: number; rx?: number } = {},
): SVGRectElement {
  const r = el('rect');
  r.setAttribute('x', String(x));
  r.setAttribute('y', String(y));
  r.setAttribute('width', String(w));
  r.setAttribute('height', String(h));
  r.setAttribute('fill', opts.fill ?? 'none');
  if (opts.stroke) r.setAttribute('stroke', opts.stroke);
  if (opts.strokeWidth) r.setAttribute('stroke-width', String(opts.strokeWidth));
  if (opts.rx) r.setAttribute('rx', String(opts.rx));
  return r;
}

interface RawInitialData {
  code?: unknown;
  initial?: unknown;
  writes?: unknown;
}

function readMaxes(initialData: Record<string, unknown> | undefined): {
  maxLeft: number;
  maxTop: number;
  writeCount: number;
} {
  const raw = (initialData ?? {}) as RawInitialData;
  const seedLeft: number[] = [];
  const seedTop: number[] = [];
  const writeCount = Array.isArray(raw.writes) ? raw.writes.length : 0;
  const initial = raw.initial;
  if (
    typeof initial === 'object' &&
    initial !== null &&
    'left' in initial &&
    'top' in initial &&
    typeof (initial as { left: unknown }).left === 'number' &&
    typeof (initial as { top: unknown }).top === 'number'
  ) {
    seedLeft.push((initial as { left: number }).left);
    seedTop.push((initial as { top: number }).top);
  }
  if (Array.isArray(raw.writes)) {
    for (const w of raw.writes) {
      if (
        typeof w === 'object' &&
        w !== null &&
        'name' in w &&
        'value' in w &&
        typeof (w as { value: unknown }).value === 'number'
      ) {
        const name = (w as { name: unknown }).name;
        const value = (w as { value: number }).value;
        if (name === 'left') seedLeft.push(value);
        if (name === 'top') seedTop.push(value);
      }
    }
  }
  return {
    maxLeft: Math.max(1, ...seedLeft),
    maxTop: Math.max(1, ...seedTop),
    writeCount,
  };
}

/** 조각은 코드 패널이 없다는 계약과 무관 — 이것은 화면에 그려지는 pseudo-notation 자료일 뿐이다. */
function readCode(initialData: Record<string, unknown> | undefined): string[] {
  const raw = (initialData ?? {}) as RawInitialData;
  if (Array.isArray(raw.code) && raw.code.every((c) => typeof c === 'string')) {
    return raw.code as string[];
  }
  return [];
}

export const coalesceUpdatesStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const { maxLeft, maxTop, writeCount } = readMaxes(params.initialData);
    const baseCode = readCode(params.initialData);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // ── 레이아웃 ──────────────────────────────────────────────────────
    const PAD_X = 40;
    const CODE_Y = 20;
    const LINE_H = 28;
    const CODE_H = baseCode.length * LINE_H + 20;
    const PENDING_Y = CODE_Y + CODE_H + 34;
    const SLOT_W = 150;
    const SLOT_H = 56;
    const SLOT_GAP = 40;
    const slotsTotalW = SLOT_W * 2 + SLOT_GAP;
    const SLOT_X0 = (W - slotsTotalW) / 2;
    const BADGE_Y = PENDING_Y + SLOT_H + 34;
    const SCREEN_Y = BADGE_Y + 26;
    const SCREEN_H = 110;
    const SCREEN_X = PAD_X;
    const SCREEN_W = W - PAD_X * 2;
    const SCREEN_PAD = 14;
    const BOX_SIZE = 20;
    const NEVER_DRAWN_Y = SCREEN_Y + SCREEN_H + 30;
    const NEVER_DRAWN_LINE_H = 16;
    // 한 번도 그려지지 않은 값은 많아야 (쓰기 수 - 1) 줄이다 — 그만큼 자리를 미리 비워 둔다.
    const NEVER_DRAWN_RESERVED = Math.max(1, writeCount - 1) * NEVER_DRAWN_LINE_H + 14;
    const CAPTION_Y = NEVER_DRAWN_Y + NEVER_DRAWN_RESERVED + 16;

    function scaleX(v: number): number {
      return SCREEN_X + SCREEN_PAD + (v / maxLeft) * (SCREEN_W - SCREEN_PAD * 2 - BOX_SIZE);
    }
    function scaleY(v: number): number {
      return SCREEN_Y + SCREEN_PAD + (v / maxTop) * (SCREEN_H - SCREEN_PAD * 2 - BOX_SIZE);
    }

    function captionFor(scene: CoalesceUpdatesScene): string {
      const step = scene.step;
      if (step === null) {
        return t('caption.initial', 'Screen at left {left}, top {top}. Drawn {renders} times so far.', {
          left: scene.screen.left,
          top: scene.screen.top,
          renders: scene.renderCount,
        });
      }
      if (step.kind === 'write') {
        if (step.overwritten) {
          return t('caption.overwrite', 'Write {name} = {value} replaces the queued {previous}.', {
            name: step.name,
            value: step.value,
            previous: step.previousValue ?? '',
          });
        }
        return t('caption.write', 'Write {name} = {value} enters the queue.', {
          name: step.name,
          value: step.value,
        });
      }
      return t(
        'caption.flush',
        'Handler ends. Draw once — screen left {left}, top {top}. Drawn {renders} times.',
        { left: scene.screen.left, top: scene.screen.top, renders: scene.renderCount },
      );
    }

    /** 그 장면의 화면 전체를 세운다. 정본. */
    function drawStatic(scene: CoalesceUpdatesScene): { box: SVGRectElement } {
      svg.textContent = '';

      // 처리기 코드 패널
      svg.appendChild(
        rect(PAD_X, CODE_Y, W - PAD_X * 2, CODE_H, { fill: colors.bgSubtle, stroke: colors.border, rx: 6 }),
      );
      svg.appendChild(
        text(PAD_X + 10, CODE_Y - 6, t('label.code', 'Handler'), {
          size: fontSizes.xs,
          color: colors.textMuted,
        }),
      );
      const activeLine =
        scene.step !== null && scene.step.kind === 'write' ? scene.step.lineIndex : -1;
      baseCode.forEach((line, i) => {
        const ly = CODE_Y + 26 + i * LINE_H;
        if (i === activeLine) {
          svg.appendChild(
            rect(PAD_X + 4, ly - 18, W - PAD_X * 2 - 8, LINE_H - 6, {
              fill: colors.bg,
              stroke: colors.accent,
              strokeWidth: 2,
              rx: 4,
            }),
          );
        }
        svg.appendChild(
          text(PAD_X + 16, ly, line, { family: fonts.mono, size: fontSizes.sm, color: colors.text }),
        );
      });

      // 모아 둔 것 패널
      svg.appendChild(
        text(SLOT_X0, PENDING_Y - 10, t('label.pending', 'Queued'), {
          size: fontSizes.xs,
          color: colors.textMuted,
        }),
      );
      SLOT_NAMES.forEach((name, i) => {
        const sx = SLOT_X0 + i * (SLOT_W + SLOT_GAP);
        const isThisStep =
          scene.step !== null && scene.step.kind === 'write' && scene.step.name === name;
        const overwriteNow = isThisStep && scene.step!.kind === 'write' && scene.step!.overwritten;
        const stroke = overwriteNow
          ? colors.itemSwapping
          : isThisStep
            ? colors.itemActive
            : colors.border;
        svg.appendChild(
          rect(sx, PENDING_Y, SLOT_W, SLOT_H, {
            fill: colors.bg,
            stroke,
            strokeWidth: overwriteNow || isThisStep ? 2 : 1,
            rx: 6,
          }),
        );
        svg.appendChild(
          text(sx + 12, PENDING_Y + 20, name, {
            family: fonts.mono,
            size: fontSizes.sm,
            color: SLOT_COLOR[i] ?? colors.text,
            weight: '600',
          }),
        );
        const value = scene.pending[name];
        svg.appendChild(
          text(sx + SLOT_W - 12, PENDING_Y + 42, value === null ? '—' : String(value), {
            family: fonts.mono,
            size: fontSizes.lg,
            color: value === null ? colors.textMuted : colors.text,
            anchor: 'end',
            weight: '600',
          }),
        );
      });

      // 걸어 둔 그리기 배지
      svg.appendChild(
        text(W / 2, BADGE_Y, t('label.scheduled', 'Scheduled draws: {n}', { n: scene.scheduled }), {
          size: fontSizes.md,
          color: scene.scheduled > 0 ? colors.accent : colors.textMuted,
          anchor: 'middle',
          weight: '600',
        }),
      );

      // 실제 화면(screen) 뷰포트
      svg.appendChild(
        rect(SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H, {
          fill: colors.bg,
          stroke: colors.border,
          rx: 6,
        }),
      );
      svg.appendChild(
        text(SCREEN_X + 10, SCREEN_Y - 8, t('label.screen', 'Screen'), {
          size: fontSizes.xs,
          color: colors.textMuted,
        }),
      );
      const box = rect(scaleX(scene.screen.left), scaleY(scene.screen.top), BOX_SIZE, BOX_SIZE, {
        fill: colors.primary,
        rx: 3,
      });
      svg.appendChild(box);

      // 한 번도 그려지지 않은 값
      scene.neverDrawn.forEach((nd, i) => {
        svg.appendChild(
          text(
            SCREEN_X,
            NEVER_DRAWN_Y + i * NEVER_DRAWN_LINE_H,
            t('label.neverDrawn', 'Never drawn: {name} {value}', { name: nd.name, value: nd.value }),
            { size: fontSizes.xs, color: colors.textMuted },
          ),
        );
      });

      // 캡션
      svg.appendChild(
        text(W / 2, CAPTION_Y, captionFor(scene), {
          size: fontSizes.md,
          color: colors.text,
          anchor: 'middle',
        }),
      );

      return { box };
    }

    function tween(mine: number, durationMs: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed || mine !== gen) {
          resolve();
          return;
        }
        const start = performance.now();
        let frameId = 0;
        const wake = (): void => {
          cancelAnimationFrame(frameId);
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        function step(now: number): void {
          if (destroyed || mine !== gen) {
            waiters.delete(wake);
            resolve();
            return;
          }
          const p = Math.min(1, (now - start) / durationMs);
          onFrame(p);
          if (p < 1) {
            frameId = requestAnimationFrame(step);
          } else {
            waiters.delete(wake);
            resolve();
          }
        }
        frameId = requestAnimationFrame(step);
      });
    }

    function render(
      next: CoalesceUpdatesScene,
      _prev: CoalesceUpdatesScene | null,
      opts: { animate: boolean },
    ): void | Promise<void> {
      const mine = (gen += 1);
      const { box } = drawStatic(next);

      if (!opts.animate) return;
      const step = next.step;
      if (step === null) return;

      if (step.kind === 'write') {
        // 값이 처리기 줄에서 모아 두는 자리로 날아든다 — 옮겨 적히는 값 자체가 움직인다.
        const sx = SLOT_X0 + SLOT_NAMES.indexOf(step.name) * (SLOT_W + SLOT_GAP) + SLOT_W - 12;
        const sy = PENDING_Y + 42;
        const fromY = CODE_Y + 26 + step.lineIndex * LINE_H;
        const flying = text(PAD_X + 16, fromY, String(step.value), {
          family: fonts.mono,
          size: fontSizes.lg,
          color: colors.accent,
          weight: '600',
        });
        svg.appendChild(flying);
        return tween(mine, MOVE_MS, (p) => {
          const x = PAD_X + 16 + (sx - (PAD_X + 16)) * p;
          const y = fromY + (sy - fromY) * p;
          flying.setAttribute('x', String(x));
          flying.setAttribute('y', String(y));
          flying.setAttribute('opacity', String(1 - 0.3 * p));
        }).then(() => {
          if (destroyed || mine !== gen) return;
          drawStatic(next);
        });
      }

      // flush — 모아 둔 것이 한꺼번에 화면으로 들어가, 실제 박스가 움직인다.
      const fromX = scaleX(step.from.left);
      const fromY = scaleY(step.from.top);
      const toX = scaleX(step.to.left);
      const toY = scaleY(step.to.top);
      box.setAttribute('x', String(fromX));
      box.setAttribute('y', String(fromY));
      return tween(mine, MOVE_MS, (p) => {
        box.setAttribute('x', String(fromX + (toX - fromX) * p));
        box.setAttribute('y', String(fromY + (toY - fromY) * p));
      }).then(() => {
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      });
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
