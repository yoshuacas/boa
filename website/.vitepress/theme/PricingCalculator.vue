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

function formatMoney(val) {
  if (val === 0) return '$0'
  if (val < 0.01) return '<$0.01'
  if (val < 1) return `$${val.toFixed(2)}`
  if (val >= 100) return `$${val.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  return `$${val.toFixed(2)}`
}

function formatNumber(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`
  return n.toString()
}

function savingsLabel(r) {
  if (r.supa.total === 0 && r.boa.total === 0) return { text: 'Both free', color: '#28C840' }
  if (r.boa.total === 0 && r.supa.total > 0) return { text: `BOA is free`, color: '#28C840' }
  if (r.supa.total === 0 && r.boa.total > 0) return { text: `Supa is free`, color: '#888888' }
  if (r.boa.total < r.supa.total) {
    const pct = Math.round(((r.supa.total - r.boa.total) / r.supa.total) * 100)
    return { text: `BOA ${pct}% less`, color: '#28C840' }
  }
  if (r.boa.total > r.supa.total) {
    const diff = r.boa.total - r.supa.total
    return { text: `+${formatMoney(diff)} vs Supa`, color: '#888888' }
  }
  return { text: 'Same', color: '#888888' }
}

const sizeTiers = computed(() => pricingData.value?.sizeTiers || {})

const results = computed(() => {
  if (!pricingData.value) return []
  return pricingData.value.scenarios[selectedApp.value] || []
})

const generatedDate = computed(() => {
  if (!pricingData.value) return ''
  return pricingData.value.generatedAt.slice(0, 10)
})
</script>

<template>
<div class="pricing-widget">

<div v-if="loadError" class="load-error">
  Failed to load pricing data. Run: <code>node website/scripts/generate-pricing.mjs</code>
</div>

<template v-else-if="pricingData">

<div class="pricing-controls">
  <label for="app-select">App type</label>
  <select id="app-select" v-model="selectedApp">
    <option value="productivity">Productivity (todo, notes, project mgmt)</option>
    <option value="social">Social (feeds, posts, likes, media)</option>
    <option value="realtime">Real-time (chat, collaboration, live)</option>
    <option value="ecommerce">E-Commerce (catalog, cart, orders)</option>
    <option value="saas">Multi-tenant SaaS (CRM, analytics)</option>
    <option value="healthIot">Health / IoT (tracking, telemetry)</option>
  </select>
</div>

<div class="free-tier-callout">
  <strong>AWS Free Tier covers most of the backend.</strong>
  Aurora DSQL: 100K DPUs + 1 GB &middot;
  Cognito: 10,000 MAU &middot;
  Lambda + Function URLs: 1M requests &middot;
  S3: 5 GB storage
</div>

<!-- Comparison table -->
<div class="table-wrapper">
<table class="pricing-table">
  <thead>
    <tr>
      <th>Scale</th>
      <th class="num-col">Users</th>
      <th class="num-col boa-col">BOA /mo</th>
      <th class="num-col">Supabase /mo</th>
      <th>Comparison</th>
    </tr>
  </thead>
  <tbody>
    <tr v-for="r in results" :key="r.workload.sizeKey">
      <td>
        <strong>{{ sizeTiers[r.workload.sizeKey].name }}</strong><br>
        <span class="tier-desc">{{ sizeTiers[r.workload.sizeKey].desc }}</span>
      </td>
      <td class="num-col">{{ formatNumber(sizeTiers[r.workload.sizeKey].users) }}</td>
      <td class="num-col">
        <strong :class="r.boa.total === 0 ? 'price-free' : 'price-boa'">
          {{ r.boa.total === 0 ? 'Free' : formatMoney(r.boa.total) }}
        </strong>
      </td>
      <td class="num-col">
        <strong :class="r.supa.total === 0 ? 'price-free' : ''">
          {{ r.supa.total === 0 ? 'Free' : formatMoney(r.supa.total) }}
        </strong>
        <span class="plan-label">{{ r.supa.plan }}</span>
      </td>
      <td>
        <span class="savings-badge" :style="{ color: savingsLabel(r).color }">
          {{ savingsLabel(r).text }}
        </span>
      </td>
    </tr>
  </tbody>
</table>
</div>

<!-- Breakdown cards -->
<h3 class="breakdown-heading">Cost breakdown by service</h3>

<div class="breakdown-grid">
  <div v-for="r in results" :key="'b-' + r.workload.sizeKey" class="breakdown-card">
    <div class="card-header">
      <span class="card-tier">{{ sizeTiers[r.workload.sizeKey].name }}</span>
      <span class="card-users">{{ formatNumber(sizeTiers[r.workload.sizeKey].users) }} users</span>
    </div>
    <div class="card-total" :class="r.boa.total === 0 ? 'price-free' : 'price-boa'">
      {{ r.boa.total === 0 ? '$0' : formatMoney(r.boa.total) }}<span class="per-mo">/mo</span>
    </div>
    <div class="card-services">
      <div class="svc-row" v-for="svc in [
        { name: 'Database (DSQL)', cost: r.boa.dsql },
        { name: 'Auth (Cognito)', cost: r.boa.cognito },
        { name: 'Compute (Lambda)', cost: r.boa.lambda },
        { name: 'Storage (S3)', cost: r.boa.s3 },
      ]" :key="svc.name">
        <span class="svc-name">{{ svc.name }}</span>
        <span :class="svc.cost === 0 ? 'svc-free' : 'svc-cost'">
          {{ svc.cost === 0 ? 'Free' : formatMoney(svc.cost) }}
        </span>
      </div>
    </div>
    <div class="card-compare">
      <span>vs Supabase</span>
      <span>{{ r.supa.total === 0 ? 'Free' : formatMoney(r.supa.total) }}/mo</span>
    </div>
  </div>
</div>

<p class="pricing-note">
  Prices for US East (N. Virginia). Rates from AWS Pricing API, {{ generatedDate }}.
  No API Gateway in the default backend — Lambda Function URLs are free.
  <br>Source: <code>website/scripts/generate-pricing.mjs</code>
</p>

</template>

<div v-else class="loading">Loading pricing data...</div>

</div>
</template>

<style scoped>
.pricing-widget {
  margin-top: 2rem;
}

.loading {
  text-align: center;
  padding: 3rem;
  color: #666;
}

.load-error {
  text-align: center;
  padding: 2rem;
  color: #e74c3c;
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: 12px;
  background: rgba(231, 76, 60, 0.06);
}

/* Controls */
.pricing-controls {
  margin-bottom: 2rem;
}

.pricing-controls label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.5rem;
  color: #888;
}

.pricing-controls select {
  padding: 0.65rem 1.2rem;
  border: 1.5px solid #333;
  border-radius: 10px;
  font-size: 0.9rem;
  background: #0F0F0F;
  color: #FFF;
  min-width: 340px;
  cursor: pointer;
  transition: border-color 0.15s;
}

.pricing-controls select:hover {
  border-color: #555;
}

.pricing-controls select:focus {
  outline: none;
  border-color: #FF9900;
}

/* Free tier callout */
.free-tier-callout {
  padding: 1rem 1.5rem;
  border-radius: 10px;
  background: rgba(40, 200, 64, 0.04);
  border: 1px solid rgba(40, 200, 64, 0.15);
  margin-bottom: 2.5rem;
  font-size: 0.85rem;
  line-height: 1.7;
  color: #999;
}

.free-tier-callout strong {
  color: #28C840;
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.9rem;
}

/* Table */
.table-wrapper {
  overflow-x: auto;
  margin-bottom: 3rem;
}

.pricing-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.pricing-table th {
  text-align: left;
  padding: 0.75rem 1rem;
  border-bottom: 2px solid #2A2A2A;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #666;
}

.pricing-table th.boa-col {
  color: #FF9900;
}

.pricing-table th.num-col,
.pricing-table td.num-col {
  text-align: right;
}

.pricing-table td {
  padding: 1rem 1rem;
  border-bottom: 1px solid #1A1A1A;
  vertical-align: middle;
  color: #CCC;
}

.pricing-table tbody tr {
  transition: background 0.1s;
}

.pricing-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.02);
}

.tier-desc {
  font-size: 0.8rem;
  color: #555;
}

.price-free {
  color: #28C840 !important;
}

.price-boa {
  color: #FF9900 !important;
}

.plan-label {
  display: block;
  font-size: 0.75rem;
  color: #555;
  font-weight: 400;
  margin-top: 2px;
}

.savings-badge {
  font-size: 0.85rem;
  font-weight: 600;
}

/* Breakdown */
.breakdown-heading {
  font-size: 1.1rem;
  font-weight: 700;
  color: #FFF;
  margin-bottom: 1.25rem;
  border: none;
}

.breakdown-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  margin-bottom: 2.5rem;
}

.breakdown-card {
  border: 1px solid #222;
  border-radius: 12px;
  padding: 1.5rem;
  background: #0A0A0A;
  transition: border-color 0.15s;
}

.breakdown-card:hover {
  border-color: #333;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.5rem;
}

.card-tier {
  font-size: 0.95rem;
  font-weight: 700;
  color: #FFF;
}

.card-users {
  font-size: 0.8rem;
  color: #666;
}

.card-total {
  font-size: 2rem;
  font-weight: 800;
  margin-bottom: 1rem;
  line-height: 1;
}

.per-mo {
  font-size: 0.85rem;
  font-weight: 500;
  color: #666;
}

.card-services {
  margin-bottom: 1rem;
}

.svc-row {
  display: flex;
  justify-content: space-between;
  padding: 0.4rem 0;
  font-size: 0.82rem;
  border-top: 1px solid #1A1A1A;
}

.svc-name {
  color: #999;
}

.svc-free {
  color: #28C840;
  font-weight: 600;
}

.svc-cost {
  color: #CCC;
  font-weight: 600;
}

.card-compare {
  display: flex;
  justify-content: space-between;
  padding-top: 0.75rem;
  border-top: 2px solid #222;
  font-size: 0.82rem;
  font-weight: 600;
  color: #888;
}

/* Footer */
.pricing-note {
  text-align: center;
  color: #555;
  font-size: 0.8rem;
  line-height: 1.7;
  margin-top: 1rem;
}

.pricing-note code {
  background: #1A1A1A;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
  color: #FF9900;
}
</style>
