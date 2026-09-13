import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { prCreate, prOverview, type PipelineRun, type ReviewComment } from "../shared/ado";
import { openExternal } from "./web";

function runColor(run: PipelineRun, colors: PluginWorkspacePanelProps["theme"]["colors"]): string {
  if (run.result === "succeeded") return colors.statusSuccess;
  if (run.result === "failed" || run.result === "canceled") return colors.statusDanger;
  if (run.result === "partiallySucceeded") return colors.statusWarning;
  return colors.foregroundMuted;
}

function voteLabel(vote: number): string {
  if (vote >= 10) return "approved";
  if (vote === 5) return "approved with suggestions";
  if (vote === -5) return "waiting for author";
  if (vote <= -10) return "rejected";
  return "no vote";
}

function formatDate(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 16).replace("T", " ");
}

export function PullRequestPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const cwd = useWorkspace(workspaceId, (workspace) => workspace.directory);
  const fetchOverview = useRpc(prOverview);
  const createPr = useRpc(prCreate);
  const toast = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["ado", "overview", cwd];
  const overview = useQuery({
    queryKey,
    queryFn: () => fetchOverview({ cwd: cwd! }),
    enabled: !!cwd,
    refetchInterval: 60_000,
  });
  const creation = useMutation({
    mutationFn: () => createPr({ cwd: cwd! }),
    onSuccess: (pr) => {
      toast.show(`Created PR !${pr.id}`, { variant: "success" });
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });

  const styles = useMemo(() => {
    const pad = layout.compact ? 12 : 20;
    return {
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: { padding: pad, gap: pad },
      row: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      title: { color: theme.colors.foreground, fontSize: layout.compact ? 16 : 18, fontWeight: "600" as const, flexShrink: 1 },
      body: { color: theme.colors.foreground, fontSize: 14 },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      section: { color: theme.colors.foregroundMuted, fontSize: 12, textTransform: "uppercase" as const, letterSpacing: 0.5 },
      card: { backgroundColor: theme.colors.surface1, borderRadius: 10, padding: 12, gap: 6, borderWidth: 1, borderColor: theme.colors.border },
      button: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: theme.colors.accent, alignSelf: "flex-start" as const },
      buttonText: { color: theme.colors.accentForeground, fontSize: 13, fontWeight: "600" as const },
      ghost: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, alignSelf: "flex-start" as const },
      ghostText: { color: theme.colors.foreground, fontSize: 13 },
      danger: { color: theme.colors.statusDanger, fontSize: 13 },
    };
  }, [theme, layout.compact]);

  const data = overview.data;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.row}>
        <Icon name="GitBranch" size={16} color={theme.colors.foregroundMuted} />
        <Text style={styles.muted}>{data?.branch ?? "…"}</Text>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh" onPress={() => void overview.refetch()}>
          <Icon name="RefreshCw" size={16} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>

      {overview.isLoading ? <Text style={styles.muted}>Loading pull request…</Text> : null}
      {overview.error ? (
        <Text style={styles.danger}>{overview.error instanceof Error ? overview.error.message : String(overview.error)}</Text>
      ) : null}

      {data && !data.pr ? (
        <View style={styles.card}>
          <Text style={styles.body}>No active pull request for this branch.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create pull request"
            style={styles.button}
            disabled={creation.isPending}
            onPress={() => creation.mutate()}
          >
            <Text style={styles.buttonText}>{creation.isPending ? "Creating…" : "Create pull request"}</Text>
          </Pressable>
        </View>
      ) : null}

      {data?.pr ? (
        <>
          <View style={styles.card}>
            <View style={styles.row}>
              <Icon name="GitPullRequest" size={18} color={theme.colors.accent} />
              <Text style={styles.title} numberOfLines={2}>
                !{data.pr.id} {data.pr.title}
              </Text>
            </View>
            <Text style={styles.muted}>
              {data.pr.sourceBranch} → {data.pr.targetBranch}
            </Text>
            <Text style={styles.muted}>
              {data.pr.isDraft ? "Draft · " : ""}
              {data.pr.status} · {data.pr.createdBy} · {formatDate(data.pr.createdAt)}
            </Text>
            {data.pr.reviewers.length > 0 ? (
              <Text style={styles.muted}>
                {data.pr.reviewers.map((r) => `${r.name}: ${voteLabel(r.vote)}`).join(" · ")}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open in Azure DevOps"
              style={styles.ghost}
              onPress={() => void openExternal(data.pr!.url)}
            >
              <Text style={styles.ghostText}>Open in Azure DevOps</Text>
            </Pressable>
          </View>

          <Text style={styles.section}>Pipelines</Text>
          {data.runs.length === 0 ? <Text style={styles.muted}>No pipeline runs for this PR.</Text> : null}
          {data.runs.map((run, index) => (
            <Pressable
              key={`${run.pipeline}-${index}`}
              accessibilityRole={run.url ? "link" : "text"}
              disabled={!run.url}
              onPress={() => run.url && void openExternal(run.url)}
              style={styles.card}
            >
              <View style={styles.row}>
                <Icon name="Workflow" size={14} color={runColor(run, theme.colors)} />
                <Text style={styles.body} numberOfLines={1}>
                  {run.pipeline}
                </Text>
              </View>
              <Text style={{ ...styles.muted, color: runColor(run, theme.colors) }}>
                {run.result ?? run.status}
                {run.finished ? ` · ${formatDate(run.finished)}` : ""}
              </Text>
            </Pressable>
          ))}

          <Text style={styles.section}>Review comments</Text>
          {data.comments.length === 0 ? <Text style={styles.muted}>No review comments.</Text> : null}
          {data.comments.map((comment: ReviewComment, index) => (
            <View key={index} style={styles.card}>
              <Text style={styles.muted}>
                {comment.file ?? "general"} · {comment.author} · {formatDate(comment.date)}
                {comment.resolved ? " · resolved" : ""}
              </Text>
              <Text selectable style={styles.body}>
                {comment.content}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
