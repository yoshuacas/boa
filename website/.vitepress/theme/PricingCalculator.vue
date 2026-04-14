<script setup>
import { ref, computed, onMounted } from 'vue'

const pricingData = ref(null)
const loadError = ref(false)
const selectedApp = ref('productivity')
const selectedExtension = ref('cloudfront')

onMounted(async () => {
  try {
    const resp = await fetch('/boa/data/pricing-data.json')
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    pricingData.value = await resp.json()
  } catch {
    loadError.value = true
  }
})

function fmt(val) {
  if (val === 0) return '$0'
  if (val < 0.01) return '<$0.01'
  if (val < 1) return `$${val.toFixed(2)}`
  if (val >= 1000) return `$${val.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  if (val >= 100) return `$${Math.round(val)}`
  return `$${val.toFixed(2)}`
}

function fmtNum(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`
  return n.toString()
}

const appOptions = [
  { key: 'productivity', label: 'Productivity', desc: 'Todo, notes, project management' },
  { key: 'social', label: 'Social', desc: 'Feeds, posts, media' },
  { key: 'ecommerce', label: 'E-Commerce', desc: 'Catalog, cart, orders' },
  { key: 'healthIot', label: 'Health / IoT', desc: 'Sensors, wearables, tracking' },
]

const appDescriptions = {
  productivity: 'Each user makes about 1,000 API calls per month. Most are reads (60%), the rest are creates and updates. Each user stores about 5 KB in the database and 50 KB in files.',
  social: 'Each user makes about 3,000 API calls per month. Most are reading feeds and browsing (80%), the rest are posting and commenting. Each user stores about 20 KB in the database and 500 KB in files (images, avatars).',
  realtime: 'Each user makes about 8,000 API calls per month, roughly half reading messages and half sending them. Each user stores about 30 KB in the database and 100 KB in files.',
  ecommerce: 'Each user makes about 2,000 API calls per month. Most are browsing products and checking orders (75%), the rest are cart updates and purchases. Each user stores about 15 KB in the database and 200 KB in files.',
  saas: 'Each user makes about 4,000 API calls per month. Most are loading dashboards and reports (70%), the rest are data entry and updates. Each user stores about 50 KB in the database and 300 KB in files.',
  healthIot: 'Each device makes about 7,500 API calls per month. Almost all are writing sensor data and logs (94%), with occasional reads. Each device stores about 500 KB in the database and 5 MB in files.',
}

const extensionOptions = [
  { key: 'cloudfront', label: 'CloudFront + WAF', desc: 'Default. DDoS protection, rate limiting, CDN.' },
  { key: 'apigateway', label: 'API Gateway', desc: 'Extension. REST API, usage plans, rate limiting.' },
  { key: 'alb', label: 'Load Balancer', desc: 'Extension. Traditional routing, always on.' },
  { key: 'none', label: 'None', desc: 'Direct access, no protection.' },
]

const tiers = computed(() => pricingData.value?.sizeTiers || {})

const rows = computed(() => {
  const scenarios = pricingData.value?.scenarios[selectedApp.value] || []
  return scenarios.map(s => ({
    workload: s.workload,
    boa: s.boa[selectedExtension.value],
    supa: s.supa,
  }))
})

const genDate = computed(() => pricingData.value?.generatedAt?.slice(0, 10) || '')

const services = computed(() => {
  const base = [
    { key: 'dsql', name: 'Database', detail: '(Aurora DSQL)' },
    { key: 'cognito', name: 'Auth', detail: '(Cognito)' },
    { key: 'lambda', name: 'Compute', detail: '(Lambda)' },
  ]
  const trafficServices = {
    cloudfront: { key: 'traffic', name: 'Protection', detail: '(CloudFront + WAF)' },
    apigateway: { key: 'traffic', name: 'API Routing', detail: '(API Gateway)' },
    alb: { key: 'traffic', name: 'Load Balancer', detail: '(ALB)' },
  }
  if (selectedExtension.value !== 'none') {
    base.push(trafficServices[selectedExtension.value])
  }
  base.push({ key: 's3', name: 'Storage', detail: '(S3)' })
  return base
})

const freeTierServices = computed(() => {
  const ftServices = [
    { key: 'dsql', name: 'Database', ftLabel: '100K read/write units + 1 GB storage free', ftType: 'always' },
    { key: 'cognito', name: 'Auth', ftLabel: '10,000 monthly users free', ftType: 'always' },
    { key: 'lambda', name: 'Compute', ftLabel: '1M requests + 400K GB-seconds free', ftType: 'always' },
  ]
  const ext = selectedExtension.value
  if (ext === 'cloudfront') {
    ftServices.push({ key: 'traffic', name: 'Protection', ftLabel: '10M requests + 1 TB transfer free', ftType: 'always' })
  } else if (ext === 'apigateway') {
    ftServices.push({ key: 'traffic', name: 'API Routing', ftLabel: '1M requests free', ftType: '12mo' })
  } else if (ext === 'alb') {
    ftServices.push({ key: 'traffic', name: 'Load Balancer', ftLabel: '750 hours + 15 capacity units free', ftType: '12mo' })
  }
  ftServices.push({ key: 's3', name: 'Storage', ftLabel: '5 GB + 2K uploads + 20K downloads free', ftType: '12mo' })
  return ftServices
})

const freeTierExplain = computed(() => {
  const ext = selectedExtension.value
  const base = 'Database, Auth, and Compute are <strong>free forever</strong>, no matter how long you\'ve had your AWS account.'
  const s3 = 'Storage (S3) is <strong>free for your first 12 months</strong> on AWS.'
  if (ext === 'cloudfront') {
    return `${base} Protection (CloudFront) includes 10M requests and 1 TB of transfer free every month, also forever. ${s3}`
  }
  if (ext === 'apigateway') {
    return `${base} API Gateway is <strong>free for your first 12 months</strong> (1M requests/month). ${s3}`
  }
  if (ext === 'alb') {
    return `${base} Load Balancer is <strong>free for your first 12 months</strong> (750 hours + 15 capacity units/month). ${s3}`
  }
  return `${base} ${s3}`
})

const footerText = computed(() => {
  const ext = selectedExtension.value
  if (ext === 'cloudfront') return 'CloudFront provides DDoS protection, web firewall, and edge caching. Lambda Function URLs are secured with IAM authentication.'
  if (ext === 'apigateway') return 'API Gateway adds throttling, usage plans, and web firewall support. Replaces Lambda Function URLs.'
  if (ext === 'alb') return 'Load Balancer adds web firewall support and health checks. Always-on cost even at zero traffic. Replaces Lambda Function URLs.'
  return 'Lambda Function URLs are free. No traffic layer selected, no DDoS protection.'
})
</script>

<template>
<div class="calc">

<div v-if="loadError" class="calc-error">
  Pricing data unavailable. Run <code>node website/scripts/generate-pricing.mjs</code>
</div>

<template v-else-if="pricingData">

<!-- App type selector (pill buttons) -->
<div class="app-row">
  <div class="app-row-label">What are you building?</div>
  <div class="app-options">
    <button v-for="opt in appOptions" :key="opt.key"
            :class="['app-btn', { active: selectedApp === opt.key }]"
            @click="selectedApp = opt.key">
      <span class="app-btn-label">{{ opt.label }}</span>
      <span class="app-btn-desc">{{ opt.desc }}</span>
    </button>
  </div>
</div>

<!-- App traffic description -->
<p class="app-desc">{{ appDescriptions[selectedApp] }}</p>

<!-- Cost grid -->
<div class="cost-grid">

  <!-- Header row -->
  <div class="grid-corner"></div>
  <div v-for="r in rows" :key="'h-' + r.workload.sizeKey" class="grid-header">
    <div class="tier-name">{{ tiers[r.workload.sizeKey].name }}</div>
    <div class="tier-users">{{ fmtNum(tiers[r.workload.sizeKey].users) }} users</div>
  </div>

  <!-- Service rows (gross cost) -->
  <template v-for="svc in services" :key="svc.key + '-' + svc.name">
    <div class="grid-label">
      <span class="svc-name">{{ svc.name }}</span>
      <span class="svc-detail">{{ svc.detail }}</span>
    </div>
    <div v-for="r in rows" :key="svc.key + '-' + svc.name + '-' + r.workload.sizeKey" class="grid-cell">
      <span class="val-normal">{{ fmt(r.boa.gross[svc.key]) }}</span>
    </div>
  </template>

  <!-- Subtotal row -->
  <div class="grid-label subtotal-label"><span class="svc-name">Subtotal</span></div>
  <div v-for="r in rows" :key="'sub-' + r.workload.sizeKey" class="grid-cell subtotal-cell">
    {{ fmt(r.boa.gross.total) }}
  </div>

  <!-- Free tier section header -->
  <div class="grid-label ft-header-label">
    <span class="ft-header-text">AWS Free Tier</span>
    <span class="ft-header-sub">Included with every AWS account</span>
  </div>
  <div v-for="r in rows" :key="'fth-' + r.workload.sizeKey" class="grid-cell ft-header-cell"></div>

  <!-- Free tier discount rows (per service) -->
  <template v-for="svc in freeTierServices" :key="'ft-' + svc.key">
    <div class="grid-label ft-label">
      <span class="svc-name ft-name">{{ svc.name }}</span>
      <span class="svc-detail ft-detail">{{ svc.ftLabel }}</span>
      <span class="ft-type" :class="svc.ftType === 'always' ? 'ft-type-always' : 'ft-type-12mo'">{{ svc.ftType === 'always' ? 'Always free' : '12 months' }}</span>
    </div>
    <div v-for="r in rows" :key="'ft-' + svc.key + '-' + r.workload.sizeKey" class="grid-cell ft-cell">
      <span v-if="r.boa.freeTier[svc.key] > 0" class="val-free">&minus;{{ fmt(r.boa.freeTier[svc.key]) }}</span>
      <span v-else class="val-dim">&mdash;</span>
    </div>
  </template>

  <!-- You pay row -->
  <div class="grid-label total-label"><span class="svc-name">You pay / month</span></div>
  <div v-for="r in rows" :key="'t-' + r.workload.sizeKey" class="grid-total">
    <span :class="r.boa.total === 0 ? 'val-free-big' : 'val-boa'">{{ fmt(r.boa.total) }}</span>
  </div>

</div>

<!-- Free tier explanation -->
<div class="ft-explain">
  <p>
    <strong>How the free tier works:</strong>
    <span v-html="freeTierExplain"></span>
  </p>
</div>

<!-- Traffic layer selector (secondary) -->
<div class="traffic-section">
  <div class="traffic-header">
    <span class="traffic-title">Traffic layer</span>
    <span class="traffic-sub">Choose how traffic reaches your backend</span>
  </div>
  <div class="ext-options">
    <button v-for="opt in extensionOptions" :key="opt.key"
            :class="['ext-btn', { active: selectedExtension === opt.key }]"
            @click="selectedExtension = opt.key">
      <span class="ext-btn-label">{{ opt.label }}</span>
      <span class="ext-btn-desc">{{ opt.desc }}</span>
    </button>
  </div>
</div>

<p class="calc-footer">
  Prices based on US East (N. Virginia), {{ genDate }}. {{ footerText }}
</p>

</template>

<div v-else class="calc-loading">Loading...</div>

</div>
</template>

<style scoped>
.calc { margin-top: 1rem; }

.calc-loading, .calc-error {
  text-align: center;
  padding: 3rem;
  color: var(--vp-c-text-3);
}

.calc-error {
  color: #dc2626;
  border: 1px solid rgba(220, 38, 38, 0.2);
  border-radius: 12px;
  background: rgba(220, 38, 38, 0.04);
}

/* App type selector (pill buttons) */
.app-row {
  margin-bottom: 0.75rem;
}

.app-row-label {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin-bottom: 0.6rem;
}

.app-options {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.app-btn {
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0.9rem;
  border: 1.5px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}
.app-btn:hover { border-color: var(--vp-c-text-3); }
.app-btn.active {
  border-color: #EC7211;
  background: rgba(236, 114, 17, 0.06);
  color: #EC7211;
}
.app-btn-label {
  font-size: 0.85rem;
  font-weight: 600;
  line-height: 1.3;
}
.app-btn-desc {
  font-size: 0.65rem;
  font-weight: 400;
  opacity: 0.7;
}

/* App traffic description */
.app-desc {
  font-size: 0.78rem;
  color: var(--vp-c-text-3);
  margin: 0 0 1.5rem 0;
  padding: 0.5rem 0.75rem;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  line-height: 1.5;
}

/* Cost grid */
.cost-grid {
  display: grid;
  grid-template-columns: 130px repeat(4, 1fr);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 1.5rem;
}

@media (max-width: 600px) {
  .cost-grid { grid-template-columns: 90px repeat(4, 1fr); font-size: 0.78rem; }
  .tier-name { font-size: 0.8rem !important; }
  .grid-total { font-size: 1rem !important; }
  .app-options { gap: 0.35rem; }
  .app-btn { padding: 0.35rem 0.6rem; }
  .app-btn-label { font-size: 0.75rem; }
  .app-btn-desc { display: none; }
  .ext-btn-desc { display: none; }
}

.grid-corner {
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  border-right: 1px solid var(--vp-c-divider);
}

.grid-header {
  padding: 0.9rem 0.5rem;
  text-align: center;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  border-right: 1px solid var(--vp-c-divider);
}
.grid-header:last-child { border-right: none; }

.tier-name { font-size: 0.9rem; font-weight: 700; color: var(--vp-c-text-1); }
.tier-users { font-size: 0.72rem; color: var(--vp-c-text-3); margin-top: 2px; }


/* Label cells */
.grid-label {
  padding: 0.55rem 0.65rem;
  border-bottom: 1px solid var(--vp-c-divider);
  border-right: 1px solid var(--vp-c-divider);
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.svc-name { font-size: 0.82rem; font-weight: 600; color: var(--vp-c-text-2); }
.svc-detail { font-size: 0.68rem; color: var(--vp-c-text-3); }

/* Data cells */
.grid-cell {
  padding: 0.55rem 0.5rem;
  text-align: center;
  border-bottom: 1px solid var(--vp-c-divider);
  border-right: 1px solid var(--vp-c-divider);
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
}
.grid-cell:last-child { border-right: none; }

/* Subtotal row */
.subtotal-label {
  font-weight: 600 !important;
  border-top: 2px solid var(--vp-c-divider);
}
.subtotal-label .svc-name { color: var(--vp-c-text-1); }

.subtotal-cell {
  font-weight: 700;
  color: var(--vp-c-text-1);
  border-top: 2px solid var(--vp-c-divider);
}

/* Free tier section header */
.ft-header-label {
  border-top: 2px solid rgba(22, 163, 74, 0.3);
  background: rgba(22, 163, 74, 0.06);
}
.ft-header-cell {
  border-top: 2px solid rgba(22, 163, 74, 0.3);
  background: rgba(22, 163, 74, 0.06);
}
.ft-header-text {
  font-size: 0.82rem;
  font-weight: 700;
  color: #16a34a;
}
.ft-header-sub {
  font-size: 0.65rem;
  color: #16a34a;
  opacity: 0.7;
}

/* Free tier rows */
.ft-label { background: rgba(22, 163, 74, 0.03); }
.ft-name { color: #16a34a !important; font-size: 0.78rem !important; }
.ft-detail { color: var(--vp-c-text-3); font-size: 0.62rem !important; }
.ft-type {
  font-size: 0.58rem;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 3px;
  display: inline-block;
  margin-top: 1px;
}
.ft-type-always { color: #16a34a; background: rgba(22, 163, 74, 0.1); }
.ft-type-12mo { color: #d97706; background: rgba(217, 119, 6, 0.1); }
.ft-cell {
  background: rgba(22, 163, 74, 0.03);
  font-weight: 600;
}

/* Total row */
.total-label {
  font-weight: 700 !important;
  background: var(--vp-c-bg-soft);
  border-top: 2px solid var(--vp-c-divider);
}
.total-label .svc-name { color: var(--vp-c-text-1); }

.grid-total {
  padding: 0.75rem 0.5rem;
  text-align: center;
  font-size: 1.25rem;
  font-weight: 800;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  border-right: 1px solid var(--vp-c-divider);
  border-top: 2px solid var(--vp-c-divider);
}
.grid-total:last-child { border-right: none; }

/* Value colors */
.val-free { color: #16a34a; }
.val-free-big { color: #16a34a; }
.val-boa { color: #EC7211; }
.val-normal { color: var(--vp-c-text-2); }
.val-dim { color: var(--vp-c-text-3); }

/* Free tier explanation */
.ft-explain {
  margin-bottom: 1.5rem;
  padding: 1rem 1.25rem;
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
}

.ft-explain p {
  font-size: 0.82rem;
  color: var(--vp-c-text-3);
  line-height: 1.7;
  margin: 0;
}

.ft-explain strong {
  color: var(--vp-c-text-2);
}

/* Traffic layer selector (secondary, at bottom) */
.traffic-section {
  margin-bottom: 1.5rem;
  padding: 1rem 1.25rem;
  border-radius: 10px;
  border: 1px solid var(--vp-c-divider);
}

.traffic-header {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.traffic-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.traffic-sub {
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
}

.ext-options {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.ext-btn {
  display: flex;
  flex-direction: column;
  padding: 0.4rem 0.75rem;
  border: 1.5px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}
.ext-btn:hover { border-color: var(--vp-c-text-3); }
.ext-btn.active {
  border-color: #EC7211;
  background: rgba(236, 114, 17, 0.06);
  color: #EC7211;
}
.ext-btn-label {
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.3;
}
.ext-btn-desc {
  font-size: 0.62rem;
  font-weight: 400;
  opacity: 0.7;
}

/* Footer */
.calc-footer {
  text-align: center;
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  line-height: 1.7;
}
</style>
