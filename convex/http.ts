import { httpRouter } from "convex/server";
import {
  getNextJob,
  submitJobResult,
  submitScriptResult,
  submitClipPipelineResult,
  submitClipPostMeta,
  submitSourceVideo,
} from "./generationJobs";

/**
 * Routes HTTP pour le worker Python local (auth par clé secrète).
 * Base URL : NEXT_PUBLIC_CONVEX_SITE_URL (ex. https://xxx.convex.site)
 */
const http = httpRouter();

http.route({
  path: "/worker/getNextJob",
  method: "GET",
  handler: getNextJob,
});

http.route({
  path: "/worker/submitJobResult",
  method: "POST",
  handler: submitJobResult,
});

http.route({
  path: "/worker/submitScriptResult",
  method: "POST",
  handler: submitScriptResult,
});

http.route({
  path: "/worker/submitClipPipelineResult",
  method: "POST",
  handler: submitClipPipelineResult,
});

http.route({
  path: "/worker/submitClipPostMeta",
  method: "POST",
  handler: submitClipPostMeta,
});

http.route({
  path: "/worker/submitSourceVideo",
  method: "POST",
  handler: submitSourceVideo,
});

export default http;
