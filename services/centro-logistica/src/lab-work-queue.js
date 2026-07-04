function createInMemoryFifoWorkQueue(options = {}) {
  const maxAttempts = options.maxAttempts ?? 2;
  const queue = [];
  const processed = [];
  const failed = [];
  let nextSequence = 1;

  function enqueue(type, payload) {
    if (!type) {
      throw new Error("work item type is required");
    }

    const item = {
      id: `work-${String(nextSequence).padStart(3, "0")}`,
      type,
      payload,
      attempts: 0
    };
    nextSequence += 1;
    queue.push(item);
    return { ...item };
  }

  async function processNext(worker) {
    if (typeof worker !== "function") {
      throw new Error("worker function is required");
    }
    if (queue.length === 0) {
      return { status: "empty" };
    }

    const item = queue.shift();
    item.attempts += 1;

    try {
      const result = await worker({ ...item });
      const completed = { ...item, result };
      processed.push(completed);
      return { status: "processed", item: completed };
    } catch (error) {
      if (item.attempts < maxAttempts) {
        queue.push(item);
        return { status: "retry_queued", item: { ...item }, error: error.message };
      }

      const dead = { ...item, error: error.message };
      failed.push(dead);
      return { status: "failed", item: dead, error: error.message };
    }
  }

  async function drain(worker) {
    const results = [];
    while (queue.length > 0) {
      results.push(await processNext(worker));
    }
    return results;
  }

  function getMetrics() {
    return {
      queued: queue.length,
      processed: processed.length,
      failed: failed.length,
      maxAttempts
    };
  }

  return {
    enqueue,
    processNext,
    drain,
    getMetrics,
    getQueuedItems: () => queue.map((item) => ({ ...item })),
    getProcessedItems: () => processed.map((item) => ({ ...item })),
    getFailedItems: () => failed.map((item) => ({ ...item }))
  };
}

function createBoundedWorkQueue(options = {}) {
  const maxQueued = options.maxQueued ?? 5;
  const maxAttempts = options.maxAttempts ?? 2;
  const queue = [];
  const processed = [];
  const failed = [];
  const rejected = [];
  let nextSequence = 1;
  let enqueued = 0;
  let retried = 0;

  function enqueue(type, payload) {
    if (!type) {
      throw new Error("work item type is required");
    }

    const item = {
      id: `work-${String(nextSequence).padStart(3, "0")}`,
      type,
      payload,
      attempts: 0
    };
    nextSequence += 1;

    if (queue.length >= maxQueued) {
      const rejectedItem = { ...item, reason: "queue_at_capacity" };
      rejected.push(rejectedItem);
      return { status: "rejected", item: rejectedItem, reason: rejectedItem.reason };
    }

    queue.push(item);
    enqueued += 1;
    return { status: "queued", item: { ...item } };
  }

  async function processNext(worker) {
    if (typeof worker !== "function") {
      throw new Error("worker function is required");
    }
    if (queue.length === 0) {
      return { status: "empty" };
    }

    const item = queue.shift();
    item.attempts += 1;

    try {
      const result = await worker({ ...item });
      const completed = { ...item, result };
      processed.push(completed);
      return { status: "processed", item: completed };
    } catch (error) {
      if (item.attempts < maxAttempts) {
        queue.push(item);
        retried += 1;
        return { status: "retry_queued", item: { ...item }, error: error.message };
      }

      const dead = { ...item, error: error.message };
      failed.push(dead);
      return { status: "failed", item: dead, error: error.message };
    }
  }

  async function processBatch(worker, limit) {
    const results = [];
    const batchLimit = limit ?? queue.length;
    for (let index = 0; index < batchLimit && queue.length > 0; index += 1) {
      results.push(await processNext(worker));
    }
    return results;
  }

  function getMetrics() {
    return {
      queued: queue.length,
      maxQueued,
      enqueued,
      processed: processed.length,
      failed: failed.length,
      rejected: rejected.length,
      retried,
      maxAttempts
    };
  }

  return {
    enqueue,
    processNext,
    processBatch,
    getMetrics,
    getQueuedItems: () => queue.map((item) => ({ ...item })),
    getProcessedItems: () => processed.map((item) => ({ ...item })),
    getFailedItems: () => failed.map((item) => ({ ...item })),
    getRejectedItems: () => rejected.map((item) => ({ ...item }))
  };
}

module.exports = { createBoundedWorkQueue, createInMemoryFifoWorkQueue };
