/**
 * cache-line-stage — 총 용량이 고정된 캐시를 줄로 갈라 보이는 화면.
 *
 * 두 줄짜리 화면이다. 위는 이어 읽기, 아래는 띄엄띄엄 읽기이며 **같은 라인
 * 크기**를 받는다. 손잡이가 돌면 두 줄 모두에서 경계가 옮겨 간다.
 *
 * ── 무엇이 실제로 움직이는가
 *
 * 1. **줄 경계.** 자리 사각형을 늘 32 개 들고 있고, 라인 크기가 바뀌면 이웃끼리
 *    **같은 자리로 미끄러져 겹친다.** 32 개가 둘씩 붙어 16 개가 되고, 다시 넷씩
 *    붙어 8 개가 된다. 사라졌다 나타나는 것이 아니라 옮겨 가서 합쳐진다.
 * 2. **훑개.** 접근마다 지금 건드린 바이트 자리로 미끄러진다. 띄엄띄엄 읽기에서
 *    늘 줄의 같은 귀퉁이에만 떨어지는 것이 여기서 보인다.
 * 3. **줄 채움.** 미스가 나면 훑개 폭(정수 한 칸)에서 줄 전체 폭으로 **자란다** —
 *    이웃을 데려오는 일이 곧 그 자람이다.
 *
 * 눈금(정수 한 칸)은 절대 움직이지 않는다. 움직이는 경계와 안 움직이는 눈금을
 * 함께 두어야 "한 줄이 덮는 칸의 수" 가 달라지는 것이 보인다.
 *
 * 색은 전부 design-tokens 를 거친다 (S-view). 화면 문자는 `params.t` 로 조회하며
 * 문안은 facet.ts 에 있다 (C10).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 332;
/** 왼쪽 이름 칸 다음부터가 캐시 그림이다. */
const X0 = 120;
const TRACK_W = 580;
const STRIP_H = 34;
const TICK_H = 22;
const ROW_TOP = [46, 170];
const CAP_Y = 26;
const VERDICT_Y = 272;
const VERDICT_LEAD = 18;
const VERDICT_LINES = 3;
/** 한 줄에 담는 글자 너비 — 라틴 1, 한중일 2 로 센다. */
const VERDICT_UNITS = 104;

const MOVE_MS = 260;
const PROBE_MS = 130;
const FETCH_MS = 190;

type Geom = { x: number; w: number };

type Config = {
  lineSize: number;
  lineCount: number;
  elementsPerLine: number;
};

type Row = {
  id: string;
  top: number;
  slots: SVGRectElement[];
  ticks: SVGRectElement[];
  probe: SVGRectElement;
  fill: SVGRectElement;
  cursor: SVGRectElement;
  summary: SVGTextElement;
  geom: Geom[];
  probeX: number;
  cursorX: number;
};

function widthOf(text: string): number {
  let n = 0;
  for (const ch of text) n += ch.charCodeAt(0) > 0x2e7f ? 2 : 1;
  return n;
}

/** 띄어쓰기가 있으면 거기서, 없으면(한중일) 글자 수로 끊는다. */
function wrapText(value: string, maxUnits: number): string[] {
  const lines: string[] = [];
  let cur = '';
  let units = 0;
  for (const ch of value) {
    const u = widthOf(ch);
    if (units + u > maxUnits && cur !== '') {
      const sp = cur.lastIndexOf(' ');
      if (sp > maxUnits / 3) {
        lines.push(cur.slice(0, sp));
        cur = cur.slice(sp + 1);
      } else {
        lines.push(cur);
        cur = '';
      }
      units = 0;
      for (const c of cur) units += widthOf(c);
    }
    cur += ch;
    units += u;
  }
  if (cur !== '') lines.push(cur);
  return lines.slice(0, VERDICT_LINES);
}

export const cacheLineStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const canvas = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    // ── 1차 데이터 — 없으면 기본값으로 선다 (러너 밖 mount 를 위해).
    const init = (params.initialData ?? {}) as {
      totalBytes?: unknown;
      elementBytes?: unknown;
      lineSize?: unknown;
      tracks?: unknown;
    };
    const num = (value: unknown, fallback: number): number =>
      typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
    const totalBytes = num(init.totalBytes, 128);
    const elementBytes = num(init.elementBytes, 4);
    const cells = Math.max(1, Math.round(totalBytes / elementBytes));
    const cellW = TRACK_W / cells;

    const trackIds: string[] = (Array.isArray(init.tracks) ? init.tracks : [])
      .map((x) =>
        x !== null && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string'
          ? (x as { id: string }).id
          : '',
      )
      .filter((id) => id !== '')
      .slice(0, ROW_TOP.length);
    const ids = trackIds.length > 0 ? trackIds : ['sequential', 'strided'];

    let config: Config = {
      lineSize: num(init.lineSize, 8),
      lineCount: Math.max(1, Math.floor(totalBytes / num(init.lineSize, 8))),
      elementsPerLine: Math.max(1, Math.floor(num(init.lineSize, 8) / elementBytes)),
    };

    // ── 되돌릴 수 있는 뒷일 관리. destroy 는 관찰 가능한 것을 남기지 않는다.
    let destroyed = false;
    const timers = new Set<number>();
    const nowMs = (): number =>
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    const schedule = (fn: () => void): number =>
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(fn)
        : (setTimeout(fn, 16) as unknown as number);
    const unschedule = (id: number): void => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id);
    };
    const ease = (p: number): number => 1 - (1 - p) * (1 - p) * (1 - p);

    function animate(duration: number, step: (k: number) => void): void {
      if (destroyed) return;
      const begin = nowMs();
      let id = 0;
      const tick = (): void => {
        timers.delete(id);
        if (destroyed) return;
        const p = Math.min(1, (nowMs() - begin) / duration);
        step(ease(p));
        if (p < 1) {
          id = schedule(tick);
          timers.add(id);
        }
      };
      id = schedule(tick);
      timers.add(id);
    }

    // ── DOM 짜기
    const svgRect = (): SVGRectElement => document.createElementNS(SVG_NS, 'rect');
    const svgLine = (): SVGLineElement => document.createElementNS(SVG_NS, 'line');
    const svgText = (x: number, y: number, size: string, fill: string, family: string): SVGTextElement => {
      const node = document.createElementNS(SVG_NS, 'text');
      node.setAttribute('x', String(x));
      node.setAttribute('y', String(y));
      node.style.fontSize = size;
      node.style.fontFamily = family;
      node.setAttribute('fill', fill);
      return node;
    };
    const place = (node: SVGRectElement, x: number, y: number, w: number, h: number): void => {
      node.setAttribute('x', String(x));
      node.setAttribute('y', String(y));
      node.setAttribute('width', String(Math.max(0, w)));
      node.setAttribute('height', String(h));
    };

    const root = document.createElementNS(SVG_NS, 'g');
    canvas.appendChild(root);

    const caption = svgText(X0, CAP_Y, fontSizes.sm, colors.textMuted, fonts.body);
    root.appendChild(caption);

    const geomFor = (cfg: Config): Geom[] => {
      const lineW = TRACK_W / cfg.lineCount;
      const out: Geom[] = [];
      for (let i = 0; i < cells; i += 1) {
        const li = Math.min(cfg.lineCount - 1, Math.floor(i / cfg.elementsPerLine));
        out.push({ x: X0 + li * lineW, w: lineW });
      }
      return out;
    };

    const rows: Row[] = ids.map((id, r) => {
      const top = ROW_TOP[r];
      const stripY = top;
      const trackY = top + 46;

      const name = svgText(14, top + 14, fontSizes.md, colors.text, fonts.body);
      name.textContent = id === 'strided' ? t('label.strided', 'Strided') : t('label.sequential', 'Sequential');
      name.style.fontWeight = '600';
      root.appendChild(name);

      const missLabel = svgText(14, top + 32, fontSizes.xs, colors.textMuted, fonts.body);
      missLabel.textContent = t('label.miss', 'miss');
      root.appendChild(missLabel);

      const summary = svgText(14, top + 50, fontSizes.sm, colors.text, fonts.mono);
      root.appendChild(summary);

      const bg = svgRect();
      place(bg, X0, stripY, TRACK_W, STRIP_H);
      bg.setAttribute('fill', colors.bgSubtle);
      bg.setAttribute('stroke', colors.border);
      root.appendChild(bg);

      const geom = geomFor(config);
      const slots: SVGRectElement[] = [];
      for (let i = 0; i < cells; i += 1) {
        const slot = svgRect();
        place(slot, geom[i].x, stripY, geom[i].w, STRIP_H);
        slot.setAttribute('fill', colors.itemDefault);
        slot.setAttribute('stroke', colors.border);
        root.appendChild(slot);
        slots.push(slot);
      }

      // 미스가 데려오는 줄. 훑개 폭에서 줄 폭으로 자란다.
      const fill = svgRect();
      place(fill, X0, stripY, 0, STRIP_H);
      fill.setAttribute('fill', colors.itemSwapping);
      fill.setAttribute('opacity', '0');
      root.appendChild(fill);

      // 정수 한 칸 눈금 — 절대 움직이지 않는다.
      for (let i = 1; i < cells; i += 1) {
        const tick = svgLine();
        const x = X0 + i * cellW;
        tick.setAttribute('x1', String(x));
        tick.setAttribute('x2', String(x));
        tick.setAttribute('y1', String(stripY));
        tick.setAttribute('y2', String(stripY + STRIP_H));
        tick.setAttribute('stroke', colors.bg);
        tick.setAttribute('stroke-width', '1');
        tick.setAttribute('opacity', '0.55');
        root.appendChild(tick);
      }

      const probe = svgRect();
      place(probe, X0, stripY, cellW, STRIP_H);
      probe.setAttribute('fill', colors.itemActive);
      probe.setAttribute('opacity', '0');
      root.appendChild(probe);

      const ticks: SVGRectElement[] = [];
      for (let i = 0; i < cells; i += 1) {
        const tick = svgRect();
        place(tick, X0 + i * cellW + 1, trackY, cellW - 2, TICK_H);
        tick.setAttribute('fill', colors.itemDefault);
        tick.setAttribute('stroke', colors.border);
        root.appendChild(tick);
        ticks.push(tick);
      }

      const cursor = svgRect();
      place(cursor, X0, trackY + TICK_H + 3, cellW, 3);
      cursor.setAttribute('fill', colors.itemActive);
      cursor.setAttribute('opacity', '0');
      root.appendChild(cursor);

      return {
        id,
        top,
        slots,
        ticks,
        probe,
        fill,
        cursor,
        summary,
        geom,
        probeX: X0,
        cursorX: X0,
      };
    });

    const verdict: SVGTextElement[] = [];
    for (let i = 0; i < VERDICT_LINES; i += 1) {
      const node = svgText(14, VERDICT_Y + i * VERDICT_LEAD, fontSizes.sm, colors.text, fonts.body);
      root.appendChild(node);
      verdict.push(node);
    }

    // ── 갱신
    const paintCaption = (): void => {
      caption.textContent = t(
        'caption.config',
        'One line holds {bytes} B, so the cache is cut into {lines} lines.',
        { bytes: config.lineSize, lines: config.lineCount },
      );
    };

    const applyGeom = (row: Row): void => {
      for (let i = 0; i < row.slots.length; i += 1) {
        row.slots[i].setAttribute('x', String(row.geom[i].x));
        row.slots[i].setAttribute('width', String(Math.max(0, row.geom[i].w)));
      }
    };

    const clearRow = (row: Row): void => {
      for (const slot of row.slots) slot.setAttribute('fill', colors.itemDefault);
      for (const tick of row.ticks) tick.setAttribute('fill', colors.itemDefault);
      row.probe.setAttribute('opacity', '0');
      row.cursor.setAttribute('opacity', '0');
      row.fill.setAttribute('opacity', '0');
      row.summary.textContent = '';
    };

    const rowOf = (trackId: string): Row | undefined => rows.find((r) => r.id === trackId);

    paintCaption();

    return {
      destroy(): void {
        destroyed = true;
        for (const id of timers) unschedule(id);
        timers.clear();
        if (root.parentNode) root.parentNode.removeChild(root);
      },

      setConfig(next: Config): void {
        if (destroyed) return;
        config = {
          lineSize: Math.max(1, next.lineSize),
          lineCount: Math.max(1, next.lineCount),
          elementsPerLine: Math.max(1, next.elementsPerLine),
        };
        paintCaption();
        for (const line of verdict) line.textContent = '';

        for (const row of rows) {
          clearRow(row);
          const from = row.geom.map((g) => ({ x: g.x, w: g.w }));
          const to = geomFor(config);
          animate(MOVE_MS, (k) => {
            for (let i = 0; i < row.geom.length; i += 1) {
              row.geom[i] = {
                x: from[i].x + (to[i].x - from[i].x) * k,
                w: from[i].w + (to[i].w - from[i].w) * k,
              };
            }
            applyGeom(row);
          });
        }
      },

      markAccess(
        trackId: string,
        index: number,
        lineIndex: number,
        byteOffset: number,
        hit: boolean,
      ): void {
        if (destroyed) return;
        const row = rowOf(trackId);
        if (!row) return;

        const lineW = TRACK_W / config.lineCount;
        const slotX = X0 + lineIndex * lineW;
        const probeTo = slotX + (byteOffset / config.lineSize) * lineW;
        const stripY = row.top;

        // 훑개가 방금 건드린 바이트 자리로 미끄러진다.
        const probeFrom = row.probeX;
        row.probe.setAttribute('opacity', '1');
        row.probe.setAttribute('fill', hit ? colors.itemActive : colors.itemSwapping);
        animate(PROBE_MS, (k) => {
          const x = probeFrom + (probeTo - probeFrom) * k;
          row.probe.setAttribute('x', String(x));
        });
        row.probeX = probeTo;

        if (!hit) {
          // 이웃을 데려오는 일 — 한 칸에서 줄 전체로 자란다.
          row.fill.setAttribute('opacity', '1');
          row.fill.setAttribute('y', String(stripY));
          animate(FETCH_MS, (k) => {
            const x = probeTo + (slotX - probeTo) * k;
            const w = cellW + (lineW - cellW) * k;
            row.fill.setAttribute('x', String(x));
            row.fill.setAttribute('width', String(Math.max(0, w)));
            if (k >= 1) {
              row.fill.setAttribute('opacity', '0');
              for (let i = 0; i < row.slots.length; i += 1) {
                if (Math.abs(row.geom[i].x - slotX) < 0.5) {
                  row.slots[i].setAttribute('fill', colors.itemSorted);
                }
              }
            }
          });
        }

        const tick = row.ticks[index];
        if (tick) tick.setAttribute('fill', hit ? colors.itemSorted : colors.itemSwapping);

        const cursorTo = X0 + index * cellW;
        const cursorFrom = row.cursorX;
        row.cursor.setAttribute('opacity', '1');
        animate(PROBE_MS, (k) => {
          row.cursor.setAttribute('x', String(cursorFrom + (cursorTo - cursorFrom) * k));
        });
        row.cursorX = cursorTo;
      },

      setSummary(trackId: string, misses: number, accessCount: number, rate: number): void {
        if (destroyed) return;
        const row = rowOf(trackId);
        if (!row) return;
        // 숫자와 기호뿐이라 표식이다 — 키를 만들지 않는다 (C10 판정 3).
        row.summary.textContent = `${misses} / ${accessCount} · ${rate}%`;
      },

      setVerdict(text: string): void {
        if (destroyed) return;
        const lines = wrapText(text, VERDICT_UNITS);
        for (let i = 0; i < verdict.length; i += 1) {
          verdict[i].textContent = lines[i] ?? '';
        }
      },

      clearRun(): void {
        if (destroyed) return;
        for (const row of rows) clearRow(row);
        for (const line of verdict) line.textContent = '';
      },
    };
  },
};
