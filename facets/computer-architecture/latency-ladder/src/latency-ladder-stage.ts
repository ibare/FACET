/**
 * latency-ladder stage — 사이클 수가 그대로 세로 거리다.
 *
 * ── 축척이 하나다
 * 200 사이클이 캔버스의 세로를 다 쓰고, 4 사이클은 그 50분의 1인 8 픽셀이다.
 * 그래서 위 세 계단참이 꼭대기에 몰려 붙고 마지막 낙하 하나가 화면의 3분의 2를
 * 차지한다. **그 몰림이 결함이 아니라 이 그림이 하려는 말이다** — 고르게 그리면
 * 주장이 사라지고, 로그 축으로 펴면 "고른 계단" 으로 보여 깨려던 믿음을
 * 되살린다.
 *
 * 몰린 자리를 읽히게 하려고 글자를 옮긴 것이지 계단을 옮기지 않았다. 계단참의
 * 수치는 계단참 오른쪽 끝 위에 매달리고(계단이 오른쪽으로 어긋나 쌓이므로 그
 * 기둥은 늘 비어 있다), 층 이름은 왼쪽 끝 아래에 새긴다.
 *
 * ── 낙하는 등속이다
 * `FALL_PX_PER_MS` 하나로 모든 낙하를 굴리므로 거리가 곧 시간이 된다. 마지막
 * 한 걸음이 눈에 띄게 오래 걸리는 것은 연출이 아니라 같은 데이터의 두 번째
 * 통로다. 다만 너무 짧은 낙하는 볼 틈이 없어 `FALL_MIN_MS` 를 바닥으로 둔다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 가로는 러너가 정하므로 여기 없다 (S-piece). */
const H = 470;

/** 0 사이클의 자리 — 코어. 모든 깊이가 여기서부터 잰다. */
const DATUM_Y = 26;
/** 가장 깊은 층의 자리. */
const FLOOR_Y = H - 46;
const CAPTION_Y = H - 14;
const CAPTION_X = 14;

/** 왼쪽 총배수 기둥. */
const GUTTER_X = 34;
const GUTTER_CAP = 12;
const ORIGIN_X = 56;
const PAD_R = 20;

/** 계단참 끝에 매다는 수치 기둥의 폭. */
const TAG_W = 86;
const TAG_GAP = 8;
const TAG_PITCH = 13;

const PLANK_MAX_W = 200;
const PLANK_H = 3;
const PLANK_H_FOUND = 5;
/** 계단참 오른쪽 끝에서 이만큼 앞에서 떨어진다. */
const DEPART_PAD = 30;

const MARKER = 13;
const MARKER_R = 3;

const FALL_PX_PER_MS = 0.16;
const FALL_MIN_MS = 160;
const WALK_MS = 220;
const APPEAR_MS = 140;
const BOUNCE_MS = 360;
const SPAN_MS = 620;

type LadderLevel = { id: string; cycles: number };

/**
 * `initialData` 를 좁힌다. 받는 자리가 여기이고 projector 는 이것을 다시 좁히지
 * 않는다 (S-piece). 단언 뒤에 필드마다 `typeof` 가 따라오므로 좁히개다 (C9).
 */
function readLevels(initialData: Record<string, unknown> | undefined): LadderLevel[] {
  const out: LadderLevel[] = [];
  const raw = initialData?.levels;
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id : '';
    const cycles = typeof rec.cycles === 'number' ? rec.cycles : 0;
    if (id !== '' && cycles > 0) out.push({ id, cycles });
  }
  return out;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

/** 걸음의 시작과 끝을 무르게 한다. 낙하에는 쓰지 않는다 — 거기는 등속이 뜻이다. */
const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));

export const latencyLadderStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const levels = readLevels(params.initialData);
    const n = levels.length;

    const root = el('g');
    svg.appendChild(root);

    let destroyed = false;
    /** 되감을 때마다 오른다. 굴러가던 애니메이션이 이것을 보고 손을 뗀다. */
    let token = 0;
    const waiters = new Set<() => void>();
    const frames = new Set<number>();

    // ── 기하. 좌표는 캔버스에서 역산한다. 상수는 상한만 잡는다 (S-piece).
    const W = PIECE_CANVAS_W;
    const spread = 1 + Math.max(0, n - 1) * 0.5;
    const plankW = Math.min(PLANK_MAX_W, Math.floor((W - ORIGIN_X - PAD_R - TAG_W) / spread));
    const stepDx = Math.round(plankW / 2);
    const maxCycles = levels.reduce((a, l) => Math.max(a, l.cycles), 1);

    const yOf = (cycles: number): number => DATUM_Y + (cycles / maxCycles) * (FLOOR_Y - DATUM_Y);
    const xOf = (i: number): number => ORIGIN_X + i * stepDx;
    /** 떨어지는 자리 — 계단참 오른쪽 끝 언저리. */
    const departCx = (i: number): number => xOf(i) + plankW - DEPART_PAD;
    /** 내려앉는 자리. 윗 계단참의 떨어지는 자리와 같은 세로선이다. */
    const landCx = (i: number): number => departCx(i) - stepDx;
    const rowY = (i: number): number => yOf(levels[i].cycles);

    function textNode(
      x: number,
      y: number,
      size: string,
      fill: string,
      family: string,
    ): SVGTextElement {
      const node = el('text', { x, y, fill });
      node.style.fontFamily = family;
      node.style.fontSize = size;
      return node;
    }

    function levelName(id: string): string {
      switch (id) {
        case 'l1':
          return t('label.l1', 'L1 cache');
        case 'l2':
          return t('label.l2', 'L2 cache');
        case 'l3':
          return t('label.l3', 'L3 cache');
        default:
          return t('label.dram', 'Main memory (DRAM)');
      }
    }

    // ── 기준선. 0 사이클의 자리이므로 코어 그 자체다.
    if (n > 0) {
      root.appendChild(
        el('line', {
          x1: ORIGIN_X,
          y1: DATUM_Y,
          x2: ORIGIN_X + plankW,
          y2: DATUM_Y,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      // 도형에 새긴 글자는 표식이다 — 키를 만들지 않는다 (C10).
      const core = textNode(ORIGIN_X, DATUM_Y - 6, fontSizes.xs, colors.textMuted, fonts.mono);
      core.textContent = 'CPU';
      root.appendChild(core);
    }

    // ── 낙하 자취. 계단참보다 뒤에 깔린다.
    const trails: SVGLineElement[] = [];
    for (let i = 0; i < n - 1; i += 1) {
      const line = el('line', {
        x1: departCx(i),
        y1: rowY(i),
        x2: departCx(i),
        y2: rowY(i),
        stroke: colors.textMuted,
        'stroke-width': 1,
        'stroke-dasharray': '3 4',
      });
      trails.push(line);
      root.appendChild(line);
    }

    // ── 계단참.
    type Row = {
      plank: SVGRectElement;
      stamp: SVGTextElement;
      tag: SVGGElement;
      mult: SVGTextElement;
      cycles: SVGTextElement;
      nanos: SVGTextElement;
    };
    const rows: Row[] = [];

    for (let i = 0; i < n; i += 1) {
      const y = rowY(i);
      const plank = el('rect', {
        x: xOf(i),
        y: y - PLANK_H / 2,
        width: plankW,
        height: PLANK_H,
        rx: PLANK_H / 2,
        fill: colors.textMuted,
      });
      root.appendChild(plank);

      const stamp = textNode(xOf(i) + 6, y + 12, fontSizes.xs, colors.textMuted, fonts.mono);
      stamp.textContent = levels[i].id.toUpperCase();
      root.appendChild(stamp);

      // 수치는 계단참 끝 위에 매단다. 계단이 오른쪽으로 어긋나 쌓이므로 그
      // 기둥 위쪽은 늘 비어 있고, 걷는 말이 지나는 길과도 겹치지 않는다.
      const tagX = xOf(i) + plankW + TAG_GAP;
      const tag = el('g', { opacity: 0 });
      const mult = textNode(tagX, y - 4 - TAG_PITCH * 2, fontSizes.xs, colors.textMuted, fonts.mono);
      const cycles = textNode(tagX, y - 4 - TAG_PITCH, fontSizes.xs, colors.text, fonts.mono);
      const nanos = textNode(tagX, y - 4, fontSizes.xs, colors.textMuted, fonts.mono);
      tag.appendChild(mult);
      tag.appendChild(cycles);
      tag.appendChild(nanos);
      root.appendChild(tag);

      rows.push({ plank, stamp, tag, mult, cycles, nanos });
    }

    // ── 총배수 기둥. 첫 계단참에서 마지막 계단참까지를 한 자로 잰다.
    const spanTop = n > 0 ? rowY(0) : DATUM_Y;
    const spanBottom = n > 0 ? rowY(n - 1) : FLOOR_Y;
    const spanGroup = el('g', { opacity: 0 });
    const spanLine = el('line', {
      x1: GUTTER_X,
      y1: spanTop,
      x2: GUTTER_X,
      y2: spanTop,
      stroke: colors.text,
      'stroke-width': 1.5,
    });
    const spanCapTop = el('line', {
      x1: GUTTER_X,
      y1: spanTop,
      x2: GUTTER_X + GUTTER_CAP,
      y2: spanTop,
      stroke: colors.text,
      'stroke-width': 1.5,
    });
    const spanCapBottom = el('line', {
      x1: GUTTER_X,
      y1: spanBottom,
      x2: GUTTER_X + GUTTER_CAP,
      y2: spanBottom,
      stroke: colors.text,
      'stroke-width': 1.5,
      opacity: 0,
    });
    const spanLink = el('line', {
      x1: GUTTER_X + GUTTER_CAP,
      y1: spanBottom,
      x2: n > 0 ? xOf(n - 1) : GUTTER_X,
      y2: spanBottom,
      stroke: colors.border,
      'stroke-width': 1,
      'stroke-dasharray': '2 4',
      opacity: 0,
    });
    // `×50` 은 수식 표기이므로 표식이다 — 키를 만들지 않는다 (C10).
    const spanLabel = textNode(
      GUTTER_X + GUTTER_CAP + 6,
      (spanTop + spanBottom) / 2 + 4,
      fontSizes.md,
      colors.text,
      fonts.mono,
    );
    spanLabel.setAttribute('opacity', '0');
    spanGroup.appendChild(spanLine);
    spanGroup.appendChild(spanCapTop);
    spanGroup.appendChild(spanCapBottom);
    spanGroup.appendChild(spanLink);
    spanGroup.appendChild(spanLabel);
    root.appendChild(spanGroup);

    // ── 값을 찾아 내려가는 말.
    const marker = el('rect', {
      x: 0,
      y: 0,
      width: MARKER,
      height: MARKER,
      rx: MARKER_R,
      fill: colors.primary,
      opacity: 0,
    });
    root.appendChild(marker);

    const caption = textNode(CAPTION_X, CAPTION_Y, fontSizes.sm, colors.textMuted, fonts.body);
    root.appendChild(caption);

    // ── 움직임.
    function tween(ms: number, apply: (p: number) => void): Promise<void> {
      const mine = token;
      return new Promise<void>((resolve) => {
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        if (destroyed) {
          finish();
          return;
        }
        waiters.add(finish);
        const started = Date.now();
        const step = (): void => {
          // 접혔거나 되감겼으면 그 자리에서 손을 뗀다. 끝 상태로 밀면 방금
          // 되돌린 화면을 다시 흐트러뜨린다.
          if (destroyed || mine !== token) {
            finish();
            return;
          }
          const p = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
          apply(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            step();
          });
          frames.add(id);
        };
        step();
      });
    }

    function placeMarker(cx: number, lineY: number): void {
      marker.setAttribute('x', String(cx - MARKER / 2));
      // 말은 계단참 위에 올라선다.
      marker.setAttribute('y', String(lineY - MARKER));
    }

    function setPlank(i: number, fill: string, height: number): void {
      const row = rows[i];
      row.plank.setAttribute('fill', fill);
      row.plank.setAttribute('height', String(height));
      row.plank.setAttribute('y', String(rowY(i) - height / 2));
      row.plank.setAttribute('rx', String(height / 2));
    }

    function showTag(i: number, cycles: number, ns: number, factor?: number): void {
      const row = rows[i];
      row.cycles.textContent = t('label.cycles', '{n} cycles', { n: cycles });
      row.nanos.textContent = t('label.ns', '≈{n} ns', { n: ns });
      row.mult.textContent = factor === undefined || factor <= 0 ? '' : `×${factor}`;
      row.tag.setAttribute('opacity', '1');
    }

    function indexOfLevel(id: string): number {
      for (let i = 0; i < n; i += 1) if (levels[i].id === id) return i;
      return -1;
    }

    /** 계단참 오른쪽 끝까지 걸어간다. 이 가로 이동은 주장이 아니라 이동이다. */
    function walk(i: number): Promise<void> {
      const y = rowY(i);
      const from = landCx(i);
      const to = departCx(i);
      return tween(WALK_MS, (p) => placeMarker(lerp(from, to, easeInOut(p)), y));
    }

    /**
     * 아래 계단참으로 떨어진다. 등속이므로 걸린 시간이 곧 내려온 거리다.
     * 떨어지는 동안 아래 계단참이 다가오듯 드러난다.
     */
    function fall(from: number, to: number): Promise<void> {
      const cx = departCx(from);
      const yFrom = rowY(from);
      const yTo = rowY(to);
      const trail = trails[from];
      const ms = Math.max(FALL_MIN_MS, (yTo - yFrom) / FALL_PX_PER_MS);
      return tween(ms, (p) => {
        const y = lerp(yFrom, yTo, p);
        placeMarker(cx, y);
        if (trail) trail.setAttribute('y2', String(y));
        rows[to].plank.setAttribute('opacity', String(0.25 + 0.75 * p));
      });
    }

    function resetScene(): void {
      token += 1;
      caption.textContent = '';
      marker.setAttribute('opacity', '0');
      for (let i = 0; i < n; i += 1) {
        setPlank(i, colors.textMuted, PLANK_H);
        rows[i].plank.setAttribute('opacity', i === 0 ? '1' : '0');
        rows[i].stamp.setAttribute('fill', colors.textMuted);
        rows[i].tag.setAttribute('opacity', '0');
      }
      for (let i = 0; i < trails.length; i += 1) {
        trails[i].setAttribute('y2', String(rowY(i)));
      }
      spanGroup.setAttribute('opacity', '0');
      spanLine.setAttribute('y2', String(spanTop));
      spanCapBottom.setAttribute('opacity', '0');
      spanLink.setAttribute('opacity', '0');
      spanLabel.setAttribute('opacity', '0');
    }

    resetScene();

    return {
      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 걸어 둔 것을 거둔 다음 기다리던 것을 깨운다. 취소된 프레임은 아예
        // 불리지 않으므로 여기서 풀지 않으면 projector 가 영영 매달린다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },

      reset(): void {
        resetScene();
      },

      async ask(step: { level: string; cycles: number; ns: number }): Promise<void> {
        const i = indexOfLevel(step.level);
        if (i < 0) return;
        caption.textContent = t(
          'caption.ask',
          'The core asks the nearest floor first: {level}',
          { level: levelName(step.level) },
        );
        placeMarker(landCx(i), DATUM_Y);
        await tween(APPEAR_MS, (p) => marker.setAttribute('opacity', String(p)));
        // 코어에서 첫 계단참까지도 거리가 있다 — 네 사이클만큼.
        const ms = Math.max(FALL_MIN_MS, (rowY(i) - DATUM_Y) / FALL_PX_PER_MS);
        await tween(ms, (p) => placeMarker(landCx(i), lerp(DATUM_Y, rowY(i), p)));
        setPlank(i, colors.itemActive, PLANK_H);
        rows[i].stamp.setAttribute('fill', colors.text);
        showTag(i, step.cycles, step.ns);
      },

      async miss(step: {
        from: string;
        to: string;
        cycles: number;
        ns: number;
        factor: number;
      }): Promise<void> {
        const a = indexOfLevel(step.from);
        const b = indexOfLevel(step.to);
        if (a < 0 || b < 0) return;
        caption.textContent = t('caption.miss', 'Not there. One floor further down: {level}', {
          level: levelName(step.to),
        });
        setPlank(a, colors.border, PLANK_H);
        rows[a].stamp.setAttribute('fill', colors.textMuted);
        await walk(a);
        await fall(a, b);
        setPlank(b, colors.itemActive, PLANK_H);
        rows[b].plank.setAttribute('opacity', '1');
        rows[b].stamp.setAttribute('fill', colors.text);
        showTag(b, step.cycles, step.ns, step.factor);
      },

      async hit(step: { level: string; cycles: number; ns: number }): Promise<void> {
        const i = indexOfLevel(step.level);
        if (i < 0) return;
        caption.textContent = t('caption.hit', 'Found here. Cycles spent: {cycles}', {
          cycles: step.cycles,
        });
        setPlank(i, colors.accent, PLANK_H_FOUND);
        rows[i].stamp.setAttribute('fill', colors.text);
        const y = rowY(i);
        const cx = departCx(i);
        await tween(BOUNCE_MS, (p) => {
          placeMarker(cx, y - Math.abs(Math.sin(p * Math.PI * 2)) * 7);
        });
        placeMarker(cx, y);
      },

      async span(step: { factor: number }): Promise<void> {
        if (n < 2) return;
        caption.textContent = t('caption.span', 'Same lookup, top floor to bottom: ×{factor}', {
          factor: step.factor,
        });
        spanLabel.textContent = `×${step.factor}`;
        spanGroup.setAttribute('opacity', '1');
        await tween(SPAN_MS, (p) => {
          spanLine.setAttribute('y2', String(lerp(spanTop, spanBottom, easeInOut(p))));
        });
        spanCapBottom.setAttribute('opacity', '1');
        spanLink.setAttribute('opacity', '1');
        spanLabel.setAttribute('opacity', '1');
      },
    };
  },
};
