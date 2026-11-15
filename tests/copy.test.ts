import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('active screens use functional copy instead of motivational one-liners', () => {
  const paths = [
    'src/components/route/GrandListScreen.tsx',
    'src/components/route/RouteScreen.tsx',
    'src/app/profile.tsx',
    'src/app/today.tsx',
    'src/app/goals/[id].tsx',
    'src/components/research/research-view.tsx',
    'src/components/progress-gallery.tsx',
    'src/components/run-log.tsx',
    'src/app/wins.tsx',
  ];
  const forbidden =
    /a way forward|a little closer|a little room|at your pace|one stop\. more than one goal|everything has a place|next foothold|a little look back|who you have become|your next life|your next chapter/i;
  for (const path of paths)
    expect(readFileSync(path, 'utf8'), path).not.toMatch(forbidden);
});
