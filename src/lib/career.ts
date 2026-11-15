import type { CareerPath, Outcome } from '../../convex/careerTypes';

export const DEMO_KEY = 'career-lab-single-user';
export const EMPTY = { dilemma: '', energy: '', drain: '', constraints: '', context: '' };
export const EXAMPLE = { dilemma: 'I studied biology. I’m torn between UX design and science communication before paying to retrain.', energy: 'Explaining our lab project to visitors. I loved making a complicated idea click.', drain: 'Repeating the same lab protocol alone all afternoon.', constraints: 'US, remote if possible. Four hours a week, no paid course yet. I can spare 20 minutes today.', context: '' };

export function workSample(kind: CareerPath['kind']) {
  if (kind === 'design') return { title: 'Make a confusing screen clearer', brief: 'A fictional clinic asks people to book an appointment. Its screen says “Select service code”, shows 24 unexplained codes, and only reveals the price after sign-up.', steps: ['3 min · Read the brief. Who might get stuck?', '12 min · Write three changes and sketch the new flow in words.', '5 min · Explain one trade-off. What would you test with a person?'], placeholder: 'Who gets stuck? My three changes… One trade-off…' };
  if (kind === 'explain') return { title: 'Make a finding make sense', brief: 'Fictional study, not medical advice: 40 seedlings were randomly split into two groups. After two weeks, the group near a window was taller on average. Water and soil were kept the same. Only one plant species was tested.', steps: ['3 min · Read the fictional finding.', '12 min · Explain it in 120 words for a curious teenager.', '5 min · Add a headline and one limitation. Avoid claiming it proves anything about all plants.'], placeholder: 'My headline… My explanation… What we still don’t know…' };
  if (kind === 'analyse') return { title: 'Find the question behind the numbers', brief: 'Fictional library: Monday had 80 visitors and 8 help requests; Tuesday 40 and 12; Wednesday 100 and 10. A manager says Wednesday needs the most help staff.', steps: ['3 min · Read the tiny dataset.', '12 min · Write a recommendation and two alternative explanations.', '5 min · Name the missing information you would ask for.'], placeholder: 'I would recommend… Another explanation… Missing information…' };
  if (kind === 'people') return { title: 'Untangle a real-world need', brief: 'Fictional community project: new graduates stop attending free workshops. One says “the topics sound useful, but I never know if it’s for beginners.” No one has interviewed people who left.', steps: ['3 min · Read the situation.', '12 min · Write five open questions for a participant, then a short invitation.', '5 min · Name one assumption you must not make.'], placeholder: 'My five questions… My invitation… One assumption…' };
  return { title: 'Turn a fuzzy request into a prototype', brief: 'Fictional local library wants a simple way for visitors to reserve a quiet seat. Seats are available in one-hour blocks. There is no budget for a new app yet.', steps: ['3 min · Read the request.', '12 min · Describe a paper prototype: inputs, steps, result, and one failure case.', '5 min · Explain what you would leave out of a first version.'], placeholder: 'Inputs… Steps… Result… Failure case… What I would leave out…' };
}

export function comparison(paths: CareerPath[], outcomes: Outcome[], revision: number) {
  return paths.map((path, index) => {
    const outcome = [...outcomes].reverse().find((o) => o.revision === revision && o.path === index && o.title === path.title);
    if (!outcome) return { title: path.title, change: 'Still a hypothesis. You haven’t tried this work yet.', next: 'Try the work sample before comparing training options.' };
    const change = outcome.feeling === 'energizing'
      ? 'Your work sample felt energizing. That gives this path a reason for another small test, not a verdict.'
      : outcome.feeling === 'draining'
        ? 'Your work sample felt draining. That challenges the initial hypothesis; try a different task before paying to retrain.'
        : 'Your work sample felt mixed. The appeal and the friction both deserve another test.';
    return { title: path.title, change, next: `You noticed: “${outcome.surprise}”` };
  });
}
