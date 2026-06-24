import { getDb } from "../db";

interface ActivityRow {
  id: string;
  type: string;
  action: string;
  title: string;
  url: string;
  timestamp: string;
  entity_key: string;
  metadata_json: string | null;
}

interface ActivityItem {
  id: string;
  type: "jira" | "github";
  action: string;
  title: string;
  url: string;
  timestamp: string;
  entityKey: string;
  metadata?: Record<string, any>;
}

function rowToItem(row: ActivityRow): ActivityItem {
  return {
    id: row.id,
    type: row.type as "jira" | "github",
    action: row.action,
    title: row.title,
    url: row.url,
    timestamp: row.timestamp,
    entityKey: row.entity_key,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
  };
}

export function getCachedActivities(since: string, until: string): ActivityItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM activity_cache WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp DESC",
    )
    .all(since, until) as ActivityRow[];
  return rows.map(rowToItem);
}

export function saveActivities(items: ActivityItem[]): void {
  if (items.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO activity_cache (id, type, action, title, url, timestamp, entity_key, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  db.transaction(() => {
    for (const item of items) {
      stmt.run(
        item.id,
        item.type,
        item.action,
        item.title,
        item.url,
        item.timestamp,
        item.entityKey,
        item.metadata ? JSON.stringify(item.metadata) : null,
      );
    }
  })();
}

export function purgeOldActivities(before: string): number {
  const db = getDb();
  const result = db.prepare("DELETE FROM activity_cache WHERE timestamp < ?").run(before);
  return result.changes;
}
