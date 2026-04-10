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
};

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
 * Main entry point to validate a solution option.
 * @param {Object} option { licenses: [], storage_items: [], notes: "" }
 * @param {Object} context { user_count: number }
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
  validateSolutionOption,
};
