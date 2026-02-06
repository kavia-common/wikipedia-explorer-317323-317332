import { act } from "react-dom/test-utils";
import { clearAllCaches, getCacheStatus, subscribeCache, swrRequest } from "../cache";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("cache swrRequest", () => {
  beforeEach(() => {
    clearAllCaches({ alsoLocalStorage: true });
    jest.restoreAllMocks();
  });

  test("stale-while-revalidate: returns stale cached value immediately, then emits updated value after background refresh", async () => {
    jest.useFakeTimers();

    const nowSpy = jest.spyOn(Date, "now");
    // Seed cache with an entry that is already stale.
    nowSpy.mockReturnValue(1000);

    const key = "k1";
    const initialFetcher = jest.fn().mockResolvedValue("OLD");
    await swrRequest(key, initialFetcher, { ttlMs: 10 }); // expiresAt=1010

    // Move time forward past expiration
    nowSpy.mockReturnValue(2000);

    const bg = deferred();
    const refreshFetcher = jest.fn().mockReturnValue(bg.promise);

    const updates = [];
    const unsubscribe = subscribeCache(key, (value) => updates.push(value));

    // The SWR call should synchronously return OLD and schedule background refresh.
    const p = swrRequest(key, refreshFetcher, { ttlMs: 10 });
    await act(async () => {
      // swrRequest returns a Promise, but it should resolve to OLD quickly because it's cached.
      // (The refresh is background.)
      jest.runOnlyPendingTimers();
    });

    const value = await p;
    expect(value).toBe("OLD");

    // Complete background refresh and flush microtasks.
    await act(async () => {
      bg.resolve("NEW");
      await bg.promise;
      // Allow any queued events to run.
      await Promise.resolve();
    });

    unsubscribe();

    const st = getCacheStatus(key);
    expect(st.hit).toBe(true);
    expect(st.stale).toBe(false);
    expect(st.value).toBe("NEW");

    // subscribers should receive NEW at least once
    expect(updates).toContain("NEW");

    jest.useRealTimers();
  });

  test("request de-duplication: concurrent identical requests share a single fetcher call", async () => {
    const key = "dedup";
    const d = deferred();

    const fetcher = jest.fn(() => d.promise);

    const p1 = swrRequest(key, fetcher, { ttlMs: 1000, forceRefresh: true });
    const p2 = swrRequest(key, fetcher, { ttlMs: 1000, forceRefresh: true });
    const p3 = swrRequest(key, fetcher, { ttlMs: 1000, forceRefresh: true });

    expect(fetcher).toHaveBeenCalledTimes(1);

    d.resolve("VALUE");

    await expect(p1).resolves.toBe("VALUE");
    await expect(p2).resolves.toBe("VALUE");
    await expect(p3).resolves.toBe("VALUE");
  });

  test("per-consumer AbortSignal: if consumer is already aborted, swrRequest rejects with AbortError without calling fetcher", async () => {
    const key = "abort";
    const controller = new AbortController();
    controller.abort();

    const fetcher = jest.fn().mockResolvedValue("X");

    await expect(
      swrRequest(key, fetcher, { signal: controller.signal, ttlMs: 1000 })
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(fetcher).not.toHaveBeenCalled();
  });
});
