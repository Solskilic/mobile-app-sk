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
import type * as goals from "../goals.js";
import type * as openai from "../openai.js";
import type * as route from "../route.js";
import type * as routeAdherence from "../routeAdherence.js";
import type * as routeAi from "../routeAi.js";
import type * as routeDemo from "../routeDemo.js";
import type * as routeEngine from "../routeEngine.js";
import type * as routeSample from "../routeSample.js";
import type * as seed from "../seed.js";
import type * as tasks from "../tasks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  goals: typeof goals;
  openai: typeof openai;
  route: typeof route;
  routeAdherence: typeof routeAdherence;
  routeAi: typeof routeAi;
  routeDemo: typeof routeDemo;
  routeEngine: typeof routeEngine;
  routeSample: typeof routeSample;
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
