import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// DB tests for the social aggregator tables (ADR 0003). Same isolation
// pattern as spec/ics-import.test.ts: point DATA_DIR at a fresh temp dir
// BEFORE the dynamic import, since src/db.js opens its file at load time.
const scratchDir = mkdtempSync(join(tmpdir(), "social-db-test-"));
process.env.DATA_DIR = scratchDir;

// @ts-expect-error src/ is plain JS with no declaration files
const db = await import("../src/db.js");

afterAll(() => {
  // Close first: on Windows an open SQLite file blocks deleting its dir.
  try {
    db.db.close();
  } catch {
    // already closed
  }
  try {
    rmSync(scratchDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

function post(overrides: Record<string, unknown> = {}) {
  return {
    platform: "reddit",
    external_id: "t3_one",
    permalink: "https://www.reddit.com/r/canberra/comments/one/",
    author_name: null,
    author_handle: "someone",
    author_url: null,
    text: "First version",
    media_url: null,
    media_type: null,
    posted_at: "2026-10-01T00:00:00.000Z",
    event_slug: null,
    query_id: null,
    embed_html: null,
    ...overrides,
  };
}

function rowsFor(platform: string, externalId: string) {
  return db.db
    .prepare("SELECT * FROM social_posts WHERE platform = ? AND external_id = ?")
    .all(platform, externalId);
}

describe("upsertSocialPost", () => {
  it("upserting the same (platform, external_id) twice keeps one row and updates it", () => {
    db.upsertSocialPost(post());
    db.upsertSocialPost(post({ text: "Edited version" }));
    const rows = rowsFor("reddit", "t3_one");
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe("Edited version");
  });

  it("a hidden post stays hidden after a re-import", () => {
    const row = db.upsertSocialPost(post({ external_id: "t3_hide" }));
    expect(db.hideSocialPost(row.id)).toBe(true);
    // hiding twice changes nothing the second time
    expect(db.hideSocialPost(row.id)).toBe(false);

    db.upsertSocialPost(post({ external_id: "t3_hide", text: "Re-imported" }));
    const [after] = rowsFor("reddit", "t3_hide");
    expect(after.hidden_at).not.toBeNull();
    expect(after.text).toBe("Re-imported");
    const visible = db.listSocialPosts({ limit: 200 }).map((p: { id: number }) => p.id);
    expect(visible).not.toContain(row.id);
  });

  it("a re-import with event_slug/query_id null keeps the existing values", () => {
    // welcome-mixer is seeded on first boot; event_slug is a real FK.
    const query = db.addSocialQuery({ platform: "reddit", kind: "keyword", value: "canberra mixer" });
    db.upsertSocialPost(post({ external_id: "t3_event", event_slug: "welcome-mixer", query_id: query.id }));
    db.upsertSocialPost(post({ external_id: "t3_event", event_slug: null, query_id: null }));
    const [row] = rowsFor("reddit", "t3_event");
    expect(row.event_slug).toBe("welcome-mixer");
    expect(row.query_id).toBe(query.id);
    expect(db.listSocialPosts({ eventSlug: "welcome-mixer" }).map((p: { external_id: string }) => p.external_id)).toEqual([
      "t3_event",
    ]);
  });
});

describe("listSocialPosts", () => {
  it("filters by platform and orders newest first", () => {
    db.upsertSocialPost(post({ platform: "mastodon", external_id: "m1", posted_at: "2026-09-01T00:00:00.000Z" }));
    db.upsertSocialPost(post({ platform: "mastodon", external_id: "m2", posted_at: "2026-09-02T00:00:00.000Z" }));
    const posts = db.listSocialPosts({ platform: "mastodon" });
    expect(posts.map((p: { external_id: string }) => p.external_id)).toEqual(["m2", "m1"]);
    expect(posts.every((p: { platform: string }) => p.platform === "mastodon")).toBe(true);
  });

  it("clamps limit to 1..200", () => {
    for (let i = 0; i < 5; i++) {
      db.upsertSocialPost(post({ platform: "youtube", external_id: `yt${i}` }));
    }
    expect(db.listSocialPosts({ platform: "youtube", limit: 2 })).toHaveLength(2);
    expect(db.listSocialPosts({ platform: "youtube", limit: 0 })).toHaveLength(1);
    expect(db.listSocialPosts({ platform: "youtube", limit: -10 })).toHaveLength(1);
    expect(db.listSocialPosts({ platform: "youtube", limit: 10_000 })).toHaveLength(5);
    expect(db.listSocialPosts({ platform: "youtube", limit: "nonsense" })).toHaveLength(5);
  });
});

describe("social_queries", () => {
  it("addSocialQuery is idempotent on (platform, kind, value)", () => {
    const a = db.addSocialQuery({ platform: "bluesky", kind: "hashtag", value: "#anu" });
    const b = db.addSocialQuery({ platform: "bluesky", kind: "hashtag", value: "#anu" });
    expect(b.id).toBe(a.id);
    expect(db.listSocialQueries().filter((q: { value: string }) => q.value === "#anu")).toHaveLength(1);
  });

  it("recordSocialQueryRun sets last_run_at, and last_error only on failure", () => {
    const q = db.addSocialQuery({ platform: "youtube", kind: "keyword", value: "canberra events" });
    db.recordSocialQueryRun(q.id, new Error("quota exceeded"));
    let row = db.listSocialQueries().find((r: { id: number }) => r.id === q.id);
    expect(row.last_run_at).not.toBeNull();
    expect(row.last_error).toBe("quota exceeded");

    db.recordSocialQueryRun(q.id, null);
    row = db.listSocialQueries().find((r: { id: number }) => r.id === q.id);
    expect(row.last_error).toBeNull();
  });
});
