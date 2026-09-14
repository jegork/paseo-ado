import type { PluginServerContext } from "@getpaseo/plugin/server";
import { create, list, overview } from "./server/pull-requests";
import { failure } from "./server/runs";
import { pullRequests, workItems } from "./server/search";
import { prCreate, prList, prOverview, runFailure, searchPullRequests, searchWorkItems } from "./shared/ado";

export default function contribute(server: PluginServerContext) {
  server.handle(prOverview, overview);
  server.handle(prList, list);
  server.handle(prCreate, create);
  server.handle(runFailure, failure);
  server.handle(searchWorkItems, workItems);
  server.handle(searchPullRequests, pullRequests);
  return () => {};
}
