export const projectObjective = {
  summary:
    "Deliver a Multi-Agent System for SI and Distributor customers as a cloud SaaS product that expands adoption through free usage first, proves it solves real presale pain points, and strengthens market leadership before monetization is introduced later.",
  companyDna: [
    "Empathy is the core DNA of the company and must be reflected in every AI agent role",
    "The system must help busy SI and Distributor users think clearly even when their requirements are incomplete or still forming",
    "Agents must guide, clarify, and reduce pressure instead of expecting technically perfect input from the user"
  ],
  targetCustomers: ["System Integrator", "Distributor"],
  deliveryModel: "Cloud SaaS",
  commercialModel: ["Free-first market expansion", "Monetization deferred until product-market fit is proven"],
  packagingModel: "Initial free usage with future package evolution after market validation",
  designPriorities: [
    "Empathy-first product behavior across all AI agent roles",
    "Solve SI and Distributor presale pain points credibly",
    "Free-first adoption and market-share expansion",
    "Multi-tenant SaaS operability",
    "Scalable cloud deployment",
    "Result-first minimal UI and trustworthy outputs",
    "Make the user feel like they have a real presale engineer working for them",
    "Reliability, accuracy, and evidence-backed recommendations"
  ]
};

export function formatProjectObjective() {
  return [
    `Project objective: ${projectObjective.summary}`,
    `Company DNA: ${projectObjective.companyDna.join("; ")}`,
    `Target customers: ${projectObjective.targetCustomers.join(", ")}`,
    `Delivery model: ${projectObjective.deliveryModel}`,
    `Commercial model: ${projectObjective.commercialModel.join(", ")}`,
    `Packaging model: ${projectObjective.packagingModel}`,
    `Design priorities: ${projectObjective.designPriorities.join("; ")}`
  ].join("\n");
}
