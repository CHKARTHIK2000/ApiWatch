/**
 * Normalizes SQL queries into a normalized fingerprint.
 * e.g.:
 * "SELECT * FROM users WHERE id = 42 AND email = 'test@example.com'"
 * -> "SELECT * FROM users WHERE id = ? AND email = ?"
 */
export function normalizeSql(sql: string): string {
  if (!sql || typeof sql !== 'string') return '';

  let normalized = sql.trim();

  // Strip single-line comments (-- comment or # comment)
  normalized = normalized.replace(/(--|#)[^\r\n]*/g, '');

  // Strip multi-line comments (/* ... */)
  normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, '');

  // Replace single and double quoted strings with '?'
  normalized = normalized.replace(/'(?:''|[^'\\]|\\.)*'/g, '?');
  normalized = normalized.replace(/"(?:""|[^"\\]|\\.)*"/g, '?');

  // Replace UUIDs: e.g. 550e8400-e29b-41d4-a716-446655440000 -> ?
  normalized = normalized.replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '?');

  // Replace Hex literals: 0x12ab -> ?
  normalized = normalized.replace(/0x[0-9a-fA-F]+/g, '?');

  // Replace numbers (integers and floats, including negatives)
  normalized = normalized.replace(/\b\d+(\.\d+)?\b/g, '?');

  // Collapse IN clause lists: IN (?, ?, ?) -> IN (?)
  normalized = normalized.replace(/\bIN\s*\(\s*\?(?:\s*,\s*\?)*\s*\)/gi, 'IN (?)');

  // Collapse VALUES clause lists: VALUES (?, ?), (?, ?) -> VALUES (?)
  normalized = normalized.replace(/\bVALUES\s*\(\s*\?(?:\s*,\s*\?)*\s*\)(?:\s*,\s*\(\s*\?(?:\s*,\s*\?)*\s*\))*/gi, 'VALUES (?)');

  // Collapse multiple '?' separated by commas (e.g. (?, ?, ?))
  normalized = normalized.replace(/\(\s*\?(?:\s*,\s*\?)+\s*\)/g, '(?)');

  // Collapse multiple whitespace characters into a single space
  normalized = normalized.replace(/\s+/g, ' ');

  // Remove trailing semicolons
  normalized = normalized.replace(/;\s*$/, '');

  return normalized.trim();
}

/**
 * Sanitizes SQL queries before saving to disk to prevent sensitive credentials,
 * passwords, API keys, tokens, or credit cards from being persisted.
 */
export function sanitizeSql(sql: string): string {
  if (!sql || typeof sql !== 'string') return '';
  let sanitized = sql;

  // Redact password / secret / token / key patterns
  sanitized = sanitized.replace(
    /(password|passwd|pwd|secret|token|api_?key|auth|bearer|credit_?card|cvv|ssn)\s*(=|LIKE|IN)\s*'[^']*'/gi,
    "$1 $2 '[REDACTED]'"
  );
  sanitized = sanitized.replace(
    /(password|passwd|pwd|secret|token|api_?key|auth|bearer|credit_?card|cvv|ssn)\s*(=|LIKE|IN)\s*"[^"]*"/gi,
    '$1 $2 "[REDACTED]"'
  );

  // Redact email addresses inside literals
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');

  // Redact credit cards (16 digits)
  sanitized = sanitized.replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, '[REDACTED_CC]');

  return sanitized;
}

