import { describe, test, expect } from "bun:test";
import { createService, type BrowserAdapter } from "../src/service";
import type { GroupTemplate, OpenJob, StoredData } from "../src/model";
const template = (): GroupTemplate => ({
  id: "g",
  name: "Research",
  color: "blue",
  revision: 0,
  sites: [
    { id: "1", url: "https://one.test/" },
    { id: "2", url: "https://two.test/" },
    { id: "3", url: "https://three.test/" },
  ],
});
function harness() {
  let local: unknown, job: OpenJob | undefined;
  let nextId = 0;
  const calls: unknown[][] = [];
  const api: BrowserAdapter = {
    readLocal: async () => structuredClone(local),
    writeLocal: async (data) => {
      local = structuredClone(data);
    },
    readJob: async () => structuredClone(job),
    writeJob: async (value) => {
      job = value ? structuredClone(value) : undefined;
    },
    normalWindow: async () => true,
    createTab: async (windowId, url) => {
      calls.push(["create", windowId, url]);
      return ++nextId;
    },
    groupTabs: async (windowId, ids) => {
      calls.push(["group", windowId, [...ids]]);
      return 50 + nextId;
    },
    setGroup: async (...args) => {
      calls.push(["update", ...args]);
    },
    activate: async (id) => {
      calls.push(["activate", id]);
    },
  };
  const service = createService(api);
  return {
    api,
    service,
    calls,
    setLocal: (value: unknown) => (local = value),
    setJob: (value: OpenJob) => (job = value),
    local: () => local as StoredData,
    job: () => job,
  };
}
async function finished(h: ReturnType<typeof harness>) {
  for (let i = 0; i < 100; i++) {
    if (h.job()?.status !== "running") return;
    await Bun.sleep(1);
  }
  throw new Error("Job did not finish");
}
describe("storage and opening", () => {
  test("serial saves preserve both groups and editing retains IDs/order", async () => {
    const h = harness();
    await Promise.all([
      h.service.handle({ type: "save", group: template() }),
      h.service.handle({ type: "save", group: { ...template(), id: "other" } }),
    ]);
    expect(h.local().groups.map((g) => g.id)).toEqual(["g", "other"]);
    const edited = {
      ...h.local().groups[0],
      name: "Changed",
      sites: [...template().sites].reverse(),
    };
    expect((await h.service.handle({ type: "save", group: edited })).ok).toBe(
      true,
    );
    expect(h.local().groups[0].sites.map((s) => s.id)).toEqual(["3", "2", "1"]);
    expect((await h.service.handle({ type: "save", group: edited })).ok).toBe(
      false,
    );
    expect(
      (await h.service.handle({ type: "delete", id: "g", revision: 1 })).ok,
    ).toBe(false);
    expect(
      (await h.service.handle({ type: "delete", id: "g", revision: 2 })).ok,
    ).toBe(true);
  });
  test("storage failure is reported and corrupt data is never overwritten", async () => {
    const h = harness();
    h.setLocal({ schemaVersion: 99 });
    expect(
      (await h.service.handle({ type: "save", group: template() })).ok,
    ).toBe(false);
    expect(h.local()).toEqual({ schemaVersion: 99 } as unknown as StoredData);
    h.setLocal(undefined);
    h.api.writeLocal = async () => {
      throw new Error("Quota exceeded");
    };
    expect(await h.service.handle({ type: "save", group: template() })).toEqual(
      { ok: false, error: "Quota exceeded" },
    );
  });
  test("opens in order, configures group, activates first tab, repeated opens create new tabs", async () => {
    const h = harness();
    await h.service.handle({ type: "save", group: template() });
    await h.service.handle({ type: "open", id: "g", windowId: 7 });
    await finished(h);
    expect(h.calls).toEqual([
      ["create", 7, "https://one.test/"],
      ["create", 7, "https://two.test/"],
      ["create", 7, "https://three.test/"],
      ["group", 7, [1, 2, 3]],
      ["update", 53, "Research", "blue"],
      ["activate", 1],
    ]);
    await h.service.handle({ type: "open", id: "g", windowId: 7 });
    await finished(h);
    expect(h.job()?.createdTabIds).toEqual([4, 5, 6]);
    expect(h.local().groups[0].revision).toBe(1);
  });
  test("partial failure preserves successful tabs and records failed URL", async () => {
    const h = harness();
    await h.service.handle({ type: "save", group: template() });
    const original = h.api.createTab;
    h.api.createTab = async (w, url) => {
      if (url.includes("two")) throw new Error("Cannot open");
      return original(w, url);
    };
    await h.service.handle({ type: "open", id: "g", windowId: 7 });
    await finished(h);
    expect(h.job()?.createdTabIds).toEqual([1, 2]);
    expect(h.job()?.failures[0].url).toBe("https://two.test/");
    expect(h.calls.find((c) => c[0] === "group")).toEqual(["group", 7, [1, 2]]);
  });
  test("all failures create no group and activate no tab", async () => {
    const h = harness();
    await h.service.handle({ type: "save", group: template() });
    h.api.createTab = async () => {
      throw new Error("No tabs");
    };
    await h.service.handle({ type: "open", id: "g", windowId: 7 });
    await finished(h);
    expect(h.calls).toEqual([]);
    expect(h.job()?.failures).toHaveLength(3);
  });
  test("grouping, updating and activation failures are reported independently", async () => {
    for (const stage of ["groupTabs", "setGroup", "activate"] as const) {
      const h = harness();
      await h.service.handle({ type: "save", group: template() });
      h.api[stage] = async () => {
        throw new Error(stage);
      };
      await h.service.handle({ type: "open", id: "g", windowId: 7 });
      await finished(h);
      expect(h.job()?.errors).toHaveLength(1);
      expect(h.job()?.createdTabIds).toHaveLength(3);
      if (stage !== "activate") expect(h.calls.at(-1)).toEqual(["activate", 1]);
    }
  });
  test("rejects concurrent opens and snapshots templates before editing", async () => {
    const h = harness();
    await h.service.handle({ type: "save", group: template() });
    let release!: () => void;
    const wait = new Promise<void>((r) => (release = r)),
      original = h.api.createTab;
    h.api.createTab = async (w, url) => {
      await wait;
      return original(w, url);
    };
    await h.service.handle({ type: "open", id: "g", windowId: 7 });
    expect(
      (await h.service.handle({ type: "open", id: "g", windowId: 7 })).ok,
    ).toBe(false);
    await h.service.handle({
      type: "save",
      group: {
        ...template(),
        revision: 1,
        name: "Edited",
        sites: [{ id: "new", url: "https://new.test/" }],
      },
    });
    release();
    await finished(h);
    expect(h.job()?.createdTabIds).toHaveLength(3);
    expect(h.job()?.name).toBe("Research");
  });
  test("recovers interrupted work without creating additional tabs", async () => {
    const h = harness();
    h.setJob({
      id: "job",
      groupId: "g",
      name: "Research",
      windowId: 7,
      status: "running",
      createdTabIds: [1],
      failures: [],
      errors: [],
      startedAt: 0,
    });
    const response = await h.service.handle({ type: "status" });
    expect(response.ok && response.job?.status).toBe("interrupted");
    expect(h.calls).toEqual([]);
  });
  test("invalid windows do not open tabs", async () => {
    const h = harness();
    h.api.normalWindow = async () => false;
    expect(
      (await h.service.handle({ type: "open", id: "g", windowId: 7 })).ok,
    ).toBe(false);
    expect(h.calls).toEqual([]);
  });
});
