/**
 * BOA Dashboard — Core
 *
 * Loads .boa/config.json, exposes config state, and renders common UI
 * (sidebar, topbar, getting-started screen). All page-specific scripts
 * import this module and call `initDashboard()`.
 */

const BOA = (() => {
  // ── State ──────────────────────────────────────────────────────────
  let config = null;
  let configPath = '../../.boa/config.json';
  let onConfigLoad = null; // callback set by each page

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Bootstrap the dashboard.
   * @param {Object} opts
   * @param {string} opts.activePage  - id of the current page for sidebar highlight
   * @param {string} opts.pageTitle   - text shown in the topbar
   * @param {Function} opts.onConfig  - called with (config) once loaded (or null if missing)
   */
  function init(opts = {}) {
    onConfigLoad = opts.onConfig || null;
    renderSidebar(opts.activePage || 'overview');
    renderTopbar(opts.pageTitle || 'Dashboard');
    loadConfig();
  }

  function getConfig() {
    return config;
  }

  function getRegion() {
    if (!config) return 'us-east-1';
    return config.region || config.aws_region || 'us-east-1';
  }

  function getStackName() {
    if (!config) return 'boa-stack';
    return config.stack_name || config.stackName || 'boa-stack';
  }

  /**
   * Build a generic AWS CLI command string.
   * @param {string} service   e.g. 'dsql', 'cognito-idp', 'lambda'
   * @param {string} action    e.g. 'describe-clusters'
   * @param {Object} params    key/value flags
   * @param {string} [regionOverride]
   * @returns {string}
   */
  function awsCommand(service, action, params = {}, regionOverride) {
    const region = regionOverride || getRegion();
    let cmd = `aws ${service} ${action} --region ${region}`;
    for (const [k, v] of Object.entries(params)) {
      if (v === true) {
        cmd += ` ${k}`;
      } else if (v !== false && v !== undefined && v !== null) {
        cmd += ` ${k} ${v}`;
      }
    }
    return cmd;
  }

  // ── Sidebar ────────────────────────────────────────────────────────

  function renderSidebar(activePage) {
    const pages = [
      { id: 'overview',  label: 'Stack Overview',  icon: '\u2302', href: 'index.html' },
      { id: 'database',  label: 'Database (DSQL)', icon: '\u26C1', href: 'database.html' },
      { id: 'auth',      label: 'Auth (Cognito)',  icon: '\u26BF', href: 'auth.html' },
      { id: 'functions', label: 'Functions (Lambda)', icon: '\u03BB', href: 'functions.html' },
      { id: 'api',       label: 'API Gateway',     icon: '\u21C4', href: 'api.html' },
      { id: 'storage',   label: 'Storage (S3)',     icon: '\u2601', href: 'storage.html' },
    ];

    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    sidebar.innerHTML = `
      <a href="index.html" class="sidebar-logo">
        <span class="logo-text"><span>BOA</span> Dashboard</span>
        <span class="logo-badge">Local</span>
      </a>
      <nav class="sidebar-nav">
        <div class="sidebar-section-label">Services</div>
        ${pages.map(p => `
          <a href="${p.href}" class="${p.id === activePage ? 'active' : ''}">
            <span class="nav-icon">${p.icon}</span>
            ${p.label}
          </a>
        `).join('')}
      </nav>
      <div class="sidebar-footer">
        BOA &mdash; <a href="https://github.com/aws/boa" target="_blank">GitHub</a>
      </div>
    `;
  }

  // ── Topbar ─────────────────────────────────────────────────────────

  function renderTopbar(title) {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;

    topbar.innerHTML = `
      <div class="topbar-title">${title}</div>
      <div class="topbar-actions">
        <div class="config-path-bar">
          <label>Config:</label>
          <input type="text" id="configPathInput" value="${configPath}" />
          <button id="configPathBtn">Load</button>
        </div>
      </div>
    `;

    document.getElementById('configPathBtn').addEventListener('click', () => {
      configPath = document.getElementById('configPathInput').value.trim();
      loadConfig();
    });

    document.getElementById('configPathInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        configPath = e.target.value.trim();
        loadConfig();
      }
    });
  }

  // ── Config loading ─────────────────────────────────────────────────

  function loadConfig() {
    fetch(configPath)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        config = data;
        if (onConfigLoad) onConfigLoad(config);
      })
      .catch(() => {
        config = null;
        if (onConfigLoad) onConfigLoad(null);
      });
  }

  // ── Getting-started fallback ───────────────────────────────────────

  function renderGettingStarted(container) {
    container.innerHTML = `
      <div class="getting-started">
        <div class="gs-icon">\u{1F40D}</div>
        <h2>No BOA config found</h2>
        <p>
          The dashboard could not load a <code>.boa/config.json</code> file.
          This file is created automatically when you bootstrap a BOA backend.
        </p>
        <div class="gs-steps">
          <h3>Get started</h3>
          <ol>
            <li>
              Install the BOA skill in your coding agent
              <code>claude plugin install boa</code>
            </li>
            <li>
              Ask your agent to build a backend
              <code>"Build a todo app with user auth and file uploads"</code>
            </li>
            <li>
              Or run the bootstrap command directly
              <code>boa init</code>
            </li>
            <li>
              Then reload this page &mdash; the dashboard will pick up your config automatically.
            </li>
          </ol>
        </div>
        <p style="margin-top: 1.5rem; font-size: 0.85rem; color: var(--gray-500);">
          You can also paste the path to your config.json in the topbar input above.
        </p>
      </div>
    `;
  }

  // ── Utilities ──────────────────────────────────────────────────────

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  /**
   * Render a command block with copy button.
   * @param {Object} opts
   * @param {string} opts.title
   * @param {string} opts.description
   * @param {string} opts.command
   * @returns {string} HTML string
   */
  function commandBlockHtml(opts) {
    const id = 'cmd-' + Math.random().toString(36).slice(2, 9);
    return `
      <div class="command-block">
        <div class="command-block-header">
          <div>
            <div class="command-block-title">${escapeHtml(opts.title)}</div>
            ${opts.description ? `<div class="command-block-desc">${escapeHtml(opts.description)}</div>` : ''}
          </div>
          <button class="copy-btn" data-copy-target="${id}" onclick="BOA.copyCommand(this, '${id}')">
            \u2398 Copy
          </button>
        </div>
        <pre class="command-code" id="${id}">${escapeHtml(opts.command)}</pre>
      </div>
    `;
  }

  function copyCommand(btn, targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;
    const text = el.textContent;
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = '\u2713 Copied';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = '\u2398 Copy';
        btn.classList.remove('copied');
      }, 2000);
    });
  }

  // ── Expose ─────────────────────────────────────────────────────────
  return {
    init,
    getConfig,
    getRegion,
    getStackName,
    awsCommand,
    renderGettingStarted,
    commandBlockHtml,
    copyCommand,
    escapeHtml,
  };
})();
