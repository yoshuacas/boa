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

const tiers = computed(() => pricingData.value?.sizeTiers || {})
const rows = computed(() => pricingData.value?.scenarios[selectedApp.value] || [])
const genDate = computed(() => pricingData.value?.generatedAt?.slice(0, 10) || '')

const services = [
  { key: 'dsql', name: 'Database', detail: 'Aurora DSQL' },
  { key: 'cognito', name: 'Auth', detail: 'Cognito' },
  { key: 'lambda', name: 'Compute', detail: 'Lambda + Function URL' },
  { key: 's3', name: 'Storage', detail: 'S3' },
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

<!-- Free tier note -->
<div class="free-note">
  <strong>AWS Free Tier</strong> covers prototypes and early startups:
  DSQL 100K DPUs &middot; Cognito 10K users &middot; Lambda 1M requests &middot; S3 5 GB
</div>

<!-- Cost grid: 4 columns (one per size tier) -->
<div class="cost-grid">

  <!-- Header row -->
  <div class="grid-corner"></div>
  <div v-for="r in rows" :key="'h-' + r.workload.sizeKey" class="grid-header">
    <div class="tier-name">{{ tiers[r.workload.sizeKey].name }}</div>
    <div class="tier-users">{{ fmtNum(tiers[r.workload.sizeKey].users) }} users</div>
  </div>

  <!-- Total row -->
  <div class="grid-label total-label">Total /mo</div>
  <div v-for="r in rows" :key="'t-' + r.workload.sizeKey" class="grid-total">
    <span :class="r.boa.total === 0 ? 'val-free' : 'val-boa'">{{ fmt(r.boa.total) }}</span>
  </div>

  <!-- Service rows -->
  <template v-for="svc in services" :key="svc.key">
    <div class="grid-label">
      <span class="svc-name">{{ svc.name }}</span>
      <span class="svc-detail">{{ svc.detail }}</span>
    </div>
    <div v-for="r in rows" :key="svc.key + '-' + r.workload.sizeKey" class="grid-cell">
      <span :class="r.boa[svc.key] === 0 ? 'val-free' : 'val-normal'">{{ fmt(r.boa[svc.key]) }}</span>
    </div>
  </template>

</div>

<p class="calc-footer">
  US East (N. Virginia), {{ genDate }}. Lambda Function URLs are free. No API Gateway in the default backend.
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
  margin-bottom: 1.5rem;
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

/* Free tier note */
.free-note {
  font-size: 0.85rem;
  color: var(--vp-c-text-3);
  margin-bottom: 2rem;
  line-height: 1.6;
}
.free-note strong {
  color: #16a34a;
}

/* Cost grid */
.cost-grid {
  display: grid;
  grid-template-columns: 140px repeat(4, 1fr);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 2rem;
}

@media (max-width: 600px) {
  .cost-grid {
    grid-template-columns: 100px repeat(4, 1fr);
    font-size: 0.8rem;
  }
}

/* Corner cell */
.grid-corner {
  background: var(--vp-c-bg-soft);
  border-bottom: 2px solid var(--vp-c-divider);
  border-right: 1px solid var(--vp-c-divider);
}

/* Header cells */
.grid-header {
  padding: 1rem 0.75rem;
  text-align: center;
  background: var(--vp-c-bg-soft);
  border-bottom: 2px solid var(--vp-c-divider);
  border-right: 1px solid var(--vp-c-divider);
}
.grid-header:last-child { border-right: none; }

.tier-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.tier-users {
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  margin-top: 2px;
}

/* Total row */
.total-label {
  font-weight: 700 !important;
  color: var(--vp-c-text-1) !important;
  background: var(--vp-c-bg-soft);
}

.grid-total {
  padding: 0.9rem 0.75rem;
  text-align: center;
  font-size: 1.4rem;
  font-weight: 800;
  border-bottom: 2px solid var(--vp-c-divider);
  border-right: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}
.grid-total:last-child { border-right: none; }

/* Label cells (left column) */
.grid-label {
  padding: 0.7rem 0.75rem;
  border-bottom: 1px solid var(--vp-c-divider);
  border-right: 1px solid var(--vp-c-divider);
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.svc-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.svc-detail {
  font-size: 0.7rem;
  color: var(--vp-c-text-3);
}

/* Data cells */
.grid-cell {
  padding: 0.7rem 0.75rem;
  text-align: center;
  border-bottom: 1px solid var(--vp-c-divider);
  border-right: 1px solid var(--vp-c-divider);
  font-size: 0.9rem;
  font-weight: 600;
}
.grid-cell:last-child { border-right: none; }

/* Value colors */
.val-free { color: #16a34a; }
.val-boa { color: #EC7211; }
.val-normal { color: var(--vp-c-text-1); }

/* Footer */
.calc-footer {
  text-align: center;
  font-size: 0.78rem;
  color: var(--vp-c-text-3);
  line-height: 1.7;
}
</style>
