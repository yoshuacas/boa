<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useData } from 'vitepress'
const { site } = useData()

// --- Typing animation ---
const terminalLines = ref([])
const showCursor = ref(true)

const lines = [
  { type: 'cmd', prompt: '$', text: 'npm install -g boa-cli' },
  { type: 'cmd', prompt: '$', text: 'boa init my-app --region us-east-1' },
  { type: 'blank' },
  { type: 'output', icon: '\u2713', color: 'green', text: 'Aurora DSQL cluster created' },
  { type: 'output', icon: '\u2713', color: 'green', text: 'Cognito user pool deployed' },
  { type: 'output', icon: '\u2713', color: 'green', text: 'Lambda functions ready' },
  { type: 'output', icon: '\u2713', color: 'green', text: 'API Gateway configured' },
  { type: 'output', icon: '\u2713', color: 'green', text: 'S3 bucket created' },
  { type: 'blank' },
  { type: 'result', text: 'Backend live at ', highlight: 'https://abc123.execute-api.us-east-1.amazonaws.com' },
]

async function typeTerminal() {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.type === 'blank') {
      terminalLines.value.push({ ...line, typed: '' })
      await wait(100)
    } else if (line.type === 'cmd') {
      const entry = { ...line, typed: '' }
      terminalLines.value.push(entry)
      for (let c = 0; c < line.text.length; c++) {
        entry.typed = line.text.slice(0, c + 1)
        terminalLines.value = [...terminalLines.value]
        await wait(25 + Math.random() * 20)
      }
      await wait(400)
    } else {
      terminalLines.value.push({ ...line, typed: line.text, visible: false })
      terminalLines.value = [...terminalLines.value]
      await wait(30)
      terminalLines.value[terminalLines.value.length - 1].visible = true
      terminalLines.value = [...terminalLines.value]
      await wait(120)
    }
  }
  showCursor.value = false
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

// --- Static data ---
const howSteps = [
  { title: 'Describe your app', desc: 'Build a todo app with user accounts and file attachments' },
  { title: 'BOA deploys the stack', desc: 'Database, auth, APIs, storage \u2014 all created in your AWS account with one command.' },
  { title: 'Connect your frontend', desc: 'Use @supabase/supabase-js as a drop-in client. Every table is a REST endpoint.' },
  { title: 'Evolve with migrations', desc: 'Add tables, change schemas, track every change in numbered SQL files. No surprises.' },
]

const stackServices = [
  { label: 'Database', name: 'Aurora DSQL', desc: 'Serverless PostgreSQL. SQL you already know. Scales to zero. 100K DPUs free.' },
  { label: 'Auth', name: 'Amazon Cognito', desc: 'Sign-up, sign-in, MFA, social login. JWT tokens. 10,000 MAU free.' },
  { label: 'Compute', name: 'AWS Lambda', desc: 'Node.js 20.x handlers. No servers. 1M requests/month free.' },
  { label: 'API', name: 'API Gateway', desc: 'REST API with Cognito authorization. 1M requests/month free.' },
  { label: 'Storage', name: 'Amazon S3', desc: 'Presigned URLs. Never public. 5 GB free storage.' },
  { label: 'Hosting', name: 'AWS Amplify', desc: 'Frontend CI/CD from Git. Custom domains. Auto SSL.' },
  { label: 'IaC', name: 'SAM / CloudFormation', desc: 'One template defines everything. Repeatable, version-controlled deploys.' },
]

const comparisonRows = [
  { feature: 'You own the infrastructure', boa: { text: '\u2713', cls: 'check' }, supa: { text: '\u2715', cls: 'cross' }, fire: { text: '\u2715', cls: 'cross' }, amp: { text: 'Partial', cls: 'partial' } },
  { feature: 'Scales to zero ($0 idle)', boa: { text: '\u2713', cls: 'check' }, supa: { text: '$25/mo min', cls: 'cross' }, fire: { text: 'Partial', cls: 'partial' }, amp: { text: '\u2713', cls: 'check' } },
  { feature: 'PostgreSQL', boa: { text: 'Aurora DSQL', cls: 'check' }, supa: { text: '\u2713', cls: 'check' }, fire: { text: 'Firestore', cls: 'cross' }, amp: { text: 'DynamoDB', cls: 'cross' } },
  { feature: 'Agent-ready skill', boa: { text: '\u2713', cls: 'check' }, supa: { text: '\u2715', cls: 'cross' }, fire: { text: '\u2715', cls: 'cross' }, amp: { text: '\u2715', cls: 'cross' } },
  { feature: 'One-command deploy', boa: { text: '\u2713', cls: 'check' }, supa: { text: 'Managed', cls: 'na' }, fire: { text: 'Managed', cls: 'na' }, amp: { text: '\u2713', cls: 'check' } },
  { feature: 'No vendor lock-in', boa: { text: '\u2713', cls: 'check' }, supa: { text: '\u2715', cls: 'cross' }, fire: { text: '\u2715', cls: 'cross' }, amp: { text: 'AWS only', cls: 'partial' } },
  { feature: 'Supabase-JS compatible', boa: { text: 'Drop-in', cls: 'check' }, supa: { text: 'Native', cls: 'check' }, fire: { text: '\u2715', cls: 'cross' }, amp: { text: '\u2715', cls: 'cross' } },
]

const pricingTiers = [
  { name: 'Prototype', users: '50 users', price: '$0', sub: '/mo', note: 'Free tier covers everything', free: true },
  { name: 'Startup', users: '1,000 users', price: '$0', sub: '/mo', note: 'Still within free tier', free: true },
  { name: 'Growth', users: '100K users', price: '~$500', sub: '/mo', note: 'vs $1,300+ on Supabase', free: false },
  { name: 'Scale', users: '2M users', price: 'Pay-as-you-go', sub: '', note: 'Same stack, no re-architecture', free: false, highlighted: true },
]

const agents = [
  { name: 'Claude Code', cmd: 'claude --plugin-dir ~/boa/plugin' },
  { name: 'Kiro', cmd: 'ln -s ~/boa/plugin/skills/boa .kiro/skills/boa' },
  { name: 'VS Code Copilot', cmd: 'ln -s ~/boa/plugin/AGENTS.md .github/copilot-instructions.md' },
  { name: 'Codex', cmd: 'ln -s ~/boa/plugin/skills/boa .agents/skills/boa' },
]

// --- Scroll reveal ---
const observer = ref(null)

onMounted(() => {
  typeTerminal()

  observer.value = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed')
        observer.value.unobserve(entry.target)
      }
    })
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' })

  document.querySelectorAll('.reveal').forEach(el => {
    observer.value.observe(el)
  })
})

onUnmounted(() => {
  if (observer.value) observer.value.disconnect()
})
</script>

<template>
  <div class="home-layout">

    <!-- ============ HERO ============ -->
    <section class="hero">
      <div class="hero-bg">
        <div class="hero-grid"></div>
        <div class="hero-glow"></div>
      </div>
      <div class="hero-content">
        <h1 class="hero-title">Backend on AWS</h1>
        <p class="hero-subtitle">Without the complexity</p>
        <p class="hero-tagline">
          A complete backend on AWS in under a minute. Built for agents. Free until your users show up. No ceiling when they do.
        </p>
        <div class="hero-actions">
          <a href="/boa/docs/getting-started" class="btn btn-primary">Get Started</a>
          <a href="https://github.com/yoshuacas/boa" target="_blank" rel="noopener" class="btn btn-outline">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            View on GitHub
          </a>
        </div>

        <!-- Animated terminal -->
        <div class="hero-terminal">
          <div class="terminal-header">
            <span class="terminal-dot red"></span>
            <span class="terminal-dot yellow"></span>
            <span class="terminal-dot green"></span>
            <span class="terminal-title">~/my-app</span>
          </div>
          <div class="terminal-body">
            <div v-for="(line, i) in terminalLines" :key="i" class="terminal-line" :class="{ 'fade-in': line.visible !== false }">
              <template v-if="line.type === 'blank'"><br></template>
              <template v-else-if="line.type === 'cmd'">
                <span class="terminal-prompt">{{ line.prompt }}</span>
                <span class="terminal-cmd">{{ line.typed }}</span>
              </template>
              <template v-else-if="line.type === 'output'">
                <span class="terminal-success">{{ line.icon }}</span>
                <span class="terminal-output-text">{{ line.typed }}</span>
              </template>
              <template v-else-if="line.type === 'result'">
                <span class="terminal-highlight">{{ line.text }}</span>
                <span class="terminal-url">{{ line.highlight }}</span>
              </template>
            </div>
            <span v-if="showCursor" class="terminal-cursor"></span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ ANNOUNCEMENT BAR ============ -->
    <section class="announcement">
      <div class="container">
        <span class="announcement-badge">New</span>
        April 28, 2026 — BOA is now available. Install the CLI, add the skill to your agent, and deploy your first backend.
        <a href="/boa/install">Install now &rarr;</a>
      </div>
    </section>

    <!-- ============ FOUR PILLARS ============ -->
    <section class="pillars reveal">
      <div class="container">
        <div class="pillars-grid">

          <div class="pillar">
            <div class="pillar-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
            </div>
            <h3>Serverless Backend</h3>
            <p>Database, auth, APIs, storage on AWS. Scales to zero when idle, scales to millions under load. You own every resource.</p>
          </div>

          <div class="pillar">
            <div class="pillar-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="5" y="4" width="14" height="12" rx="2"/>
                <circle cx="9" cy="10" r="1.5" fill="currentColor"/>
                <circle cx="15" cy="10" r="1.5" fill="currentColor"/>
                <path d="M9 16v2"/>
                <path d="M15 16v2"/>
                <path d="M7 18h4"/>
                <path d="M13 18h4"/>
                <path d="M8 2h2"/>
                <path d="M14 2h2"/>
              </svg>
            </div>
            <h3>Agent-Ready</h3>
            <p>Stop teaching your agent how AWS works. The BOA skill already knows every pattern and pitfall — just describe what you need built.</p>
          </div>

          <div class="pillar">
            <div class="pillar-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="4 17 10 11 4 5"/>
                <line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
            </div>
            <h3>One CLI</h3>
            <p><code>boa init</code>, <code>boa deploy</code>, <code>boa migrate</code>. Full lifecycle in one tool. Developers and agents use the same commands.</p>
          </div>

          <div class="pillar">
            <div class="pillar-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <polyline points="9 12 11 14 15 10"/>
              </svg>
            </div>
            <h3>Safe by Default</h3>
            <p>Opinionated guardrails prevent the mistakes that kill projects. Data protected, schema tracked, infrastructure can't be accidentally destroyed.</p>
          </div>

        </div>
      </div>
    </section>

    <!-- ============ HOW IT WORKS ============ -->
    <section class="how-it-works reveal">
      <div class="container">
        <h2 class="section-title">Tell your agent what to build. BOA handles the rest.</h2>
        <p class="section-subtitle">Your agent uses the BOA CLI under the hood — same commands you'd run yourself.</p>

        <div class="how-grid">
          <div class="how-step" v-for="(step, i) in howSteps" :key="i">
            <div class="step-number">{{ i + 1 }}</div>
            <h4>{{ step.title }}</h4>
            <p>{{ step.desc }}</p>
            <div v-if="i < 3" class="step-connector"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ THE STACK ============ -->
    <section class="stack reveal">
      <div class="container">
        <h2 class="section-title">Seven AWS services. One opinionated stack.</h2>
        <p class="section-subtitle">Every service is serverless. No servers to manage, no capacity planning, pay only for what you use.</p>

        <div class="stack-grid">
          <div class="stack-card" v-for="svc in stackServices" :key="svc.label">
            <div class="stack-card-header">
              <span class="stack-label">{{ svc.label }}</span>
            </div>
            <h4>{{ svc.name }}</h4>
            <p>{{ svc.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ COMPARISON ============ -->
    <section class="comparison reveal">
      <div class="container">
        <h2 class="section-title">How BOA compares</h2>
        <p class="section-subtitle">BOA gives you the Supabase developer experience on infrastructure you own.</p>

        <div class="comparison-table-wrap">
          <table class="comparison-table">
            <thead>
              <tr>
                <th></th>
                <th class="highlight-col">BOA</th>
                <th>Supabase</th>
                <th>Firebase</th>
                <th>Amplify Gen 2</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in comparisonRows" :key="row.feature">
                <td class="feature-name">{{ row.feature }}</td>
                <td class="highlight-col"><span :class="row.boa.cls">{{ row.boa.text }}</span></td>
                <td><span :class="row.supa.cls">{{ row.supa.text }}</span></td>
                <td><span :class="row.fire.cls">{{ row.fire.text }}</span></td>
                <td><span :class="row.amp.cls">{{ row.amp.text }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ============ PRICING PREVIEW ============ -->
    <section class="pricing-preview reveal">
      <div class="container">
        <h2 class="section-title">$0/month for your first 1,000 users</h2>
        <p class="section-subtitle">
          The AWS Free Tier covers the entire BOA stack for most prototypes and early-stage apps.
          No credit card traps, no surprise bills.
        </p>

        <div class="pricing-tiers">
          <div v-for="tier in pricingTiers" :key="tier.name" class="tier" :class="{ highlighted: tier.highlighted }">
            <div class="tier-name">{{ tier.name }}</div>
            <div class="tier-users">{{ tier.users }}</div>
            <div class="tier-price" :class="{ free: tier.free }">{{ tier.price }}<span v-if="tier.sub">{{ tier.sub }}</span></div>
            <div class="tier-note">{{ tier.note }}</div>
          </div>
        </div>

        <div class="pricing-cta">
          <a href="/boa/pricing" class="btn btn-secondary">See full pricing calculator &rarr;</a>
        </div>
      </div>
    </section>

    <!-- ============ AGENTS ============ -->
    <section class="agents reveal">
      <div class="container">
        <h2 class="section-title">Works with any coding agent</h2>
        <p class="section-subtitle">Install the BOA skill once. Use it with whichever agent fits your workflow.</p>

        <div class="agents-grid">
          <div v-for="agent in agents" :key="agent.name" class="agent-card">
            <div class="agent-name">{{ agent.name }}</div>
            <div class="agent-setup"><code>{{ agent.cmd }}</code></div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ CTA ============ -->
    <section class="cta reveal">
      <div class="container">
        <h2 class="cta-title">Build your first backend in 10 minutes</h2>
        <p class="cta-subtitle">Open source. Apache 2.0. Free forever.</p>
        <div class="cta-actions">
          <a href="/boa/docs/getting-started" class="btn btn-primary btn-lg">Get Started</a>
          <a href="https://github.com/yoshuacas/boa" target="_blank" rel="noopener" class="btn btn-outline btn-lg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            Star on GitHub
          </a>
        </div>
      </div>
    </section>

    <!-- ============ FOOTER ============ -->
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-col">
            <h4>BOA</h4>
            <ul>
              <li><a href="/boa/docs/getting-started">Getting Started</a></li>
              <li><a href="/boa/docs/how-it-works">How It Works</a></li>
              <li><a href="/boa/install">Install</a></li>
              <li><a href="/boa/pricing">Pricing</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Docs</h4>
            <ul>
              <li><a href="/boa/docs/database/overview">Database</a></li>
              <li><a href="/boa/docs/auth/overview">Auth</a></li>
              <li><a href="/boa/docs/api/overview">API</a></li>
              <li><a href="/boa/docs/storage/overview">Storage</a></li>
              <li><a href="/boa/docs/faq">FAQ</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Community</h4>
            <ul>
              <li><a href="https://github.com/yoshuacas/boa" target="_blank" rel="noopener">GitHub</a></li>
              <li><a href="https://github.com/yoshuacas/boa/issues" target="_blank" rel="noopener">Issues</a></li>
              <li><a href="https://github.com/yoshuacas/boa/blob/main/LICENSE" target="_blank" rel="noopener">Apache 2.0 License</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <p>BOA is an open-source project from AWS. Released under the Apache 2.0 License.</p>
        </div>
      </div>
    </footer>

  </div>
</template>

<style scoped>
/* ============================================================
   HomeLayout — Dark Theme with Animations
   ============================================================ */

.home-layout {
  background-color: #0A0A0A;
  color: #FFFFFF;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}

.container {
  max-width: 1140px;
  margin: 0 auto;
  padding: 0 24px;
}

/* --- SCROLL REVEAL --- */
.reveal {
  opacity: 0;
  transform: translateY(32px);
  transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
}

.reveal.revealed {
  opacity: 1;
  transform: translateY(0);
}

/* --- HERO --- */
.hero {
  position: relative;
  padding: 120px 24px 80px;
  text-align: center;
  overflow: hidden;
}

.hero-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.hero-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 153, 0, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 153, 0, 0.03) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse 70% 50% at 50% 30%, black 0%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse 70% 50% at 50% 30%, black 0%, transparent 70%);
}

.hero-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255, 153, 0, 0.1) 0%, transparent 70%);
  animation: glowPulse 4s ease-in-out infinite;
}

@keyframes glowPulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.hero-content {
  position: relative;
  max-width: 800px;
  margin: 0 auto;
}

.hero-title {
  font-size: 5.5rem;
  font-weight: 900;
  letter-spacing: -0.04em;
  line-height: 1;
  margin: 0;
  background: linear-gradient(135deg, #FF9900 0%, #EC7211 40%, #FFCC00 60%, #FF9900 100%);
  background-size: 200% 200%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: gradientShift 6s ease-in-out infinite;
}

@keyframes gradientShift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

.hero-subtitle {
  font-size: 1.75rem;
  font-weight: 600;
  color: #FFFFFF;
  margin: 16px 0 0;
  letter-spacing: -0.01em;
}

.hero-tagline {
  font-size: 1.15rem;
  color: #888888;
  margin: 16px auto 0;
  line-height: 1.6;
  max-width: 600px;
}

.hero-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 36px;
}

/* --- BUTTONS --- */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
  border: none;
}

.btn-primary {
  background: #FF9900;
  color: #000000;
  box-shadow: 0 0 0 0 rgba(255, 153, 0, 0);
}

.btn-primary:hover {
  background: #FFAD33;
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(255, 153, 0, 0.25);
}

.btn-outline {
  background: transparent;
  color: #FFFFFF;
  border: 1.5px solid #333333;
}

.btn-outline:hover {
  border-color: #FF9900;
  color: #FF9900;
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(255, 153, 0, 0.1);
}

.btn-secondary {
  background: #161616;
  color: #FF9900;
  border: 1.5px solid #2A2A2A;
}

.btn-secondary:hover {
  background: #1A1A1A;
  border-color: #FF9900;
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(255, 153, 0, 0.1);
}

.btn-lg { padding: 14px 32px; font-size: 1.05rem; }

/* --- TERMINAL (animated) --- */
.hero-terminal {
  max-width: 580px;
  margin: 44px auto 0;
  background: #0D0D0D;
  border: 1px solid #2A2A2A;
  border-radius: 12px;
  overflow: hidden;
  text-align: left;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(255, 153, 0, 0.03);
}

.terminal-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: #161616;
  border-bottom: 1px solid #2A2A2A;
}

.terminal-dot { width: 10px; height: 10px; border-radius: 50%; }
.terminal-dot.red { background: #FF5F57; }
.terminal-dot.yellow { background: #FEBC2E; }
.terminal-dot.green { background: #28C840; }

.terminal-title {
  margin-left: auto;
  font-size: 0.7rem;
  color: #555;
  font-family: 'JetBrains Mono', monospace;
}

.terminal-body {
  padding: 18px 20px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.82rem;
  line-height: 1.8;
  color: #CCCCCC;
  min-height: 200px;
}

.terminal-line {
  transition: opacity 0.3s ease;
}

.terminal-prompt { color: #FF9900; margin-right: 8px; user-select: none; }
.terminal-cmd { color: #FFFFFF; }
.terminal-output-text { color: #999; margin-left: 6px; }
.terminal-success { color: #28C840; }
.terminal-highlight { color: #FF9900; }
.terminal-url { color: #5C9DFF; }

.terminal-cursor {
  display: inline-block;
  width: 8px;
  height: 16px;
  background: #FF9900;
  margin-left: 2px;
  animation: blink 0.8s step-end infinite;
  vertical-align: text-bottom;
}

@keyframes blink {
  50% { opacity: 0; }
}

/* --- ANNOUNCEMENT BAR --- */
.announcement {
  background: rgba(255, 153, 0, 0.04);
  border-top: 1px solid rgba(255, 153, 0, 0.12);
  border-bottom: 1px solid rgba(255, 153, 0, 0.12);
  padding: 14px 24px;
  text-align: center;
  font-size: 0.9rem;
  color: #CCCCCC;
}

.announcement-badge {
  display: inline-block;
  background: #FF9900;
  color: #000000;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 3px 10px;
  border-radius: 20px;
  margin-right: 10px;
  vertical-align: middle;
  animation: badgePulse 2s ease-in-out infinite;
}

@keyframes badgePulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 153, 0, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(255, 153, 0, 0); }
}

.announcement a { color: #FF9900; text-decoration: none; font-weight: 600; margin-left: 6px; }
.announcement a:hover { text-decoration: underline; }

/* --- PILLARS --- */
.pillars {
  padding: 80px 24px;
  background: #0A0A0A;
}

.pillars-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: #2A2A2A;
  border: 1px solid #2A2A2A;
  border-radius: 12px;
  overflow: hidden;
}

.pillar {
  padding: 32px 28px;
  background: #111111;
  transition: background 0.3s ease;
}

.pillar:hover {
  background: #151515;
}

.pillar-icon {
  color: #FF9900;
  margin-bottom: 16px;
  transition: transform 0.3s ease;
}

.pillar:hover .pillar-icon {
  transform: scale(1.1);
}

.pillar h3 { font-size: 1.1rem; font-weight: 700; color: #FFFFFF; margin: 0 0 8px; }
.pillar p { font-size: 0.9rem; color: #888888; line-height: 1.6; margin: 0; }
.pillar code {
  background: #1A1A1A; padding: 2px 6px; border-radius: 4px;
  font-size: 0.82rem; color: #FF9900; font-family: 'JetBrains Mono', monospace;
}

/* --- SECTION TITLES --- */
.section-title {
  font-size: 2rem; font-weight: 800; color: #FFFFFF;
  text-align: center; margin: 0; letter-spacing: -0.02em;
}

.section-subtitle {
  font-size: 1.05rem; color: #888888;
  text-align: center; margin: 12px 0 0; line-height: 1.6;
}

/* --- HOW IT WORKS --- */
.how-it-works {
  padding: 80px 24px;
  background: #111111;
  position: relative;
}

.how-it-works::before {
  content: '';
  position: absolute;
  top: 0; left: 50%;
  transform: translateX(-50%);
  width: 200px; height: 1px;
  background: linear-gradient(90deg, transparent, #FF9900, transparent);
}

.how-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  margin-top: 48px;
}

.how-step {
  padding: 28px 24px;
  background: #161616;
  border: 1px solid #2A2A2A;
  border-radius: 10px;
  position: relative;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

.how-step:hover {
  border-color: rgba(255, 153, 0, 0.3);
  box-shadow: 0 0 30px rgba(255, 153, 0, 0.05);
}

.step-number {
  display: inline-flex;
  align-items: center; justify-content: center;
  width: 36px; height: 36px;
  border-radius: 50%;
  background: rgba(255, 153, 0, 0.1);
  border: 1px solid rgba(255, 153, 0, 0.2);
  color: #FF9900;
  font-size: 0.85rem; font-weight: 700;
  margin-bottom: 16px;
}

.how-step h4 { font-size: 1rem; font-weight: 700; color: #FFFFFF; margin: 0 0 8px; }
.how-step p { font-size: 0.88rem; color: #888888; line-height: 1.6; margin: 0; }
.how-step code {
  background: #1A1A1A; padding: 2px 6px; border-radius: 4px;
  font-size: 0.8rem; color: #FF9900; font-family: 'JetBrains Mono', monospace;
}

/* --- THE STACK --- */
.stack {
  padding: 80px 24px;
  background: #0A0A0A;
  position: relative;
}

.stack::before {
  content: '';
  position: absolute;
  top: 0; left: 50%;
  transform: translateX(-50%);
  width: 200px; height: 1px;
  background: linear-gradient(90deg, transparent, #FF9900, transparent);
}

.stack-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-top: 48px;
}

.stack-card {
  background: #111111;
  border: 1px solid #2A2A2A;
  border-radius: 10px;
  padding: 24px;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.stack-card:hover {
  border-color: #FF9900;
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(255, 153, 0, 0.08);
}

.stack-card-header { margin-bottom: 12px; }

.stack-label {
  font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: #FF9900;
  background: rgba(255, 153, 0, 0.1); padding: 3px 8px; border-radius: 4px;
}

.stack-card h4 { font-size: 1rem; font-weight: 700; color: #FFFFFF; margin: 0 0 6px; }
.stack-card p { font-size: 0.85rem; color: #888888; line-height: 1.5; margin: 0; }

/* --- COMPARISON --- */
.comparison {
  padding: 80px 24px;
  background: #111111;
  position: relative;
}

.comparison::before {
  content: '';
  position: absolute;
  top: 0; left: 50%;
  transform: translateX(-50%);
  width: 200px; height: 1px;
  background: linear-gradient(90deg, transparent, #FF9900, transparent);
}

.comparison-table-wrap { margin-top: 48px; overflow-x: auto; }

.comparison-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }

.comparison-table th {
  padding: 14px 20px; text-align: center;
  font-size: 0.85rem; font-weight: 700; color: #888888;
  border-bottom: 2px solid #2A2A2A;
  text-transform: uppercase; letter-spacing: 0.04em;
}

.comparison-table th.highlight-col { color: #FF9900; background: rgba(255, 153, 0, 0.04); }

.comparison-table td {
  padding: 14px 20px; text-align: center;
  border-bottom: 1px solid #1A1A1A; color: #CCCCCC;
}

.comparison-table td.highlight-col { background: rgba(255, 153, 0, 0.04); }
.comparison-table td.feature-name { text-align: left; font-weight: 600; color: #FFFFFF; }
.comparison-table tbody tr { transition: background 0.2s ease; }
.comparison-table tbody tr:hover { background: rgba(255, 255, 255, 0.02); }

.check { color: #28C840; font-weight: 700; }
.cross { color: #555555; }
.partial { color: #FEBC2E; font-size: 0.82rem; }
.na { color: #555555; font-size: 0.82rem; }

/* --- PRICING PREVIEW --- */
.pricing-preview {
  padding: 80px 24px;
  background: #0A0A0A;
  position: relative;
}

.pricing-preview::before {
  content: '';
  position: absolute;
  top: 0; left: 50%;
  transform: translateX(-50%);
  width: 200px; height: 1px;
  background: linear-gradient(90deg, transparent, #FF9900, transparent);
}

.pricing-tiers {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-top: 48px;
}

.tier {
  background: #111111;
  border: 1px solid #2A2A2A;
  border-radius: 10px;
  padding: 28px 24px;
  text-align: center;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.tier:hover {
  border-color: #333333;
  transform: translateY(-4px);
}

.tier.highlighted {
  border-color: #FF9900;
  background: rgba(255, 153, 0, 0.04);
  box-shadow: 0 0 40px rgba(255, 153, 0, 0.06);
}

.tier-name { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888888; margin-bottom: 4px; }
.tier-users { font-size: 0.9rem; color: #CCCCCC; margin-bottom: 16px; }
.tier-price { font-size: 2rem; font-weight: 800; color: #FFFFFF; margin-bottom: 8px; }
.tier-price.free { color: #28C840; }
.tier-price span { font-size: 0.9rem; font-weight: 400; color: #888888; }
.tier-note { font-size: 0.8rem; color: #666666; }
.pricing-cta { text-align: center; margin-top: 32px; }

/* --- AGENTS --- */
.agents {
  padding: 80px 24px;
  background: #111111;
  position: relative;
}

.agents::before {
  content: '';
  position: absolute;
  top: 0; left: 50%;
  transform: translateX(-50%);
  width: 200px; height: 1px;
  background: linear-gradient(90deg, transparent, #FF9900, transparent);
}

.agents-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-top: 48px;
}

.agent-card {
  background: #161616;
  border: 1px solid #2A2A2A;
  border-radius: 10px;
  padding: 24px;
  text-align: center;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.agent-card:hover {
  border-color: #FF9900;
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(255, 153, 0, 0.08);
}

.agent-name { font-size: 1rem; font-weight: 700; color: #FFFFFF; margin-bottom: 12px; }

.agent-setup code {
  display: block; background: #111111; padding: 10px 12px; border-radius: 6px;
  font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; color: #888888;
  word-break: break-all; line-height: 1.4;
}

/* --- CTA --- */
.cta {
  padding: 100px 24px;
  text-align: center;
  background: #0A0A0A;
  position: relative;
}

.cta::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 60% 50% at 50% 100%, rgba(255, 153, 0, 0.06) 0%, transparent 70%);
  pointer-events: none;
}

.cta::after {
  content: '';
  position: absolute;
  top: 0; left: 50%;
  transform: translateX(-50%);
  width: 200px; height: 1px;
  background: linear-gradient(90deg, transparent, #FF9900, transparent);
}

.cta-title { font-size: 2.5rem; font-weight: 800; color: #FFFFFF; margin: 0; letter-spacing: -0.02em; position: relative; }
.cta-subtitle { font-size: 1.1rem; color: #888888; margin: 12px 0 0; position: relative; }
.cta-actions { display: flex; gap: 12px; justify-content: center; margin-top: 32px; position: relative; }

/* --- FOOTER --- */
.site-footer {
  padding: 60px 24px 40px;
  background: #0A0A0A;
  border-top: 1px solid #1A1A1A;
}

.footer-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; }
.footer-col h4 { font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888888; margin: 0 0 16px; }
.footer-col ul { list-style: none; padding: 0; margin: 0; }
.footer-col li { margin-bottom: 8px; }
.footer-col a { color: #CCCCCC; text-decoration: none; font-size: 0.9rem; transition: color 0.15s ease; }
.footer-col a:hover { color: #FF9900; }
.footer-bottom { margin-top: 40px; padding-top: 24px; border-top: 1px solid #1A1A1A; text-align: center; }
.footer-bottom p { font-size: 0.82rem; color: #666666; margin: 0; }

/* --- RESPONSIVE --- */
@media (max-width: 960px) {
  .hero-title { font-size: 4rem; }
  .pillars-grid, .how-grid, .stack-grid, .pricing-tiers, .agents-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 640px) {
  .hero { padding: 80px 16px 60px; }
  .hero-title { font-size: 3rem; }
  .hero-subtitle { font-size: 1.3rem; }
  .hero-tagline { font-size: 1rem; }
  .hero-actions { flex-direction: column; align-items: center; }
  .pillars-grid, .how-grid, .stack-grid, .pricing-tiers, .agents-grid { grid-template-columns: 1fr; }
  .section-title { font-size: 1.6rem; }
  .cta-title { font-size: 1.8rem; }
  .comparison-table { font-size: 0.8rem; }
  .comparison-table th, .comparison-table td { padding: 10px 12px; }
  .footer-grid { grid-template-columns: 1fr; gap: 24px; }
}
</style>
