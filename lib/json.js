export function safeParseJson(rawText) {
  if (typeof rawText !== "string" || rawText.trim() === "") {
    return { ok: false, error: new Error("Empty JSON payload") };
  }

  try {
    return { ok: true, value: JSON.parse(rawText) };
  } catch {
    const match = rawText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) {
      try {
        return { ok: true, value: JSON.parse(match[1]) };
      } catch (error) {
        return { ok: false, error };
      }
    }

    const balanced = findBalancedJson(rawText);
    if (balanced) {
      try {
        return { ok: true, value: JSON.parse(balanced) };
      } catch (error) {
        return { ok: false, error };
      }
    }

    return { ok: false, error: new Error("Unable to parse JSON response") };
  }
}

function findBalancedJson(text) {
  const stack = [];
  let start = -1;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "{" || char === "[") {
      if (stack.length === 0) {
        start = index;
      }
      stack.push(char);
    } else if (char === "}" || char === "]") {
      if (stack.length === 0) {
        continue;
      }

      const last = stack[stack.length - 1];
      if (
        (last === "{" && char === "}") ||
        (last === "[" && char === "]")
      ) {
        stack.pop();
        if (stack.length === 0 && start >= 0) {
          return text.slice(start, index + 1);
        }
      }
    }
  }

  return null;
}
