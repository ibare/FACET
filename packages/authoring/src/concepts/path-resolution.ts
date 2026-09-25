/**
 * pathResolution 개념 선언.
 *
 * canonical facet 은 `facet:pathResolution` — `/home/mina/notes.txt` 를 마디로 떼어, 루트(inode 2)에서 시작해 디렉터리
 * 목록을 위에서부터 훑고 같은 이름 옆의 번호로 한 층씩 내려간다. home → 12, mina → 31, notes.txt → 47. 견준 이름 8,
 * 훑은 디렉터리 3. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 이 묶음의 다른 개념은 모두 inode **다음**(블록에 닿기 · 저널)을 다룬다. 이쪽은 inode **앞** — 이름에서 번호로
 * 가는 길 하나다. 그래서 definition 은 pathname · component · directory entries · root · descend 쪽 낱말을 쥐고,
 * block · slot 을 쓰지 않는다. 링크(`hardVsSoftLink`)와는 "이름을 찾는다" 가 겹치므로 링크 수 · 지우기 낱말을 피한다.
 *
 * 전제: inode 번호와 디렉터리 내용은 예로 정한 값이다. 루트 inode 2 는 ext2 계열 관례. `.` · `..` 항목은 뺐다.
 * 목록을 앞에서부터 하나씩 견주는 가장 단순한 방식이고(해시 색인 · 디렉터리 항목 캐시는 없다), 디스크 읽기가 아니라
 * 견준 이름의 수를 센다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pathResolutionConcept: FacetConceptSource = {
  id: 'pathResolution',
  label: 'Path Resolution (Pathname to inode)',
  canonicalFacet: 'facet:pathResolution',

  surface: {
    definition:
      'A file system turns a pathname into an inode number by splitting it into components and, starting at the root directory, finding each name among the current directory\'s entries to descend one level.',
    exemplarKeywords: [
      'pathname lookup',
      'namei',
      'resolving /home/user/file',
      'directory entry',
      'absolute path',
      'No such file or directory',
      'ENOENT',
      'Not a directory',
      'dentry cache',
      'root inode 2',
    ],
  },

  briefing: {
    observable: [
      'The path `/home/mina/notes.txt` is split into its components across the top. The start card reads "Start: root directory, inode 2", and the root directory lists `bin` 5, `etc` 8, `home` 12.',
      'Each step scans the current directory from the top, marking each entry ≠ or =, then opens the next directory. Step 1: `bin` ≠, `etc` ≠, `home` = → inode 12, "Looking for: home · names compared: 3 · next directory: inode 12".',
      'Step 2 scans inode 12 (`jun` 27, `mina` 31): 2 names compared, next directory inode 31. Step 3 scans inode 31 (`photos` 33, `todo.txt` 45, `notes.txt` 47): 3 names compared, "reached file: inode 47".',
      'A running total ends at "Total names compared: 8 · directories searched: 3". One more component would mean one more directory to scan, and a name further down a list costs more comparisons.',
      'inode numbers and directory contents are example values; root at inode 2 follows the ext2 convention. The `.` and `..` entries are left out. Each list is compared from the front one by one; real systems often add hashed directory indexes and a cache of already-resolved names, and the count here is names compared, not disk reads.',
    ],

    screen: {
      affordances: [
        'The screen plays the three descents by itself and stops at inode 47.',
        'A Replay button and a playback strip sit below it. Dragging the strip back to any step shows which entries of that directory were compared.',
        'The path, entries and numbers are fixed, so an article can quote each comparison count exactly.',
      ],
    },

    useWhen: [
      'The article explains what happens between `open("/home/mina/notes.txt")` and the file\'s inode, and needs each directory scanned in turn with the name that matched.',
      'A reader wonders why a directory is "just a file of names and numbers", and the article wants to show a lookup that uses nothing else.',
    ],

    avoidWhen: [
      'The article is about symbolic links, mount points or `..` traversal. None appear on this path.',
      'The subject is how the inode then leads to data blocks. The walk stops at the inode number.',
      'The point is a failed lookup. Every component here is found.',
    ],

    contrastWith: [
      {
        concept: 'hardVsSoftLink',
        note: 'Both turn a name into an inode. A symbolic link adds a second lookup using the name it stores, and a hard link is simply one more entry that the same walk would find.',
      },
      {
        concept: 'inodePointsBlocks',
        note: 'Resolving a path ends with an inode number; how that inode then names the file\'s blocks is the next, separate step.',
      },
    ],
  },
};
