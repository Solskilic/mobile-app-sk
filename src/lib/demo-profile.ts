import type { DemoProfile } from '../../convex/demoProfileTypes';

export const DEMO_NOTICE =
  'Shared demo · fictional details only. Anyone using this demo can read saved answers.';
export const DEMO_EXAMPLES: {
  label: string;
  goal: string;
  profile: DemoProfile;
  location?: string;
  role?: string;
}[] = [
  {
    label: 'Career pivot',
    goal: 'I want to pivot to investment banking.',
    location: 'London, UK',
    role: 'Analyst; compare entry requirements before choosing',
    profile: {
      fictional: true,
      startingPoint:
        'Fictional example: economics graduate with one year in operations, Excel basics and no banking experience.',
      motivation:
        'Try analytical finance work before committing to a career change.',
      constraints:
        'Two weekday evenings and a short weekend session. No MBA assumed.',
      structure: 'flexible',
      weeklyHours: 6,
    },
  },
  {
    label: 'Half marathon',
    goal: 'Train for my first half marathon, starting from comfortable 5K runs\nMake friends in Seattle through a regular group activity',
    profile: {
      fictional: true,
      startingPoint:
        'Fictional example: works weekdays and runs a comfortable 5K twice a week.',
      motivation:
        'Complete a first longer race and find a regular local group.',
      constraints: 'Short weekday evenings and one weekend slot.',
      structure: 'routine',
      weeklyHours: 4,
    },
  },
  {
    label: 'Learn an instrument',
    goal: 'Learn guitar as a complete beginner. Play my first simple song. I can practise for ten minutes at a time.',
    profile: {
      fictional: true,
      startingPoint:
        'Fictional example: recent graduate, no guitar experience.',
      motivation: 'Play songs for enjoyment, without preparing for an exam.',
      constraints:
        'Ten-minute sessions on weekday evenings; schedule changes week to week.',
      structure: 'flexible',
      weeklyHours: 2,
    },
  },
];

export const EMPTY_DEMO_PROFILE: DemoProfile = {
  fictional: true,
  startingPoint: 'Not sure',
  motivation: '',
  constraints: '',
  structure: 'flexible',
  weeklyHours: 6,
};
