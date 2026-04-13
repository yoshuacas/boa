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
  if (val === 0) return 'Free'
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

function compareLabel(r) {
  const b = r.boa.total, s = r.supa.total
  if (b === 0 && s === 0) return { text: 'Both free', cls: 'cmp-green' }
  if (b === 0) return { text: 'BOA is free', cls: 'cmp-green' }
  if (s === 0) return { text: 'Supabase is free', cls: 'cmp-dim' }
  if (b < s) return { text: `${Math.round(((s - b) / s) * 100)}% cheaper`, cls: 'cmp-green' }
  if (b > s) return { text: `+${fmt(b - s)}`, cls: 'cmp-dim' }
  return { text: 'Same', cls: 'cmp-dim' }
}

const tiers = computed(() => pricingData.value?.sizeTiers || {})
const rows = computed(() => pricingData.value?.scenarios[selectedApp.value] || [])
const genDate = computed(() => pricingData.value?.generatedAt?.slice(0, 10) || '')
</script>

<template>
<div class="calc">

<div v-if="loadError" class="calc-error">
  Pricing data unavailable. Run <code>node website/scripts/generate-pricing.mjs</code>
</div>

<template v-else-if="pricingData">

<!-- App selector -->
<div class="app-select-row">
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

<!-- Free tier badge -->
<div class="free-badge">
  <span class="free-icon">&#x2713;</span>
  <div>
    <strong>AWS Free Tier covers prototypes and startups.</strong><br>
    <span>DSQL 100K DPUs &middot; Cognito 10K users &middot; Lambda 1M requests &middot; S3 5 GB</span>
  </div>
</div>

<!-- Main comparison -->
<div class="compare-grid">
  <div v-for="r in rows" :key="r.workload.sizeKey" class="compare-card" :class="{ 'card-free': r.boa.total === 0 }">
    <div class="card-top">
      <div>
        <div class="card-tier">{{ tiers[r.workload.sizeKey].name }}</div>
        <div class="card-desc">{{ fmtNum(tiers[r.workload.sizeKey].users) }} users &middot; {{ tiers[r.workload.sizeKey].desc }}</div>
      </div>
      <div :class="compareLabel(r).cls" class="cmp-badge">{{ compareLabel(r).text }}</div>
    </div>

    <div class="card-prices">
      <div class="price-col">
        <div class="price-label">BOA</div>
        <div class="price-value price-boa">{{ fmt(r.boa.total) }}</div>
        <div class="price-period" v-if="r.boa.total > 0">/month</div>
      </div>
      <div class="price-vs">vs</div>
      <div class="price-col">
        <div class="price-label">Supabase</div>
        <div class="price-value">{{ fmt(r.supa.total) }}</div>
        <div class="price-period" v-if="r.supa.total > 0">/month &middot; {{ r.supa.plan }}</div>
      </div>
    </div>

    <div class="card-breakdown" v-if="r.boa.total > 0">
      <div class="bk-row" v-for="svc in [
        { name: 'Database', cost: r.boa.dsql },
        { name: 'Auth', cost: r.boa.cognito },
        { name: 'Compute', cost: r.boa.lambda },
        { name: 'Storage', cost: r.boa.s3 },
      ].filter(s => s.cost > 0)" :key="svc.name">
        <span>{{ svc.name }}</span>
        <span>{{ fmt(svc.cost) }}</span>
      </div>
    </div>
  </div>
</div>

<p class="calc-footer">
  Prices for US East (N. Virginia), {{ genDate }}. Lambda Function URLs are free — no API Gateway in the default backend.
  API Gateway available as extension for rate limiting and custom domains.
</p>

</template>

<div v-else class="calc-loading">Loading...</div>

</div>
</template>

<style scoped>
.calc {
  margin-top: 1rem;
}

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
.app-select-row {
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
  padding: 0.55rem 1rem;
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

/* Free tier badge */
.free-badge {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-radius: 10px;
  background: rgba(22, 163, 74, 0.05);
  border: 1px solid rgba(22, 163, 74, 0.15);
  margin-bottom: 2rem;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.free-icon {
  color: #16a34a;
  font-size: 1.1rem;
  font-weight: 700;
  margin-top: 2px;
}

.free-badge strong {
  color: var(--vp-c-text-1);
  font-size: 0.9rem;
}

/* Comparison grid */
.compare-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-bottom: 2rem;
}

@media (max-width: 680px) {
  .compare-grid { grid-template-columns: 1fr; }
}

.compare-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 1.5rem;
  background: var(--vp-c-bg-soft);
  transition: border-color 0.15s;
}

.compare-card:hover {
  border-color: var(--vp-c-text-3);
}

.card-free {
  border-color: rgba(22, 163, 74, 0.3);
  background: rgba(22, 163, 74, 0.03);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.25rem;
}

.card-tier {
  font-size: 1rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.card-desc {
  font-size: 0.8rem;
  color: var(--vp-c-text-3);
  margin-top: 2px;
}

.cmp-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  white-space: nowrap;
}

.cmp-green {
  color: #16a34a;
  background: rgba(22, 163, 74, 0.1);
}

.cmp-dim {
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg);
}

/* Price columns */
.card-prices {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}

.price-col {
  flex: 1;
}

.price-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--vp-c-text-3);
  margin-bottom: 0.25rem;
}

.price-value {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--vp-c-text-1);
  line-height: 1;
}

.price-boa {
  color: #EC7211;
}

.price-period {
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  margin-top: 0.2rem;
}

.price-vs {
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  padding-top: 1.5rem;
  font-weight: 600;
}

/* Breakdown rows */
.card-breakdown {
  border-top: 1px solid var(--vp-c-divider);
  padding-top: 0.75rem;
}

.bk-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  padding: 0.2rem 0;
  color: var(--vp-c-text-3);
}

.bk-row span:last-child {
  font-weight: 600;
  color: var(--vp-c-text-2);
}

/* Footer */
.calc-footer {
  text-align: center;
  font-size: 0.78rem;
  color: var(--vp-c-text-3);
  line-height: 1.7;
  margin-top: 1rem;
}
</style>
