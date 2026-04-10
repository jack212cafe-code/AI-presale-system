// Parse budget_range string → numeric upper bound in THB
// Supports: "3,000,000-5,000,000 THB", "3M-5M THB", "5M THB", "5,000,000",
//           "2.5 ล้านบาท", "ไม่เกิน 2.5 ล้าน", "250K", "Unknown"
export function parseBudgetUpperBound(budgetRange) {
  if (!budgetRange || budgetRange === "Unknown") return null;

  const str = String(budgetRange).replace(/,/g, "");

  // Extract all numeric tokens with optional suffix (M/K/ล้าน/แสน/หมื่น)
  const tokens = [...str.matchAll(/(\d+(?:\.\d+)?)\s*([MKmk]|ล้าน|แสน|หมื่น)?/g)].map(m => {
    const num = parseFloat(m[1]);
    const suffix = (m[2] ?? "").toUpperCase();
    if (suffix === "M" || m[2] === "ล้าน") return num * 1_000_000;
    if (m[2] === "แสน") return num * 100_000;
    if (m[2] === "หมื่น") return num * 10_000;
    if (suffix === "K") return num * 1_000;
    return num;
  });

  if (tokens.length === 0) return null;
  return Math.max(...tokens); // upper bound = largest value in range
}

// Returns a warning string if tco > budget, null otherwise
export function checkBudgetOverrun(estimatedTcoThb, budgetRange) {
  if (!estimatedTcoThb || !budgetRange) return null;
  const upper = parseBudgetUpperBound(budgetRange);
  if (!upper) return null;
  if (estimatedTcoThb > upper) {
    const overPct = Math.round(((estimatedTcoThb - upper) / upper) * 100);
    return `ราคาประเมิน ${estimatedTcoThb.toLocaleString()} THB เกินงบที่ระบุ ${upper.toLocaleString()} THB (${overPct}%) — ควรทบทวน scope ก่อน generate proposal`;
  }
  return null;
}
