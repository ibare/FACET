/**
 * hardVsSoftLink 개념 선언.
 *
 * canonical facet 은 `facet:hardVsSoftLink` — 디렉터리 `docs` 의 `report.txt` 와 `backup.txt` 는 둘 다 inode 23(링크 수 2)을
 * 가리키고, `latest` 는 이름 `report.txt` 를 적어 둔 심볼릭 링크 inode 40 을 가리킨다. `report.txt` 를 지운 뒤 같은 두 찾기를
 * 되풀이하면 `backup.txt` 는 여전히 닿고 `latest` 는 빈자리에서 끊긴다. 여덟 걸음, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `pathResolution` 도 이름에서 inode 로 간다. 이쪽의 주장은 찾는 길이 아니라 **원래 이름을 지웠을 때 두 링크가 갈리는
 * 것** 하나다. 그래서 definition 은 same inode number · stores a name · deleting the original · link count 쪽 낱말을 쥔다.
 *
 * 전제: inode 번호와 이름은 예로 정한 값이다. 링크 수가 0 이고 연 프로세스가 없어야 거둔다(화면에서는 1 까지만 준다).
 * 짧은 심볼릭 링크는 이름을 inode 안에 바로 담기도 한다(ext4 fast symlink).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hardVsSoftLinkConcept: FacetConceptSource = {
  id: 'hardVsSoftLink',
  label: 'Hard Link vs Symbolic Link',
  canonicalFacet: 'facet:hardVsSoftLink',

  surface: {
    definition:
      'A hard link is another directory entry with the same inode number, while a symbolic link is its own inode that stores a name; deleting the original name leaves the hard link working and breaks the symbolic one.',
    exemplarKeywords: [
      'ln vs ln -s',
      'symlink',
      'soft link',
      'dangling symlink',
      'broken symbolic link',
      'link count',
      'unlink',
      'ls -i inode number',
      'hard link across file systems',
      'shortcut vs hard link',
    ],
  },

  briefing: {
    observable: [
      'Directory `docs` lists three names: `report.txt` → 23, `backup.txt` → 23, `latest` → 40. inode 23 reads "Links: 2 · regular file"; inode 40 reads "Links: 1 · symbolic link · Written name: report.txt".',
      'First both links are followed. "backup.txt → inode 23: regular file" arrives in one step. `latest` needs two: "latest → inode 40: symbolic link. Written name: report.txt", then "Look up again in docs: report.txt → inode 23".',
      'Then `report.txt` is deleted: "Entry report.txt removed. Links of inode 23: 1". The entry disappears from the list; inode 23 and its data stay.',
      'The same two lookups are repeated. `backup.txt` still reaches inode 23. `latest` again reads its stored name and looks it up, ending in "report.txt → no entry. The link is broken." What broke is the name, not the file.',
      'inode numbers and names are example values. The file system reclaims an inode only when its link count reaches 0 and no process has it open; here the count stops at 1. On a real system `ls -i` shows inode numbers, the second column of `ls -l` shows the link count, and `ln` and `ln -s` create the two kinds.',
    ],

    screen: {
      affordances: [
        'The screen plays eight steps by itself: two lookups, the deletion, the same two lookups again, ending on the broken link.',
        'A Replay button and a playback strip sit below it. Dragging the strip between the first and second `latest` lookup sets the working and the broken symbolic link side by side.',
        'Names and numbers are fixed, so an article can quote every line exactly.',
      ],
    },

    useWhen: [
      'The article explains why deleting a file can leave a symbolic link dangling but never a hard link, and needs the link count dropping from 2 to 1 alongside the failed name lookup.',
      'A reader thinks one of two hard links is the "original" and the other a copy, and the article needs both names pointing at one inode with neither privileged.',
    ],

    avoidWhen: [
      'The article is about links across file systems or to directories. Everything here sits in one directory of one file system.',
      'The subject is copying a file. No data is duplicated at any step.',
      'The point is permissions or ownership of links. None are shown.',
    ],

    contrastWith: [
      {
        concept: 'pathResolution',
        note: 'Resolving a path finds one name after another down a tree. A symbolic link adds a lookup of a stored name on top of that, which is why it can fail when the name is gone.',
      },
      {
        concept: 'refcountZero',
        note: 'A file\'s link count works as a reference count on the inode: removing a name decrements it, and the file is reclaimed only at zero.',
      },
      {
        concept: 'danglingReference',
        note: 'Both leave something pointing at nothing, but a broken symbolic link points at a missing name that can be recreated, while a dangling reference points at storage that was released and reused, so it yields wrong data instead of a clean failure.',
      },
    ],
  },
};
