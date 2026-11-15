/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as career from "../career.js";
import type * as careerResearch from "../careerResearch.js";
import type * as careerTypes from "../careerTypes.js";
import type * as goals from "../goals.js";
import type * as openai from "../openai.js";
import type * as research from "../research.js";
import type * as researchAgent from "../researchAgent.js";
import type * as researchTypes from "../researchTypes.js";
import type * as researchWeb from "../researchWeb.js";
import type * as seed from "../seed.js";
import type * as tasks from "../tasks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  career: typeof career;
  careerResearch: typeof careerResearch;
  careerTypes: typeof careerTypes;
  goals: typeof goals;
  openai: typeof openai;
  research: typeof research;
  researchAgent: typeof researchAgent;
  researchTypes: typeof researchTypes;
  researchWeb: typeof researchWeb;
  seed: typeof seed;
  tasks: typeof tasks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
