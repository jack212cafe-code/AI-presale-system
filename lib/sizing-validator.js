/**
 * Sizing Validator
 * Programmatic enforcement of technical rules for IT Solutions and BOMs.
 * Transitions the system from "Prompt Guidance" to "Logic Enforcement".
 */

const STORAGE_PATTERN = /(\d+(\.\d+)?)\s*(TB|GB)/i;

const RULES = {
  M365_BUSINESS_LIMIT: 300,
  WINDOWS_SERVER_DC: {
    MIN_CORES_PER_SOCKET: 16,
    MIN_SOCKETS: 2,
  },
  HCI_NODE_COUNT: {
    MIN: 3,
    MISSION_CRITICAL_VM_THRESHOLD: 100,
  },
};

const STANDARD_DIMM_SIZES_GB = [128, 192, 256, 384, 512, 768, 1024, 1536, 2048];

/**
 * Validates M365 license selection against user count.
 * @param {number} userCount
 * @param {string} licenseType
 * @returns {{valid: boolean, error: string|null}}
 */
function validateM365(userCount, licenseType) {
  if (!userCount || !licenseType) return { valid: true, error: null };

  const isBusiness = licenseType.toLowerCase().includes('business');
  if (isBusiness && userCount > RULES.M365_BUSINESS_LIMIT) {
    return {
      valid: false,
      error: `M365 Business license is limited to ${RULES.M365_BUSINESS_LIMIT} users. With ${userCount} users, please upgrade to M365 E3 or E5.`,
    };
  }
  return { valid: true, error: null };
}

/**
 * Validates Windows Server Datacenter core/socket requirements.
 * @param {Object} specs { sockets: number, coresPerSocket: number }
 * @returns {{valid: boolean, error: string|null}}
 */
function validateWindowsServer(specs) {
  if (!specs) return { valid: true, error: null };

  const { sockets, coresPerSocket } = specs;
  const errors = [];

  if (sockets < RULES.WINDOWS_SERVER_DC.MIN_SOCKETS) {
    errors.push(`Windows Server Datacenter requires minimum ${RULES.WINDOWS_SERVER_DC.MIN_SOCKETS} sockets.`);
  }
  if (coresPerSocket < RULES.WINDOWS_SERVER_DC.MIN_CORES_PER_SOCKET) {
    errors.push(`Windows Server Datacenter requires minimum ${RULES.WINDOWS_SERVER_DC.MIN_CORES_PER_SOCKET} cores per socket.`);
  }

  return errors.length > 0
    ? { valid: false, error: errors.join(' ') }
    : { valid: true, error: null };
}

/**
 * Verifies that storage items have explicit capacity units (TB/GB).
 * @param {string} itemText
 * @returns {{valid: boolean, error: string|null}}
 */
function validateStoragePrecision(itemText) {
  const isStorage = /nvme|ssd|hdd|disk|storage/i.test(itemText);
  if (!isStorage) return { valid: true, error: null };

  if (!STORAGE_PATTERN.test(itemText)) {
    return {
      valid: false,
      error: `Storage item "${itemText}" lacks explicit capacity (e.g., 3.84TB). Please specify TB or GB.`,
    };
  }
  return { valid: true, error: null };
}

/**
 * Checks if the compute rationale contains a calculation string.
 * @param {string} notes
 * @returns {{valid: boolean, error: string|null}}
 */
function validateComputeRationale(notes) {
  if (!notes) return { valid: false, error: "Compute rationale is missing." };

  // Look for patterns like (VM count * RAM) * overhead
  const rationalePattern = /(\d+)\s*VMs?\s*.*?\s*(\d+)\s*GB\s*.*?\s*(1\.\d+|overhead)/i;
  if (!rationalePattern.test(notes)) {
    return {
      valid: false,
      error: "Compute sizing rationale is missing or invalid. Format should be: (est. VM count x avg RAM -> node RAM target).",
    };
  }
  return { valid: true, error: null };
}

/**
 * Validates the architectural topology of a solution.
 * @param {string} architecture The architecture description.
 * @param {string[]} storage_items The list of storage products.
 * @param {string} requested_topology The topology requested (e.g., 'HCI', '3-Tier').
 * @returns {{valid: boolean, error: string|null}}
 */
function validateArchitectureTopology(architecture, storage_items, requested_topology) {
  if (!requested_topology) return { valid: true, error: null };

  const archLower = architecture.toLowerCase();
  const itemsLower = storage_items.join(' ').toLowerCase();

  if (requested_topology.toUpperCase() === 'HCI') {
    // HCI should NOT use centralized SAN like PowerStore or ME5 unless it's a very specific Hybrid setup
    // Expert check: PowerStore is a SAN, not HCI. VxRail, Nutanix, SimpliVity are HCI.
    const isSanProduct = /powerstore|powerscale|power-vault|me5|msa/i.test(itemsLower);
    const isHciProduct = /vxrail|nutanix|simplivity|vsan|ceph/i.test(archLower) || /vxrail|nutanix|simplivity|vsan|ceph/i.test(itemsLower);

    if (isSanProduct && !isHciProduct) {
      return {
        valid: false,
        error: `Architectural Mismatch: Requested HCI but proposed a SAN-based solution (e.g., PowerStore). HCI requires distributed storage (e.g., VxRail, Nutanix, or vSAN).`,
      };
    }
  }

  return { valid: true, error: null };
}

/**
 * Validates HCI node count against VM count and topology.
 * @param {number} vmCount
 * @param {number} nodeCount
 * @param {string} requestedTopology
 * @param {boolean} missionCritical
 * @returns {{valid: boolean, error: string|null}}
 */
function validateHciNodeCount(vmCount, nodeCount, requestedTopology, missionCritical = false) {
  if (!requestedTopology || requestedTopology.toUpperCase() !== 'HCI') return { valid: true, error: null };
  if (!nodeCount) return { valid: true, error: null };

  if (nodeCount < RULES.HCI_NODE_COUNT.MIN) {
    return {
      valid: false,
      error: `HCI requires minimum ${RULES.HCI_NODE_COUNT.MIN} nodes for quorum (got ${nodeCount}).`,
    };
  }

  if (vmCount && vmCount <= RULES.HCI_NODE_COUNT.MISSION_CRITICAL_VM_THRESHOLD && nodeCount > 3 && !missionCritical) {
    return {
      valid: false,
      error: `HCI node count mismatch: ${vmCount} VMs does not justify ${nodeCount} nodes. Use 3 nodes unless VM count > ${RULES.HCI_NODE_COUNT.MISSION_CRITICAL_VM_THRESHOLD} or mission-critical tier.`,
    };
  }

  return { valid: true, error: null };
}

/**
 * Verifies that RAM per node uses standard DIMM sizes.
 * @param {number} ramGbPerNode
 * @returns {{valid: boolean, error: string|null}}
 */
function validateRamStandardization(ramGbPerNode) {
  if (!ramGbPerNode) return { valid: true, error: null };

  if (!STANDARD_DIMM_SIZES_GB.includes(ramGbPerNode)) {
    const rounded = STANDARD_DIMM_SIZES_GB.find(s => s >= ramGbPerNode) ?? STANDARD_DIMM_SIZES_GB[STANDARD_DIMM_SIZES_GB.length - 1];
    return {
      valid: false,
      error: `RAM ${ramGbPerNode}GB per node is non-standard. Round up to ${rounded}GB (standard DIMM config: ${STANDARD_DIMM_SIZES_GB.join('/')}GB).`,
    };
  }

  return { valid: true, error: null };
}

/**
 * Main entry point to validate a solution option.
 * @param {Object} option { licenses: [], storage_items: [], notes: "", architecture: "", node_count, ram_gb_per_node }
 * @param {Object} context { user_count, requested_topology, vm_count, mission_critical }
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateSolutionOption(option, context = {}) {
  const errors = [];

  // 1. Validate M365
  if (option.licenses) {
    option.licenses.forEach(lic => {
      if (lic.toLowerCase().includes('m365')) {
        const res = validateM365(context.user_count, lic);
        if (!res.valid) errors.push(res.error);
      }
    });
  }

  // 2. Validate Windows Server
  if (option.specs && option.specs.windows_server) {
    const res = validateWindowsServer(option.specs.windows_server);
    if (!res.valid) errors.push(res.error);
  }

  // 3. Validate Storage Precision
  if (option.storage_items) {
    option.storage_items.forEach(item => {
      const res = validateStoragePrecision(item);
      if (!res.valid) errors.push(res.error);
    });
  }

  // 4. Validate Rationale
  const ratRes = validateComputeRationale(option.notes);
  if (!ratRes.valid) errors.push(ratRes.error);

  // 5. Validate Architectural Topology (Expert Check)
  if (option.architecture && option.storage_items) {
    const topoRes = validateArchitectureTopology(option.architecture, option.storage_items, context.requested_topology);
    if (!topoRes.valid) errors.push(topoRes.error);
  }

  // 6. Validate HCI node count
  if (option.node_count) {
    const nodeRes = validateHciNodeCount(context.vm_count, option.node_count, context.requested_topology, context.mission_critical);
    if (!nodeRes.valid) errors.push(nodeRes.error);
  }

  // 7. Validate RAM standardization
  if (option.ram_gb_per_node) {
    const ramRes = validateRamStandardization(option.ram_gb_per_node);
    if (!ramRes.valid) errors.push(ramRes.error);
  }

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}

export {
  validateM365,
  validateWindowsServer,
  validateStoragePrecision,
  validateComputeRationale,
  validateArchitectureTopology,
  validateHciNodeCount,
  validateRamStandardization,
  validateSolutionOption,
};

