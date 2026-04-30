// Unified CLI UI primitives for the `boa` command.
//
// Commands describe what they're doing as a task tree. This module
// decides how to render: Listr2 spinners when stdout is a TTY, plain
// `[ ] / [✓]` lines otherwise. That keeps CI logs clean, leaves
// tests unchanged, and lets us swap renderers without touching
// commands.

import { Listr } from 'listr2';
import pc from 'picocolors';
import Table from 'cli-table3';

const PLAIN = !process.stdout.isTTY
  || process.env.BOA_PLAIN === '1'
  || process.env.CI === 'true'
  || process.env.NO_COLOR != null;

// ---------- symbol + color helpers ----------

export const sym = PLAIN
  ? {
    ok: '[✓]',
    fail: '[✗]',
    warn: '[!]',
    info: '[i]',
    pending: '[ ]',
    bullet: '  -',
    arrow: '->',
  }
  : {
    ok: pc.green('✓'),
    fail: pc.red('✗'),
    warn: pc.yellow('!'),
    info: pc.cyan('i'),
    pending: pc.gray('·'),
    bullet: pc.gray('•'),
    arrow: pc.gray('→'),
  };

export const color = PLAIN
  ? {
    dim: (s) => s, bold: (s) => s, cyan: (s) => s,
    green: (s) => s, red: (s) => s, yellow: (s) => s, gray: (s) => s,
  }
  : {
    dim: pc.dim, bold: pc.bold, cyan: pc.cyan,
    green: pc.green, red: pc.red, yellow: pc.yellow, gray: pc.gray,
  };

// ---------- one-shot log helpers ----------

export function info(msg) { console.log(`${sym.info} ${msg}`); }
export function ok(msg) { console.log(`${sym.ok} ${msg}`); }
export function warn(msg) { console.log(`${sym.warn} ${color.yellow(msg)}`); }
export function fail(msg) { console.error(`${sym.fail} ${color.red(msg)}`); }

export function heading(msg) {
  if (PLAIN) { console.log(msg); return; }
  console.log(color.bold(msg));
}

export function blank() { console.log(''); }

// ---------- key: value summary block ----------
//
// Used at the tail of commands like `boa deploy` / `boa init` to
// show the resulting config. Aligns values to a common column.

export function summary(title, pairs) {
  if (title) {
    blank();
    console.log(color.bold(title));
  }
  const width = Math.max(...pairs.map(([k]) => k.length));
  for (const [key, value] of pairs) {
    if (value == null || value === '') continue;
    const padded = key.padEnd(width);
    console.log(`  ${color.gray(padded)}  ${value}`);
  }
}

// ---------- table ----------
//
// table(['Col A', 'Col B'], [[a1, b1], [a2, b2]]).  When the
// terminal doesn't support boxed output (CI / non-TTY / NO_COLOR)
// we render as plain padded columns.

export function table(headers, rows, { emptyMessage = '(none)' } = {}) {
  if (!rows || rows.length === 0) {
    console.log(`  ${color.dim(emptyMessage)}`);
    return;
  }
  if (PLAIN) {
    const widths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length))
    );
    const pad = (s, w) => String(s ?? '').padEnd(w);
    console.log('  ' + headers.map((h, i) => pad(h, widths[i])).join('  '));
    console.log('  ' + widths.map((w) => '-'.repeat(w)).join('  '));
    for (const r of rows) {
      console.log('  ' + r.map((c, i) => pad(c, widths[i])).join('  '));
    }
    return;
  }
  const t = new Table({
    head: headers.map((h) => color.bold(h)),
    style: { head: [], border: ['gray'] },
    chars: {
      top: '─', 'top-mid': '┬', 'top-left': '╭', 'top-right': '╮',
      bottom: '─', 'bottom-mid': '┴', 'bottom-left': '╰', 'bottom-right': '╯',
      left: '│', 'left-mid': '├', mid: '─', 'mid-mid': '┼',
      right: '│', 'right-mid': '┤', middle: '│',
    },
  });
  for (const r of rows) t.push(r.map((c) => String(c ?? '')));
  console.log(t.toString().split('\n').map((l) => '  ' + l).join('\n'));
}

// ---------- task runner ----------
//
// Tasks are plain objects: { title, run: async (ctx, task) => ... }
// A task's run() can return a nested array to spawn subtasks.
// Commands call runTasks(tasks) once at the top level — TTY users
// see a live spinner tree; CI users see one `[ ] name` line at
// start and one `[✓] name` (or `[✗] name  <reason>`) on finish.

export async function runTasks(tasks, { concurrent = false, exitOnError = true } = {}) {
  if (PLAIN) {
    return runPlain(tasks, { concurrent, exitOnError });
  }
  const listr = new Listr(
    tasks.map(toListrTask),
    {
      concurrent,
      exitOnError,
      rendererOptions: {
        collapseSubtasks: false,
        showSubtasks: true,
      },
    },
  );
  await listr.run();
}

function toListrTask(t) {
  return {
    title: t.title,
    skip: t.skip,
    task: async (ctx, listrTask) => {
      const result = await t.run(ctx, {
        // Update the visible spinner label mid-task. No-op for plain.
        update(s) { listrTask.output = s; },
        setTitle(s) { listrTask.title = s; },
      });
      if (Array.isArray(result) && result.length > 0) {
        return listrTask.newListr(result.map(toListrTask));
      }
      return undefined;
    },
  };
}

async function runPlain(tasks, opts) {
  for (const t of tasks) {
    if (t.skip) {
      const reason = typeof t.skip === 'function' ? t.skip() : t.skip;
      if (reason) {
        console.log(`${sym.pending} ${t.title}  ${color.dim('(skipped: ' + reason + ')')}`);
        continue;
      }
    }
    console.log(`${sym.pending} ${t.title}`);
    try {
      const update = (s) => console.log(`    ${color.dim(s)}`);
      const result = await t.run({}, { update, setTitle: () => {} });
      if (Array.isArray(result) && result.length > 0) {
        await runPlain(result, opts);
      }
      console.log(`${sym.ok} ${t.title}`);
    } catch (err) {
      console.error(`${sym.fail} ${t.title}  ${color.red(err.message || String(err))}`);
      if (opts.exitOnError) throw err;
    }
  }
}
