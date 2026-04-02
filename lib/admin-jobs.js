import { randomUUID } from "node:crypto";

const MAX_JOBS = 100;
const jobs = new Map();

function trimJobs() {
  while (jobs.size > MAX_JOBS) {
    const oldestKey = jobs.keys().next().value;
    jobs.delete(oldestKey);
  }
}

export function createJob(initialState = {}) {
  const id = randomUUID();
  jobs.set(id, {
    id,
    status: "queued",
    stage: "queued",
    progress_percent: 0,
    message: "Queued",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...initialState
  });
  trimJobs();
  return id;
}

export function updateJob(id, patch) {
  const existing = jobs.get(id);
  if (!existing) {
    return null;
  }

  const next = {
    ...existing,
    ...patch,
    updated_at: new Date().toISOString()
  };
  jobs.set(id, next);
  return next;
}

export function getJob(id) {
  return jobs.get(id) || null;
}
