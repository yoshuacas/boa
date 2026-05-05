// Client-safe: Cedar parsing only — no fs/pg dependency.

export type PolicyFile = {
  filename: string;
  content: string;
  summary: PolicySummary;
};

export type PolicySummary = {
  rules: PolicyRule[];
  comments: string[];
};

export type PolicyRule = {
  effect: 'permit' | 'forbid';
  principal: string;
  actions: string[];
  resource: string;
  condition: string | null;
};

// Lightweight Cedar parser — extracts rules and top-level comments.
// Handles the patterns pgrest-lambda uses.
export function parseCedar(text: string): PolicySummary {
  const comments: string[] = [];
  const rules: PolicyRule[] = [];

  // Collect top-level comments for display
  const commentRe = /\/\/\s*(.+)/g;
  let cm: RegExpExecArray | null;
  while ((cm = commentRe.exec(text)) !== null) {
    const c = cm[1].trim();
    if (c && !comments.includes(c)) comments.push(c);
  }

  // Parse each permit/forbid block
  const blockRe = /(permit|forbid)\s*\(([\s\S]*?)\)\s*(?:when\s*\{([\s\S]*?)\})?/g;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(text)) !== null) {
    const effect = match[1] as 'permit' | 'forbid';
    const body = match[2];
    const whenClause = match[3]?.trim() ?? null;

    rules.push({
      effect,
      principal: extractPrincipal(body),
      actions: extractActions(body),
      resource: extractResource(body),
      condition: whenClause ? whenClause.trim() : null,
    });
  }

  return { rules, comments };
}

function extractPrincipal(body: string): string {
  const isMatch = body.match(/principal\s+is\s+PgrestLambda::(\w+)/);
  if (isMatch) return isMatch[1];
  if (/principal\b/.test(body) && !/principal\s+is\b/.test(body)) return 'Any';
  return 'Any';
}

function extractActions(body: string): string[] {
  const eqMatch = body.match(/action\s*==\s*PgrestLambda::Action::"(\w+)"/);
  if (eqMatch) return [eqMatch[1]];

  const inMatch = body.match(/action\s+in\s*\[([\s\S]*?)\]/);
  if (inMatch) {
    const acts: string[] = [];
    const actRe = /PgrestLambda::Action::"(\w+)"/g;
    let m: RegExpExecArray | null;
    while ((m = actRe.exec(inMatch[1])) !== null) acts.push(m[1]);
    return acts.length ? acts : ['*'];
  }

  if (/\baction\b/.test(body)) return ['*'];
  return ['*'];
}

function extractResource(body: string): string {
  const isMatch = body.match(/resource\s+is\s+PgrestLambda::(\w+)/);
  if (isMatch) return isMatch[1];
  return 'Any';
}
