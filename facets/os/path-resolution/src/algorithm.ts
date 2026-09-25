/**
 * path-resolution — 경로 이름을 따라 한 층씩 내려가 파일의 inode 에 닿는다.
 *
 * 규약 (사양 그대로):
 *   - 출발점은 루트 디렉터리의 inode (`root`). `.` · `..` 항목은 두지 않는다.
 *   - 한 걸음 = 마디 하나. 지금 디렉터리의 목록을 **적힌 차례로** 훑어 처음 같은 이름에서 멈추고
 *     그 옆의 inode 번호를 얻는다. 견준 이름의 수는 멈춘 자리까지 훑은 항목 수다.
 *   - 이름은 한 디렉터리 안에서 겹치지 않는다.
 *   - 없는 이름 · 파일 아래로 내려가기 · 목록이 없는 디렉터리 · 종류를 모르는 번호는 던진다.
 *   - 블록 읽기 수는 세지 않는다. 세는 것은 견준 이름이다.
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 세운다 (루트 목록과 경로). 읽을 것이 있는 화면이라
 * 첫 발신 앞에 stepMs 만큼 머문다.
 *
 * 이벤트 (silent 없음)
 *   descend  payload {
 *     seg: number        이번 마디의 자리 (path 의 0 부터)
 *     dir: number        훑은 디렉터리의 inode
 *     compared: number   이 디렉터리에서 견준 이름 수 (1 부터)
 *     found: number      같은 이름 옆에 적힌 inode
 *     kind: 'dir' | 'file'  found 의 종류
 *     total: number      지금까지 견준 이름의 합
 *     dirs: number       지금까지 훑은 디렉터리 수
 *   }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PathEntry = { name: string; inode: number };
export type PathDir = { inode: number; entries: PathEntry[] };
export type InodeKind = 'dir' | 'file';

export type PathResolutionFacetData = {
  type: 'path-resolution';
  stepMs: number;
  /** 루트 디렉터리의 inode — 경로 해석의 출발점 */
  root: number;
  /** 찾을 경로의 마디, 앞에서부터 */
  path: string[];
  /** 목록이 있는 디렉터리, 항목은 적힌 차례 그대로 */
  dirs: PathDir[];
  /** 번호마다의 종류 */
  kinds: { dir: number[]; file: number[] };
};

function kindOf(data: PathResolutionFacetData, inode: number): InodeKind {
  const isDir = data.kinds.dir.includes(inode);
  const isFile = data.kinds.file.includes(inode);
  if (isDir && isFile) throw new Error(`path-resolution: inode ${inode} 이 디렉터리이자 파일로 적혀 있다`);
  if (isDir) return 'dir';
  if (isFile) return 'file';
  throw new Error(`path-resolution: inode ${inode} 의 종류를 모른다`);
}

export async function pathResolution(context: FacetContext<PathResolutionFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<PathResolutionFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let cur = data.root;
  let total = 0;
  let visited = 0;

  for (let seg = 0; seg < data.path.length; seg += 1) {
    // 걸음 0(루트) 과 앞 걸음을 읽을 틈 — 문이 첫 문장이라 진입 검사를 겸한다
    if (!(await pause())) return;
    const name = data.path[seg];
    if (name === undefined || name === '') throw new Error(`path-resolution: 마디 ${seg} 이 비어 있다`);
    if (kindOf(data, cur) !== 'dir') {
      throw new Error(`path-resolution: 파일 inode ${cur} 아래로 ${name} 을 찾을 수 없다`);
    }
    const dir = data.dirs.find((d) => d.inode === cur);
    if (!dir) throw new Error(`path-resolution: 디렉터리 inode ${cur} 의 목록이 없다`);

    let compared = 0;
    let found: number | null = null;
    for (const entry of dir.entries) {
      if (ctx.cancelled) return;
      compared += 1;
      if (entry.name === name) {
        found = entry.inode;
        break;
      }
    }
    if (found === null) throw new Error(`path-resolution: 디렉터리 inode ${cur} 에 ${name} 이 없다`);

    total += compared;
    visited += 1;
    const kind = kindOf(data, found);
    await ctx.emit({
      type: 'descend',
      payload: { seg, dir: cur, compared, found, kind, total, dirs: visited },
    });
    cur = found;
  }
  // 마지막 걸음(파일에 닿음) 을 읽을 틈
  await pause();
}
