/**
 * verify-vs-find 의 그림.
 *
 * ── 형태가 어디서 나왔는가
 * 질문의 동사는 **갈린다** 이고, 갈리는 것은 "들여다본 후보의 수" 다. 그래서
 * 화면의 두 줄은 **같은 크기의 칸**으로 후보를 그린다 — 확인 줄에 한 칸,
 * 찾기 줄에 예순네 칸. 칸 크기가 같으므로 두 테두리가 감싼 넓이가 곧 값의
 * 차이가 된다. 축척을 누르지 않고 곧이곧대로 그릴 수 있는 크기를 고른 결과다.
 *
 * 칸마다 여섯 자리의 점을 찍는다. 점 하나가 수 하나이고, 찍힌 자리가 곧 그
 * 후보가 고른 조합이다 — 예순네 칸이 "모든 조합" 이라는 것이 그 무늬로 보인다.
 *
 * ── 운동
 *   · 원본 수가 왼쪽 바깥에서 미끄러져 들어와 선다
 *   · 건네받은 후보의 수들이 원본에서 복제되어 아래로 내려오고, 서로 붙으면서
 *     합으로 뭉친다. 뭉친 합은 목표 바로 아래 자리까지 가서 선다
 *   · 횃불(테두리)이 판을 여덟 칸씩 훑으며 미끄러지고, 지나간 칸이 차례로 뒤집힌다
 *   · 답을 만난 칸은 판에서 위로 날아올라 선반에서 펼쳐진다
 *   · 마지막에 횃불이 판 전체로 부풀어, 확인 줄의 작은 테두리와 나란히 선다
 *
 * 캔버스 가로는 러너가 `PIECE_CANVAS_W` 로 준다. 세로는 그림이 정하므로 여기
 * 상수로 둔다 (S-piece · S-view).
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

const W = PIECE_CANVAS_W;
const H = 360;

/** 판이 쓸 수 있는 세로. 칸 크기는 여기서 역산한다. */
const FIELD_MAX_H = 132;
const TILE_MAX = 30;
const TILE_GAP = 4;
const FIELD_COLS_MAX = 16;
const SIDE_MIN = 16;

const CHIP_H = 34;
const CHIP_MAX_W = 56;
const CHIP_GAP = 10;
const SOURCE_ROW_W = 380;
const PLATE_W = 64;

const SOURCE_Y = 16;
const VERIFY_LABEL_Y = 76;
const VERIFY_Y = 86;
const FIND_LABEL_Y = 142;
const SHELF_Y = 152;
const SHELF_H = 30;
const SHELF_GAP = 15;
const SHELF_MAX_W = 180;
const FIELD_Y = 196;
const CAPTION_Y = 346;

const DOT_COLS = 3;

type Box = { x: number; y: number; w: number; h: number };

export type VerifyVsFindStageInstance = ViewInstance & {
  showProblem(v: { values: number[]; target: number; candidates: number; answers: number }): Promise<void>;
  examineGiven(v: {
    mask: number;
    picked: number[];
    partials: number[];
    sum: number;
    target: number;
    ok: boolean;
  }): Promise<void>;
  sweep(v: {
    from: number;
    to: number;
    seen: number;
    total: number;
    hits: { mask: number; picked: number[]; sum: number }[];
  }): Promise<void>;
  settle(v: { verifySeen: number; findSeen: number }): Promise<void>;
  rewind(): void;
  setCaption(text: string): void;
};

type Scene = { values: number[]; target: number };

/** `initialData` 를 좁히는 자리는 mount 다 (S-piece). */
function readScene(data: Record<string, unknown> | undefined): Scene {
  const d = data ?? {};
  const rawValues = d.values;
  const values = Array.isArray(rawValues)
    ? rawValues.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    : [];
  const target = typeof d.target === 'number' ? d.target : 0;
  return { values, target };
}

export const verifyVsFindStageView: CanvasView = {
  canvas: { height: H },

  mount(container, params) {
    void container;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽만 비운다 — 컨테이너를 비우면 러너가 붙여 준
    // 캔버스가 통째로 떨어져 나간다 (S-view).
    canvas.textContent = '';

    const scene = readScene(params.initialData);
    const n = scene.values.length;
    const candidates = n > 0 ? 2 ** n : 0;

    // ── 자리 셈. 칸 수를 정하면 칸 폭이 따라온다 — 상수는 상한만 둔다.
    const cols = Math.max(1, Math.min(FIELD_COLS_MAX, candidates));
    const rows = Math.max(1, Math.ceil(candidates / cols));
    const tile = Math.max(
      6,
      Math.min(
        TILE_MAX,
        Math.floor((W - SIDE_MIN * 2 - TILE_GAP * (cols - 1)) / cols),
        Math.floor((FIELD_MAX_H - TILE_GAP * (rows - 1)) / rows),
      ),
    );
    const pitch = tile + TILE_GAP;
    const fieldW = cols * pitch - TILE_GAP;
    const fieldH = rows * pitch - TILE_GAP;
    const originX = Math.round((W - fieldW) / 2);
    const chipW = Math.min(
      CHIP_MAX_W,
      Math.max(24, Math.floor((SOURCE_ROW_W - CHIP_GAP * Math.max(0, n - 1)) / Math.max(1, n))),
    );
    const plateX = originX + fieldW - PLATE_W;
    const dotRows = Math.max(1, Math.ceil(n / DOT_COLS));

    const chipX = (i: number): number => originX + i * (chipW + CHIP_GAP);
    const slotX = (i: number): number => originX + tile + 46 + i * (chipW + CHIP_GAP);
    const tileX = (i: number): number => originX + (i % cols) * pitch;
    const tileY = (i: number): number => FIELD_Y + Math.floor(i / cols) * pitch;

    function blockBox(from: number, to: number): Box {
      const firstRow = Math.floor(from / cols);
      const lastRow = Math.floor((to - 1) / cols);
      if (firstRow === lastRow) {
        return {
          x: tileX(from),
          y: tileY(from),
          w: (to - from) * pitch - TILE_GAP,
          h: tile,
        };
      }
      return {
        x: originX,
        y: FIELD_Y + firstRow * pitch,
        w: fieldW,
        h: (lastRow - firstRow + 1) * pitch - TILE_GAP,
      };
    }

    // ── 시간. 걸어 둔 것은 집합에 담아 destroy 에서 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    const hasRaf = typeof requestAnimationFrame === 'function';
    const clock = (): number =>
      typeof performance === 'object' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    function nextFrame(run: () => void): void {
      if (hasRaf) {
        const id = requestAnimationFrame(() => {
          frames.delete(id);
          run();
        });
        frames.add(id);
        return;
      }
      const id = setTimeout(() => {
        timers.delete(id);
        run();
      }, 16);
      timers.add(id);
    }

    const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

    function tween(ms: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || ms <= 0) {
          draw(1);
          resolve();
          return;
        }
        const started = clock();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const raw = Math.min(1, (clock() - started) / ms);
          draw(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          nextFrame(tick);
        };
        nextFrame(tick);
      });
    }

    /** 여럿이 조금씩 늦게 출발하게 한다. */
    function stagger(p: number, i: number, count: number): number {
      const span = 1 / (count + 2);
      const from = i * span;
      return Math.max(0, Math.min(1, (p - from) / (1 - from)));
    }

    const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

    // ── 그리기 도구.
    function put(
      parent: Element,
      tag: string,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    const root = put(canvas, 'g', {});
    const fieldLayer = put(root, 'g', {});
    const shelfLayer = put(root, 'g', {});
    const sourceLayer = put(root, 'g', {});
    const verifyLayer = put(root, 'g', {});
    const torchLayer = put(root, 'g', {});

    // ── 판. 후보의 자리는 처음부터 거기 있다 — 들여다보기 전에도 후보는 존재한다.
    type TileRef = { rect: SVGElement; dots: SVGElement[] };
    const tiles: TileRef[] = [];

    function dotsFor(parent: Element, mask: number, x: number, y: number, size: number): SVGElement[] {
      const out: SVGElement[] = [];
      const dx = size / (DOT_COLS + 1);
      const dy = size / (dotRows + 1);
      const r = Math.max(1.4, size / 13);
      for (let i = 0; i < n; i += 1) {
        if ((mask & (1 << i)) === 0) continue;
        out.push(
          put(parent, 'circle', {
            cx: x + dx * ((i % DOT_COLS) + 1),
            cy: y + dy * (Math.floor(i / DOT_COLS) + 1),
            r,
            fill: colors.textMuted,
          }),
        );
      }
      return out;
    }

    function paint(ref: TileRef, state: 'idle' | 'seen' | 'answer'): void {
      ref.rect.setAttribute(
        'fill',
        state === 'answer' ? colors.accent : state === 'seen' ? colors.itemComparing : colors.bgSubtle,
      );
      ref.rect.setAttribute('stroke', state === 'idle' ? colors.border : colors.stateInk);
      for (const d of ref.dots) {
        d.setAttribute('fill', state === 'idle' ? colors.textMuted : colors.stateInk);
      }
    }

    for (let i = 0; i < candidates; i += 1) {
      const x = tileX(i);
      const y = tileY(i);
      const rect = put(fieldLayer, 'rect', {
        x,
        y,
        width: tile,
        height: tile,
        rx: 4,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1,
      });
      const ref: TileRef = { rect, dots: dotsFor(fieldLayer, i, x, y, tile) };
      tiles.push(ref);
    }

    // ── 줄 이름과 캡션.
    put(
      root,
      'text',
      {
        x: originX,
        y: VERIFY_LABEL_Y,
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      },
      t('label.verify', 'Checking'),
    );
    put(
      root,
      'text',
      {
        x: originX,
        y: FIND_LABEL_Y,
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      },
      t('label.find', 'Finding'),
    );
    const captionText = put(
      root,
      'text',
      {
        x: originX,
        y: CAPTION_Y,
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      },
      '',
    );

    // ── 횃불 — 지금 들여다보는 범위를 감싼다. 확인 줄의 테두리와 같은 도구다.
    const torchRect = put(torchLayer, 'rect', {
      x: originX,
      y: FIELD_Y,
      width: 0,
      height: tile,
      rx: 5,
      fill: 'none',
      stroke: colors.text,
      'stroke-width': 2,
      opacity: 0,
    });
    const torchCount = put(
      torchLayer,
      'text',
      {
        x: originX,
        y: FIELD_Y,
        fill: colors.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        opacity: 0,
      },
      '',
    );

    function drawTorch(box: Box, count: number): void {
      torchRect.setAttribute('x', String(box.x - 4));
      torchRect.setAttribute('y', String(box.y - 4));
      torchRect.setAttribute('width', String(box.w + 8));
      torchRect.setAttribute('height', String(box.h + 8));
      torchRect.setAttribute('opacity', '1');
      torchCount.setAttribute('x', String(Math.min(W - 34, box.x + box.w + 12)));
      torchCount.setAttribute('y', String(box.y + box.h / 2 + 4));
      torchCount.setAttribute('opacity', '1');
      torchCount.textContent = String(count);
    }

    const lerpBox = (a: Box, b: Box, p: number): Box => ({
      x: lerp(a.x, b.x, p),
      y: lerp(a.y, b.y, p),
      w: lerp(a.w, b.w, p),
      h: lerp(a.h, b.h, p),
    });

    // ── 걸음마다 새로 나는 것들.
    let sourceChips: SVGElement[] = [];
    let shelfUsed = 0;
    let shelfPlateW = SHELF_MAX_W;
    let torchBox: Box = { x: originX - (tile * 2), y: FIELD_Y, w: tile, h: tile };

    function clearDynamic(): void {
      sourceLayer.textContent = '';
      verifyLayer.textContent = '';
      shelfLayer.textContent = '';
      sourceChips = [];
      shelfUsed = 0;
      torchRect.setAttribute('opacity', '0');
      torchCount.setAttribute('opacity', '0');
      torchBox = { x: originX - tile * 2, y: FIELD_Y, w: tile, h: tile };
      for (const ref of tiles) paint(ref, 'idle');
    }

    type Chip = { g: SVGElement; label: SVGElement };

    function chip(parent: Element, x: number, y: number, w: number, text: string, tone: 'plain' | 'match'): Chip {
      const g = put(parent, 'g', {});
      put(g, 'rect', {
        x,
        y,
        width: w,
        height: CHIP_H,
        rx: 6,
        fill: tone === 'match' ? colors.accent : colors.itemDefault,
        stroke: tone === 'match' ? colors.accent : colors.border,
        'stroke-width': 1,
      });
      const label = put(
        g,
        'text',
        {
          x: x + w / 2,
          y: y + CHIP_H / 2 + 5,
          'text-anchor': 'middle',
          fill: tone === 'match' ? colors.stateInk : colors.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
        },
        text,
      );
      return { g, label };
    }

    const instance: VerifyVsFindStageInstance = {
      setCaption(text: string): void {
        captionText.textContent = text;
      },

      /** 수가 왼쪽 바깥에서 미끄러져 들어와 서고, 목표가 위에서 내려앉는다. */
      async showProblem(v): Promise<void> {
        clearDynamic();
        shelfPlateW = Math.min(
          SHELF_MAX_W,
          Math.floor((fieldW - SHELF_GAP * Math.max(0, v.answers - 1)) / Math.max(1, v.answers)),
        );
        sourceChips = v.values.map(
          (value, i) => chip(sourceLayer, chipX(i), SOURCE_Y, chipW, String(value), 'plain').g,
        );
        const targetLabel = put(
          sourceLayer,
          'text',
          {
            x: plateX - 12,
            y: SOURCE_Y + CHIP_H / 2 + 4,
            'text-anchor': 'end',
            fill: colors.textMuted,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
          },
          t('label.target', 'Target'),
        );
        const targetPlate = chip(sourceLayer, plateX, SOURCE_Y, PLATE_W, String(v.target), 'plain').g;
        const travel = originX + chipW + 40;
        await tween(420, (p) => {
          sourceChips.forEach((g, i) => {
            const q = stagger(p, i, sourceChips.length);
            g.setAttribute('transform', `translate(${(q - 1) * travel}, 0)`);
          });
          targetPlate.setAttribute('transform', `translate(0, ${(p - 1) * 24})`);
          targetLabel.setAttribute('opacity', String(p));
        });
      },

      /**
       * 건네받은 후보 하나. 원본에서 복제된 수가 내려와 서로 붙으면서 합으로
       * 뭉치고, 뭉친 합이 목표 바로 아래로 가서 선다.
       */
      async examineGiven(v): Promise<void> {
        const tileRef: TileRef = {
          rect: put(verifyLayer, 'rect', {
            x: originX,
            y: VERIFY_Y,
            width: tile,
            height: tile,
            rx: 4,
            fill: colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
          }),
          dots: dotsFor(verifyLayer, v.mask, originX, VERIFY_Y, tile),
        };

        const sourceIndex: number[] = [];
        for (let i = 0; i < n; i += 1) if ((v.mask & (1 << i)) !== 0) sourceIndex.push(i);

        const copies = v.picked.map((value, i) =>
          chip(verifyLayer, chipX(sourceIndex[i] ?? i), SOURCE_Y, chipW, String(value), 'plain'),
        );
        const dropTo = copies.map((_, i) => ({
          dx: slotX(i) - chipX(sourceIndex[i] ?? i),
          dy: VERIFY_Y + tile / 2 - CHIP_H / 2 - SOURCE_Y,
        }));

        // 1) 복제본이 아래로 내려온다.
        await tween(300, (p) => {
          copies.forEach((c, i) => {
            const q = stagger(p, i, copies.length);
            const d = dropTo[i] ?? { dx: 0, dy: 0 };
            c.g.setAttribute('transform', `translate(${d.dx * q}, ${d.dy * q})`);
          });
        });
        paint(tileRef, 'seen');

        // 2) 오른쪽 것이 왼쪽으로 붙고, 붙을 때마다 합으로 바뀐다.
        const runner = copies[0];
        for (let i = 1; i < copies.length; i += 1) {
          const moving = copies[i];
          if (!runner || !moving) break;
          const base = dropTo[i] ?? { dx: 0, dy: 0 };
          const home = dropTo[0] ?? { dx: 0, dy: 0 };
          const gap = slotX(i) - slotX(0);
          await tween(240, (p) => {
            moving.g.setAttribute(
              'transform',
              `translate(${base.dx - gap * p}, ${base.dy})`,
            );
            moving.g.setAttribute('opacity', String(1 - p * 0.7));
            runner.g.setAttribute('transform', `translate(${home.dx}, ${home.dy})`);
          });
          moving.g.remove();
          runner.label.textContent = String(v.partials[i] ?? v.sum);
        }

        // 3) 뭉친 합이 목표 바로 아래로 가서 선다.
        if (runner) {
          const home = dropTo[0] ?? { dx: 0, dy: 0 };
          const reach = plateX - slotX(0);
          await tween(280, (p) => {
            runner.g.setAttribute('transform', `translate(${home.dx + reach * p}, ${home.dy})`);
          });
          if (v.ok) {
            const rect = runner.g.firstChild as SVGElement | null;
            rect?.setAttribute('fill', colors.accent);
            rect?.setAttribute('stroke', colors.accent);
            runner.label.setAttribute('fill', colors.stateInk);
            paint(tileRef, 'answer');
            put(verifyLayer, 'path', {
              d: `M ${plateX - 30} ${VERIFY_Y + tile / 2} l 6 7 l 12 -15`,
              fill: 'none',
              stroke: colors.text,
              'stroke-width': 2.5,
              'stroke-linecap': 'round',
            });
          }
        }

        // 확인 줄의 테두리 — 찾기 줄의 횃불과 같은 도구, 같은 자(尺).
        put(verifyLayer, 'rect', {
          x: originX - 4,
          y: VERIFY_Y - 4,
          width: tile + 8,
          height: tile + 8,
          rx: 5,
          fill: 'none',
          stroke: colors.text,
          'stroke-width': 2,
        });
        put(
          verifyLayer,
          'text',
          {
            x: originX + tile + 12,
            y: VERIFY_Y + tile / 2 + 4,
            fill: colors.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          },
          '1',
        );
      },

      /** 횃불이 다음 묶음으로 미끄러지고, 지나간 칸이 차례로 뒤집힌다. */
      async sweep(v): Promise<void> {
        const box = blockBox(v.from, v.to);
        const from = torchBox;
        await tween(220, (p) => drawTorch(lerpBox(from, box, p), v.seen));
        torchBox = box;

        const width = Math.max(1, v.to - v.from);
        const answered = new Set(v.hits.map((h) => h.mask));
        await tween(200, (p) => {
          for (let i = v.from; i < v.to; i += 1) {
            const ref = tiles[i];
            if (!ref) continue;
            const q = stagger(p, i - v.from, width);
            if (q > 0.5) paint(ref, answered.has(i) ? 'answer' : 'seen');
          }
        });

        if (v.hits.length === 0) return;
        await Promise.all(v.hits.map((hit, k) => liftToShelf(hit, shelfUsed + k)));
        shelfUsed += v.hits.length;
      },

      /** 횃불이 판 전체로 부푼다 — 다 보고 나서야 다 봤다고 말할 수 있다. */
      async settle(v): Promise<void> {
        const full: Box = { x: originX, y: FIELD_Y, w: fieldW, h: fieldH };
        const from = torchBox;
        await tween(420, (p) => drawTorch(lerpBox(from, full, p), v.findSeen));
        torchBox = full;
      },

      rewind(): void {
        clearDynamic();
        captionText.textContent = '';
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        if (hasRaf) for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };

    /** 답을 만난 칸이 판에서 위로 날아올라 선반에서 펼쳐진다. */
    async function liftToShelf(
      hit: { mask: number; picked: number[]; sum: number },
      slot: number,
    ): Promise<void> {
      const startX = tileX(hit.mask);
      const startY = tileY(hit.mask);
      const endX = originX + slot * (shelfPlateW + SHELF_GAP);
      const g = put(shelfLayer, 'g', {});
      const rect = put(g, 'rect', {
        x: 0,
        y: 0,
        width: tile,
        height: tile,
        rx: 5,
        fill: colors.accent,
        stroke: colors.accent,
        'stroke-width': 1,
      });
      const label = put(
        g,
        'text',
        {
          x: tile / 2,
          y: tile / 2 + 5,
          'text-anchor': 'middle',
          fill: colors.stateInk,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          opacity: 0,
        },
        `${hit.picked.join(' + ')} = ${hit.sum}`,
      );
      await tween(380, (p) => {
        const w = lerp(tile, shelfPlateW, p);
        g.setAttribute('transform', `translate(${lerp(startX, endX, p)}, ${lerp(startY, SHELF_Y, p)})`);
        rect.setAttribute('width', String(w));
        rect.setAttribute('height', String(lerp(tile, SHELF_H, p)));
        label.setAttribute('x', String(w / 2));
        label.setAttribute('y', String(lerp(tile, SHELF_H, p) / 2 + 5));
        label.setAttribute('opacity', String(Math.max(0, p * 2 - 1)));
      });
    }

    return instance;
  },
};
