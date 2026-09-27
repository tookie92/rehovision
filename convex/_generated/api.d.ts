/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as generationJobs from "../generationJobs.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_imagePrompt from "../lib/imagePrompt.js";
import type * as lib_plans from "../lib/plans.js";
import type * as lib_scriptPrompt from "../lib/scriptPrompt.js";
import type * as lib_workerAuth from "../lib/workerAuth.js";
import type * as studios from "../studios.js";
import type * as usage from "../usage.js";
import type * as videoProjects from "../videoProjects.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  generationJobs: typeof generationJobs;
  health: typeof health;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/imagePrompt": typeof lib_imagePrompt;
  "lib/plans": typeof lib_plans;
  "lib/scriptPrompt": typeof lib_scriptPrompt;
  "lib/workerAuth": typeof lib_workerAuth;
  studios: typeof studios;
  usage: typeof usage;
  videoProjects: typeof videoProjects;
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
