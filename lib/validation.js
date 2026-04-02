function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateIntakePayload(payload) {
  assert(isObject(payload), "Intake payload must be an object");
  assert(payload.customer_name, "customer_name is required");
  assert(payload.partner_type, "partner_type is required");
  assert(payload.primary_use_case, "primary_use_case is required");
  assert(payload.core_pain_point, "core_pain_point is required");
  assert(payload.desired_outcome, "desired_outcome is required");
  assert(payload.trust_priority, "trust_priority is required");
  return payload;
}

export function validateRequirements(output) {
  assert(isObject(output), "Requirements output must be an object");
  assert(isObject(output.customer_profile), "requirements.customer_profile must be an object");
  assert(isObject(output.partner_context), "requirements.partner_context must be an object");
  assert(Array.isArray(output.use_cases), "requirements.use_cases must be an array");
  assert(Array.isArray(output.pain_points), "requirements.pain_points must be an array");
  assert(Array.isArray(output.desired_outcomes), "requirements.desired_outcomes must be an array");
  assert(Array.isArray(output.trust_requirements), "requirements.trust_requirements must be an array");
  assert(Array.isArray(output.workflow_blockers), "requirements.workflow_blockers must be an array");
  assert(Array.isArray(output.recommended_next_questions), "requirements.recommended_next_questions must be an array");
  assert(Array.isArray(output.success_criteria), "requirements.success_criteria must be an array");
  assert(isObject(output.scale), "requirements.scale must be an object");
  assert(Array.isArray(output.constraints), "requirements.constraints must be an array");
  assert(Array.isArray(output.gaps), "requirements.gaps must be an array");
  return output;
}

export function validateSolution(output) {
  assert(isObject(output), "Solution output must be an object");
  assert(Array.isArray(output.options) && output.options.length > 0, "solution.options must be a non-empty array");
  output.options.forEach((option, index) => {
    assert(isObject(option), `solution.options[${index}] must be an object`);
    assert(typeof option.name === "string" && option.name, `solution.options[${index}].name is required`);
    assert(Array.isArray(option.vendor_stack), `solution.options[${index}].vendor_stack must be an array`);
    assert(Array.isArray(option.rationale), `solution.options[${index}].rationale must be an array`);
    assert(Array.isArray(option.risks), `solution.options[${index}].risks must be an array`);
  });
  return output;
}

export function validateBom(output) {
  assert(isObject(output), "BOM output must be an object");
  assert(Array.isArray(output.rows) && output.rows.length > 0, "bom.rows must be a non-empty array");
  output.rows.forEach((row, index) => {
    assert(typeof row.part_number === "string" && row.part_number, `bom.rows[${index}].part_number is required`);
    assert(Number.isFinite(row.qty), `bom.rows[${index}].qty must be numeric`);
    assert(Number.isFinite(row.unit_price), `bom.rows[${index}].unit_price must be numeric`);
    assert(Number.isFinite(row.total_price), `bom.rows[${index}].total_price must be numeric`);
  });
  return output;
}

export function validateProposalMetadata(output) {
  assert(isObject(output), "Proposal output must be an object");
  assert(typeof output.proposal_path === "string" && output.proposal_path, "proposal_path is required");
  assert(Array.isArray(output.sections), "proposal.sections must be an array");
  return output;
}
