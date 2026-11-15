import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('Today exposes actions and minutes without a step-limit control', () => {
  const today = readFileSync('src/app/today.tsx', 'utf8');
  expect(today).not.toMatch(/RouteStatus|Step limits|minutesCap|max.*per step/i);
  expect(today).toContain('<TaskCard');
});

test('onboarding and profile explicitly restrict this shared demo to fictional answers', () => {
  const onboarding = readFileSync('src/components/route/GrandListScreen.tsx', 'utf8');
  expect(onboarding).toContain('These are fictional demo answers');
  expect(onboarding).toContain('disabled={!confirmed}');
  expect(onboarding).toContain('profileContext(value)');
  expect(readFileSync('src/app/profile.tsx', 'utf8')).toContain('This is not a private account');
});
