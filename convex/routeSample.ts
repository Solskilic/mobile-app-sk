export const DEMO_GOALS = [
  { key: "run", title: "Run a marathon", summary: "Build from easy runs to a comfortable first marathon.", weeklyHours: 4, after: [] },
  { key: "ux", title: "Become a UX designer", summary: "Explore the work, then build a portfolio for a career switch.", weeklyHours: 4, after: [] },
  { key: "art", title: "Draw again", summary: "Make drawing a small, regular part of life again.", weeklyHours: 2, after: [] },
  { key: "read", title: "Read more", summary: "Find room for books without turning them into homework.", weeklyHours: 1, after: [] },
  { key: "friends", title: "Find friends in Seattle", summary: "Become a familiar face in a local community.", weeklyHours: 2, after: [] },
];
const stop = (key: string, goalKeys: string[], title: string, why: string, effortHours: number, minWeeks: number, dependsOn: string[] = [], kind: "explore" | "build" = "build", origin: "goal" | "bridge" = "goal") => ({
  key, goalKeys, title, why, effortHours, minWeeks, dependsOn, kind, origin,
  identity: `You reached: ${title.toLowerCase()}`,
  milestone: `Reflect on your progress and confirm you've reached: ${title.toLowerCase()}.`,
});
export const DEMO_STOPS = [
  stop("run1", ["run"], "Make easy running feel familiar", "Easy, conversational runs build a base before distance.", 12, 4),
  stop("club", ["run", "friends"], "Join a beginner run club", "One regular group gives you easy miles and familiar faces in Seattle.", 6, 3, ["run1"], "build", "bridge"),
  stop("run2", ["run"], "Run a comfortable 10K", "A shorter distance lets you build confidence before a long training block.", 24, 6, ["club"]),
  stop("run3", ["run"], "Build toward your first marathon", "The long-distance phase waits until your base feels comfortable.", 72, 16, ["run2"]),
  stop("ux1", ["ux"], "Try a small design challenge", "Explore what a designer actually does before committing to a career switch.", 8, 2, [], "explore"),
  stop("sketch", ["ux", "art"], "Sketch a small app idea", "Drawing can become a way to think through a design problem.", 8, 3, ["ux1"], "build", "bridge"),
  stop("ux2", ["ux"], "Build a first case study", "A documented problem and your design decisions become portfolio material.", 30, 6, ["sketch"]),
  stop("ux3", ["ux"], "Test your portfolio with people", "Feedback from working designers reveals the gaps before applications.", 20, 4, ["ux2"]),
  stop("art1", ["art"], "Fill a few sketchbook pages", "Low-stakes sketches help you find the pleasure in drawing again.", 6, 3),
  stop("art2", ["art"], "Make a drawing you want to keep", "A small finished piece gives the habit somewhere to lead.", 12, 4, ["art1"]),
  stop("read1", ["read"], "Find a book you want to open", "Enjoyment makes a reading rhythm easier to keep.", 2, 1, [], "explore"),
  stop("read2", ["read"], "Finish one book at your pace", "A few pages at a time count; there is no daily quota to catch up.", 8, 4, ["read1"]),
  stop("friends1", ["friends"], "Turn familiar faces into plans", "A coffee after the run helps a shared activity become a friendship.", 6, 3, ["club"]),
];
export const DEMO_INPUT = "Run a marathon, become a UX designer, draw again, read more, make friends in Seattle";
