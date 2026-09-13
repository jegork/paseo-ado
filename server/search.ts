import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { searchPullRequests, searchWorkItems } from "../shared/ado";
import { az, orgFromApiUrl, stripHtml } from "./az";
import { toSummary } from "./pull-requests";

interface AzWorkItem {
  id: number;
  url: string;
  fields: Record<string, unknown> & {
    "System.Title"?: string;
    "System.WorkItemType"?: string;
    "System.State"?: string;
    "System.TeamProject"?: string;
    "System.Description"?: string;
    "System.AssignedTo"?: { displayName: string } | string;
    "Microsoft.VSTS.Common.AcceptanceCriteria"?: string;
  };
}

const WORK_ITEM_FIELDS =
  "[System.Id], [System.Title], [System.WorkItemType], [System.State], [System.TeamProject], [System.AssignedTo]";

function wiqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function assignee(item: AzWorkItem): string {
  const value = item.fields["System.AssignedTo"];
  if (!value) return "Unassigned";
  return typeof value === "string" ? value : value.displayName;
}

function workItemUrl(item: AzWorkItem): string {
  const project = encodeURIComponent(item.fields["System.TeamProject"] ?? "");
  return `${orgFromApiUrl(item.url)}/${project}/_workitems/edit/${item.id}`;
}

export async function workItems({ query }: RpcInput<typeof searchWorkItems>): Promise<RpcOutput<typeof searchWorkItems>> {
  const trimmed = query.trim();
  const where = /^\d+$/.test(trimmed)
    ? `[System.Id] = ${trimmed}`
    : trimmed
      ? `[System.Title] CONTAINS '${wiqlLiteral(trimmed)}'`
      : "[System.ChangedDate] > @Today - 30";
  const found = await az<AzWorkItem[]>([
    "boards", "query", "--wiql",
    `SELECT ${WORK_ITEM_FIELDS} FROM WorkItems WHERE ${where} ORDER BY [System.ChangedDate] DESC`,
  ]);
  // wiql only returns the selected scalar fields, and description needs one call per item, so keep the batch small
  const top = found.slice(0, 8);
  const detailed = await Promise.all(
    top.map((item) => az<AzWorkItem>(["boards", "work-item", "show", "--id", String(item.id)]).catch(() => item)),
  );
  return {
    items: detailed.map((item) => {
      const title = item.fields["System.Title"] ?? `Work item ${item.id}`;
      const type = item.fields["System.WorkItemType"] ?? "Work item";
      const state = item.fields["System.State"] ?? "";
      const url = workItemUrl(item);
      const description = stripHtml(item.fields["System.Description"]);
      const acceptance = stripHtml(item.fields["Microsoft.VSTS.Common.AcceptanceCriteria"]);
      const text = [
        `${type} #${item.id}: ${title}`,
        `State: ${state}`,
        `Assigned to: ${assignee(item)}`,
        `URL: ${url}`,
        description ? `\n${description}` : "",
        acceptance ? `\nAcceptance criteria:\n${acceptance}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      return {
        id: String(item.id),
        identifier: `#${item.id}`,
        title,
        subtitle: [type, state].filter(Boolean).join(" · "),
        url,
        text,
        resourceType: "work-item",
      };
    }),
  };
}

interface AzPullRequestWithBody {
  pullRequestId: number;
  description?: string | null;
}

export async function pullRequests({ query }: RpcInput<typeof searchPullRequests>): Promise<RpcOutput<typeof searchPullRequests>> {
  const trimmed = query.trim();
  const byId = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  const raw = byId !== null
    ? [await az<Parameters<typeof toSummary>[0] & AzPullRequestWithBody>(["repos", "pr", "show", "--id", String(byId)])]
    : await az<(Parameters<typeof toSummary>[0] & AzPullRequestWithBody)[]>([
        "repos", "pr", "list", "--status", "active", "--top", "100",
      ]);
  const needle = trimmed.toLowerCase();
  const matches = byId !== null || !needle
    ? raw
    : raw.filter((pr) => pr.title.toLowerCase().includes(needle) || pr.repository.name.toLowerCase().includes(needle));
  return {
    items: matches.slice(0, 20).map((pr) => {
      const summary = toSummary(pr);
      const text = [
        `Pull request !${summary.id}: ${summary.title}`,
        `Repository: ${pr.repository.name}`,
        `${summary.sourceBranch} → ${summary.targetBranch}`,
        `Author: ${summary.createdBy}`,
        `Status: ${summary.isDraft ? "draft" : summary.status}`,
        `URL: ${summary.url}`,
        pr.description ? `\n${pr.description}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      return {
        id: String(summary.id),
        identifier: `!${summary.id}`,
        title: summary.title,
        subtitle: `${pr.repository.name} · ${summary.createdBy}`,
        url: summary.url,
        text,
        resourceType: "pull-request",
      };
    }),
  };
}
