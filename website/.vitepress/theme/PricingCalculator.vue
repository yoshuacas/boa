<script setup>
import { ref, computed, onMounted } from 'vue'

const pricingData = ref(null)
const loadError = ref(false)
const selectedApp = ref('productivity')

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

function freeTierNote(r) {
  const ft = r.boa.freeTier
  if (ft.total === 0) return null
  // Check if free tier covers everything
  if (r.boa.total === 0) {
    // S3 free tier is 12mo, rest is always free
    if (ft.s3 > 0) return 'Covered by AWS Free Tier (S3 for first 12 months, rest always free)'
    return 'Covered by AWS Always Free Tier'
  }
  // Partial coverage
  if (ft.total > 0) return `Free tier saves ${fmt(ft.total)}/mo`
  return null
}

const tiers = computed(() => pricingData.value?.sizeTiers || {})
const rows = computed(() => pricingData.value?.scenarios[selectedApp.value] || [])
const genDate = computed(() => pricingData.value?.generatedAt?.slice(0, 10) || '')

const services = [
  { key: 'dsql', name: 'Database', detail: 'Aurora DSQL', ftKey: 'dsqlType' },
  { key: 'cognito', name: 'Auth', detail: 'Cognito', ftKey: 'cognitoType' },
  { key: 'lambda', name: 'Compute', detail: 'Lambda', ftKey: 'lambdaType' },
  { key: 's3', name: 'Storage', detail: 'S3', ftKey: 's3Type' },
]
</script>

<template>
<div class="calc">

<div v-if="loadError" class="calc-error">
  Pricing data unavailable. Run <code>node website/scripts/generate-pricing.mjs</code>
</div>

<template v-else-if="pricingData">

<!-- App selector -->
<div class="app-row">
  <span class="app-label">Calculate for</span>
  <select v-model="selectedApp" class="app-select">
    <option value="productivity">Productivity app</option>
    <option value="social">Social app</option>
    <option value="realtime">Real-time app</option>
    <option value="ecommerce">E-Commerce app</option>
    <option value="saas">SaaS app</option>
    <option value="healthIot">Health / IoT app</option>
  </select>
</div>

<!-- Cost grid -->
<div class="cost-grid">

  <!-- Header row -->
  <div class="grid-corner"></div>
  <div v-for="r in rows" :key="'h-' + r.workload.sizeKey" class="grid-header">
    <div class="tier-name">{{ tiers[r.workload.sizeKey].name }}</div>
    <div class="tier-users">{{ fmtNum(tiers[r.workload.sizeKey].users) }} users</div>
  </div>

  <!-- Service rows (gross cost) -->
  <template v-for="svc in services" :key="svc.key">
    <div class="grid-label">
      <span class="svc-name">{{ svc.name }}</span>
      <span class="svc-detail">{{ svc.detail }}</span>
    </div>
    <div v-for="r in rows" :key="svc.key + '-' + r.workload.sizeKey" class="grid-cell">
      <span class="val-normal">{{ fmt(r.boa.gross[svc.key]) }}</span>
    </div>
  </template>

  <!-- Subtotal row -->
  <div class="grid-label subtotal-label">Subtotal</div>
  <div v-for="r in rows" :key="'sub-' + r.workload.sizeKey" class="grid-cell subtotal-cell">
    {{ fmt(r.boa.gross.total) }}
  </div>

  <!-- Free tier savings row -->
  <div class="grid-label ft-label">
    <span class="svc-name">Free Tier</span>
  </div>
  <div v-for="r in rows" :key="'ft-' + r.workload.sizeKey" class="grid-cell ft-cell">
    <span v-if="r.boa.freeTier.total > 0" class="val-free">&minus;{{ fmt(r.boa.freeTier.total) }}</span>
    <span v-else class="val-dim">&mdash;</span>
  </div>

  <!-- You pay row -->
  <div class="grid-label total-label">You pay /mo</div>
  <div v-for="r in rows" :key="'t-' + r.workload.sizeKey" class="grid-total">
    <span :class="r.boa.total === 0 ? 'val-free-big' : 'val-boa'">{{ fmt(r.boa.total) }}</span>
  </div>

  <!-- Free tier note row -->
  <div class="grid-label note-label"></div>
  <div v-for="r in rows" :key="'n-' + r.workload.sizeKey" class="grid-note">
    <!-- Fully covered by free tier -->
    <template v-if="r.boa.total === 0">
      <span class="note-text">Covered by free tier</span>
      <span v-if="r.boa.freeTier.s3 > 0" class="note-sub">S3 free tier expires after 12 months (adds {{ fmt(r.boa.gross.s3) }}/mo)</span>
    </template>
    <!-- Partially covered -->
    <template v-else-if="r.boa.freeTier.total > 0">
      <span class="note-sub">Free tier saves {{ fmt(r.boa.freeTier.total) }}/mo</span>
      <span class="note-sub">Database, auth, compute: always free</span>
    </template>
  </div>

</div>

<!-- Free tier explanation -->
<div class="ft-explain">
  <p>
    <strong>How the AWS Free Tier works:</strong>
    Database (DSQL), Auth (Cognito), and Compute (Lambda) have <strong>always-free tiers</strong> that never expire — these savings apply to every account, forever.
    Storage (S3) has a <strong>12-month free tier</strong> for new AWS accounts. After 12 months, S3 storage and requests are billed at standard rates.
  </p>
</div>

<p class="calc-footer">
  US East (N. Virginia), {{ genDate }}. Lambda Function URLs are free — no API Gateway in the default backend.
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

/* App selector */
.app-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 2rem;
}

.app-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.app-select {
  padding: 0.5rem 0.9rem;
  border: 1.5px solid var(--vp-c-divider);
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: border-color 0.15s;
}
.app-select:hover { border-color: var(--vp-c-text-3); }
.app-select:focus { outline: none; border-color: #EC7211; }

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

/* Free tier row */
.ft-label { background: rgba(22, 163, 74, 0.03); }
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

/* Note row */
.note-label { border-bottom: none; }
.grid-note {
  padding: 0.4rem 0.5rem;
  text-align: center;
  border-right: 1px solid var(--vp-c-divider);
  border-bottom: none;
}
.grid-note:last-child { border-right: none; }
.note-text { font-size: 0.7rem; color: #16a34a; font-weight: 600; }
.note-sub { font-size: 0.65rem; color: var(--vp-c-text-3); font-weight: 400; }

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

/* Footer */
.calc-footer {
  text-align: center;
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  line-height: 1.7;
}
</style>
