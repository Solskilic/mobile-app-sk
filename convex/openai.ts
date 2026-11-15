const MODEL = process.env.OPENAI_MODEL ?? "gpt-6.1-terra";

type Schema = Record<string, unknown>;

export const str = (description?: string): Schema =>
  description ? { type: "string", description } : { type: "string" };
export const num = (description?: string): Schema =>
  description ? { type: "number", description } : { type: "number" };
export const arr = (items: Schema, description?: string): Schema =>
  description ? { type: "array", items, description } : { type: "array", items };
export const oneOf = (values: string[]): Schema => ({ type: "string", enum: values });
export const obj = (properties: Record<string, Schema>): Schema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const SYSTEM = `You are the planning brain of a calm, big-picture goal app. You are honest, warm and concise.
You never produce to-do overload: tasks are small and few. Identities beat checklists ("You're a 25-mile runner now").
Write in plain, friendly English. No emojis.`;

export async function askJson<T>(name: string, schema: Schema, prompt: string): Promise<T> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set on the Convex deployment");
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = (await res.json()) as {
    output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  };
  for (const item of body.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "refusal") throw new Error(`OpenAI refused: ${part.refusal}`);
      if (part.type === "output_text" && part.text) return JSON.parse(part.text) as T;
    }
  }
  throw new Error("OpenAI returned no structured output");
}
