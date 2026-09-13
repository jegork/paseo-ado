import type { PluginServerContext } from "@getpaseo/plugin/server";
import { create, list, overview } from "./server/pull-requests";
import { pullRequests, workItems } from "./server/search";
import { prCreate, prList, prOverview, searchPullRequests, searchWorkItems } from "./shared/ado";

export default function contribute(server: PluginServerContext) {
  server.handle(prOverview, overview);
  server.handle(prList, list);
  server.handle(prCreate, create);
  server.handle(searchWorkItems, workItems);
  server.handle(searchPullRequests, pullRequests);
  return () => {};
}
