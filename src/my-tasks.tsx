import { useEffect, useState } from "react";
import { useLocalStorage } from "@raycast/utils";
import TurndownService from "turndown";
import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  Detail,
  Icon,
  List,
  getPreferenceValues,
  showToast,
  Toast,
  Image,
} from "@raycast/api";

type Preferences = { apiKey: string; showCompletedTasks: boolean };

type Assignee = { id: number; name: string; avatar_url: string | null };
type Status = { id: number; name: string; icon: string | null; color: string | null; category: string };
type Task = {
  id: number;
  workspace_id: number;
  list_id: number | null;
  title: string;
  description: string | null;
  priority: string;
  identifier: number;
  due_date: string | null;
  start_date: string | null;
  created_at: string;
  status: Status | null;
  assignees: Assignee[];
};
type Workspace = { id: number; name: string; slug: string };
type Me = { id: number; name: string };

const BASE_URL = "https://api.getarca.app/api/v1";

const PRIORITY_COLOR: Record<string, Color> = {
  urgent: Color.Red,
  high: Color.SecondaryText,
  medium: Color.SecondaryText,
  low: Color.SecondaryText,
  none: Color.SecondaryText,
};

const PRIORITY_ICON: Record<string, Icon> = {
  urgent: Icon.FullSignal,
  high: Icon.Signal3,
  medium: Icon.Signal2,
  low: Icon.Signal1,
  none: Icon.Signal0,
};

const STATUS_CATEGORY_COLOR: Record<string, Color> = {
  pending: Color.SecondaryText,
  in_progress: Color.Orange,
  completed: Color.Green,
  cancelled: Color.Red,
};

const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });

function htmlToMarkdown(html: string): string {
  return turndown.turndown(html).trim();
}

async function fetchTaskDescription(taskId: number, apiKey: string): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.description ?? null;
}

function taskRef(task: Task, slugMap: Map<number, string>): string {
  const slug = slugMap.get(task.workspace_id);
  return slug ? `${slug.toUpperCase()}-${task.identifier}` : `#${task.identifier}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function TaskDetail({
  task: initialTask,
  slugMap,
  apiKey,
}: {
  task: Task;
  slugMap: Map<number, string>;
  apiKey: string;
}) {
  const [task, setTask] = useState<Task>(initialTask);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE_URL}/tasks/${initialTask.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setTask(data);
      })
      .finally(() => setIsLoading(false));
  }, [initialTask.id]);

  const priority = task.priority || "none";

  const description = task.description ? htmlToMarkdown(task.description) : "_No description_";

  const markdown = `
## ${task.title}

${description}
`.trim();

  return (
    <Detail
      isLoading={isLoading}
      navigationTitle={task.title}
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Priority">
            <Detail.Metadata.TagList.Item
              text={priority.charAt(0).toUpperCase() + priority.slice(1)}
              color={PRIORITY_COLOR[priority] ?? Color.SecondaryText}
            />
          </Detail.Metadata.TagList>
          {task.status && (
            <Detail.Metadata.TagList title="Status">
              <Detail.Metadata.TagList.Item
                text={task.status.name}
                color={STATUS_CATEGORY_COLOR[task.status.category] ?? Color.SecondaryText}
              />
            </Detail.Metadata.TagList>
          )}
          <Detail.Metadata.Label title="Due date" text={formatDate(task.due_date)} />
          <Detail.Metadata.Label title="Start date" text={formatDate(task.start_date)} />
          <Detail.Metadata.Separator />
          {task.assignees.map((a) => (
            <Detail.Metadata.Label
              key={a.id}
              title="Assignee"
              text={a.name}
              icon={
                a.avatar_url
                  ? { source: a.avatar_url, mask: Image.Mask.Circle }
                  : { source: Icon.Person, tintColor: Color.SecondaryText }
              }
            />
          ))}
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Identifier" text={taskRef(task, slugMap)} />
          <Detail.Metadata.Label title="Created" text={formatDate(task.created_at)} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.OpenInBrowser
            title="Open in Arca"
            url={`https://web.getarca.app/task?id=${task.id}`}
            icon={Icon.Globe}
          />
          <ActionPanel.Section title="Copy">
            <Action.CopyToClipboard
              title="Copy Full ID"
              content={taskRef(task, slugMap)}
              shortcut={{ modifiers: ["cmd"], key: "i" }}
            />
            <Action.CopyToClipboard title="Copy ID" content={String(task.identifier)} />
            <Action.CopyToClipboard
              title="Copy Title"
              content={task.title}
              shortcut={{ modifiers: ["cmd"], key: "t" }}
            />
            <Action.CopyToClipboard
              title="Copy Description"
              content={task.description ? htmlToMarkdown(task.description) : ""}
              shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
            />
            <Action.CopyToClipboard
              title="Copy as Prompt"
              content={`Start implementation of the following Arca task:\n\nTask ID: ${taskRef(task, slugMap)}\nTask Title: ${task.title}\n\nDescription:\n${task.description ? htmlToMarkdown(task.description) : "N/A"}`}
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

const PRIORITY_ORDER = ["urgent", "high", "medium", "low", "none"] as const;
const DONE_CATEGORIES = new Set(["done", "completed", "cancelled"]);
const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
};

function TaskItem({
  task,
  slugMap,
  apiKey,
  showCompleted,
  onToggleCompleted,
}: {
  task: Task;
  slugMap: Map<number, string>;
  apiKey: string;
  showCompleted: boolean;
  onToggleCompleted: () => void;
}) {
  const priority = task.priority || "none";

  const accessories: List.Item.Accessory[] = [];
  if (task.status) {
    accessories.push({
      tag: {
        value: task.status.name,
        color: STATUS_CATEGORY_COLOR[task.status.category] ?? Color.SecondaryText,
      },
    });
  }
  for (const a of task.assignees.slice(0, 3)) {
    accessories.push({
      icon: a.avatar_url
        ? { source: a.avatar_url, mask: Image.Mask.Circle }
        : { source: Icon.Person, tintColor: Color.SecondaryText },
      tooltip: a.name,
    });
  }

  return (
    <List.Item
      key={task.id}
      title={task.title}
      subtitle={taskRef(task, slugMap)}
      keywords={[taskRef(task, slugMap)]}
      icon={{ source: PRIORITY_ICON[priority], tintColor: PRIORITY_COLOR[priority] ?? Color.SecondaryText }}
      accessories={accessories}
      actions={
        <ActionPanel>
          <Action.Push
            title="View Details"
            icon={Icon.Eye}
            target={<TaskDetail task={task} slugMap={slugMap} apiKey={apiKey} />}
          />
          <Action.OpenInBrowser
            title="Open in Arca"
            url={`https://web.getarca.app/task?id=${task.id}`}
            icon={Icon.Globe}
          />
          <ActionPanel.Section title="Copy">
            <Action.CopyToClipboard
              title="Copy Full ID"
              content={taskRef(task, slugMap)}
              shortcut={{ modifiers: ["cmd"], key: "i" }}
            />
            <Action.CopyToClipboard title="Copy ID" content={String(task.identifier)} />
            <Action.CopyToClipboard
              title="Copy Title"
              content={task.title}
              shortcut={{ modifiers: ["cmd"], key: "t" }}
            />
            <Action
              title="Copy Description"
              icon={Icon.Clipboard}
              shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
              onAction={async () => {
                const toast = await showToast({ style: Toast.Style.Animated, title: "Fetching description…" });
                const html = await fetchTaskDescription(task.id, apiKey);
                if (html == null) {
                  toast.style = Toast.Style.Failure;
                  toast.title = "Failed to fetch description";
                  return;
                }
                await Clipboard.copy(html ? htmlToMarkdown(html) : "");
                toast.style = Toast.Style.Success;
                toast.title = "Copied description";
              }}
            />
            <Action
              title="Copy as Prompt"
              icon={Icon.Clipboard}
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
              onAction={async () => {
                const toast = await showToast({ style: Toast.Style.Animated, title: "Fetching description…" });
                const html = await fetchTaskDescription(task.id, apiKey);

                const description = html ? htmlToMarkdown(html) : "N/A";
                await Clipboard.copy(
                  `Start implementation of the following Arca task:\n\nTask ID: ${taskRef(task, slugMap)}\nTask Title: ${task.title}\n\nDescription:\n${description}`,
                );
                toast.style = Toast.Style.Success;
                toast.title = "Copied prompt";
              }}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title={showCompleted ? "Hide Completed Tasks" : "Show Completed Tasks"}
              icon={showCompleted ? Icon.EyeDisabled : Icon.Eye}
              shortcut={{ modifiers: ["cmd", "shift"], key: "h" }}
              onAction={onToggleCompleted}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const { apiKey, showCompletedTasks } = getPreferenceValues<Preferences>();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [slugMap, setSlugMap] = useState<Map<number, string>>(new Map());
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("all");
  const { value: showCompleted, setValue: setShowCompleted } = useLocalStorage("showCompleted", showCompletedTasks);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // 1. Get current user
        const meRes = await fetch(`${BASE_URL}/me`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!meRes.ok) throw new Error("Failed to fetch current user");
        const me: Me = await meRes.json();

        // 2. Get all workspaces
        const wsRes = await fetch(`${BASE_URL}/workspaces`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!wsRes.ok) throw new Error("Failed to fetch workspaces");
        const loadedWorkspaces: Workspace[] = await wsRes.json();
        setWorkspaces(loadedWorkspaces);
        setSlugMap(new Map(loadedWorkspaces.map((ws) => [ws.id, ws.slug])));

        // 3. For each workspace, fetch tasks assigned to me (all pages)
        const allTasks: Task[] = [];
        await Promise.all(
          loadedWorkspaces.map(async (ws) => {
            let page = 1;
            while (true) {
              const res = await fetch(
                `${BASE_URL}/workspaces/${ws.id}/tasks?assignee_id=${me.id}&limit=100&page=${page}`,
                { headers: { Authorization: `Bearer ${apiKey}` } },
              );
              if (!res.ok) break;
              const data = await res.json();
              const items: Task[] = data.data || [];
              allTasks.push(...items);
              if (page >= (data.total_pages ?? 1)) break;
              page++;
            }
          }),
        );

        // Sort within each priority group: incomplete first, then by due date
        allTasks.sort((a, b) => {
          const aDone = DONE_CATEGORIES.has(a.status?.category ?? "") ? 1 : 0;
          const bDone = DONE_CATEGORIES.has(b.status?.category ?? "") ? 1 : 0;
          if (aDone !== bDone) return aDone - bDone;
          if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
          if (a.due_date) return -1;
          if (b.due_date) return 1;
          return 0;
        });

        setTasks(allTasks);
      } catch (err) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Could not load tasks",
          message: err instanceof Error ? err.message : "Request failed",
        });
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const visibleTasks = tasks
    .filter((t) => selectedWorkspaceId === "all" || String(t.workspace_id) === selectedWorkspaceId)
    .filter((t) => (showCompleted ?? false) || !DONE_CATEGORIES.has(t.status?.category ?? ""));

  const grouped = PRIORITY_ORDER.reduce(
    (acc, p) => {
      acc[p] = visibleTasks.filter((t) => (t.priority || "none") === p);
      return acc;
    },
    {} as Record<string, Task[]>,
  );

  return (
    <List
      isLoading={isLoading}
      navigationTitle="My Tasks"
      searchBarPlaceholder="Search tasks…"
      searchBarAccessory={
        <List.Dropdown tooltip="Workspace" onChange={setSelectedWorkspaceId}>
          <List.Dropdown.Item title="All Workspaces" value="all" />
          {workspaces.map((ws) => (
            <List.Dropdown.Item key={ws.id} title={ws.name} value={String(ws.id)} />
          ))}
        </List.Dropdown>
      }
    >
      {PRIORITY_ORDER.map((priority) => {
        const group = grouped[priority];
        if (!group.length) return null;
        return (
          <List.Section key={priority} title={PRIORITY_LABELS[priority]}>
            {group.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                slugMap={slugMap}
                apiKey={apiKey}
                showCompleted={showCompleted ?? false}
                onToggleCompleted={() => setShowCompleted(!(showCompleted ?? false))}
              />
            ))}
          </List.Section>
        );
      })}
    </List>
  );
}
