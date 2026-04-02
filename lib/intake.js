import { validateIntakePayload } from "./validation.js";

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export function normalizeIntakePayload(payload) {
  const normalized = {
    customer_name: String(payload.customer_name || "").trim(),
    partner_type: String(payload.partner_type || "").trim(),
    industry: String(payload.industry || "Unknown").trim(),
    primary_use_case: String(payload.primary_use_case || "").trim(),
    core_pain_point: String(payload.core_pain_point || "").trim(),
    desired_outcome: String(payload.desired_outcome || "").trim(),
    output_preference: String(payload.output_preference || "Structured recommendation").trim(),
    trust_priority: String(payload.trust_priority || "").trim(),
    integration_needs: String(payload.integration_needs || "").trim(),
    users: toNumber(payload.users),
    vm_count: toNumber(payload.vm_count),
    storage_tb: toNumber(payload.storage_tb),
    budget_range_thb: String(payload.budget_range_thb || "Unknown").trim(),
    timeline: String(payload.timeline || "Unknown").trim(),
    notes: String(payload.notes || "").trim()
  };

  return validateIntakePayload(normalized);
}
