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
  <label for="app-select"><strong>App Type</strong></label>
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
  <strong>AWS Free Tier covers most of the stack.</strong>
  Aurora DSQL: 100K DPUs + 1 GB storage &middot;
  Cognito: 10,000 MAU free &middot;
  Lambda: 1M requests &middot;
  API Gateway: 1M requests &middot;
  S3: 5 GB storage
</div>

<table class="pricing-table">
  <thead>
    <tr>
      <th>Scale</th>
      <th>Users</th>
      <th class="boa-col">BOA (AWS) /mo</th>
      <th>Supabase /mo</th>
      <th>Savings</th>
      <th>Supabase Plan</th>
    </tr>
  </thead>
  <tbody>
    <tr v-for="r in results" :key="r.workload.sizeKey">
      <td>
        <strong>{{ sizeTiers[r.workload.sizeKey].name }}</strong><br>
        <small>{{ sizeTiers[r.workload.sizeKey].desc }}</small>
      </td>
      <td>{{ formatNumber(sizeTiers[r.workload.sizeKey].users) }}</td>
      <td>
        <strong :style="{ color: r.boa.total === 0 ? '#28C840' : '#FF9900' }">
          {{ r.boa.total === 0 ? '$0 (free tier)' : formatMoney(r.boa.total) }}
        </strong>
      </td>
      <td>
        <strong>{{ r.supa.total === 0 ? '$0 (free tier)' : formatMoney(r.supa.total) }}</strong>
      </td>
      <td>
        <span v-if="r.supa.total === 0 && r.boa.total === 0" style="color: #28C840">Both free</span>
        <span v-else-if="r.boa.total === 0 && r.supa.total > 0" style="color: #28C840">Save {{ formatMoney(r.supa.total) }}/mo</span>
        <span v-else-if="r.boa.total < r.supa.total" style="color: #28C840">
          {{ Math.round(((r.supa.total - r.boa.total) / r.supa.total) * 100) }}% less
        </span>
        <span v-else-if="r.boa.total > r.supa.total" style="color: #888888">
          Supabase {{ Math.round(((r.boa.total - r.supa.total) / r.supa.total) * 100) }}% less
        </span>
        <span v-else style="color: #888888">Same</span>
      </td>
      <td><small>{{ r.supa.plan }} + {{ r.supa.tier }}</small></td>
    </tr>
  </tbody>
</table>

<h2>Cost Breakdown by Service</h2>

<div class="breakdown-grid">
  <div v-for="r in results" :key="'b-' + r.workload.sizeKey" class="breakdown-card">
    <h3>{{ sizeTiers[r.workload.sizeKey].name }} — {{ formatNumber(sizeTiers[r.workload.sizeKey].users) }} users</h3>
    <div class="total-price" :style="{ color: r.boa.total === 0 ? '#28C840' : '#FF9900' }">
      {{ r.boa.total === 0 ? '$0/mo' : formatMoney(r.boa.total) + '/mo' }}
    </div>
    <div class="line-item" v-for="svc in [
      { name: 'Aurora DSQL', cost: r.boa.dsql },
      { name: 'Cognito', cost: r.boa.cognito },
      { name: 'Lambda + Function URL', cost: r.boa.lambda },
      { name: 'S3', cost: r.boa.s3 },
    ]" :key="svc.name">
      <span>{{ svc.name }}</span>
      <span :style="{ color: svc.cost === 0 ? '#28C840' : '#CCCCCC', fontWeight: 600 }">
        {{ svc.cost === 0 ? '$0 (free)' : formatMoney(svc.cost) }}
      </span>
    </div>
    <div class="line-item vs-line">
      <span>vs Supabase</span>
      <span>{{ formatMoney(r.supa.total) }}/mo</span>
    </div>
  </div>
</div>

<p class="pricing-footer-note">
  All prices US East (N. Virginia). Rates fetched from the AWS Pricing API on {{ generatedDate }}.
  The calculator source code is open — see <code>website/scripts/generate-pricing.mjs</code> in the repo.
</p>

</template>

<div v-else class="loading">Loading pricing data...</div>

</div>
</template>

<style scoped>
.pricing-widget {
  margin-top: 1.5rem;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #888888;
}

.load-error {
  text-align: center;
  padding: 2rem;
  color: #e74c3c;
  border: 1px solid #e74c3c;
  border-radius: 8px;
  background: rgba(231, 76, 60, 0.08);
}

.pricing-controls {
  margin-bottom: 1.5rem;
}

.pricing-controls label {
  display: block;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
  color: #888888;
}

.pricing-controls select {
  padding: 0.6rem 1rem;
  border: 1.5px solid #2A2A2A;
  border-radius: 8px;
  font-size: 0.9rem;
  background: #111111;
  color: #FFFFFF;
  min-width: 320px;
}

.pricing-controls select:focus {
  outline: none;
  border-color: #FF9900;
}

.free-tier-callout {
  padding: 1rem 1.5rem;
  border-radius: 8px;
  background: rgba(40, 200, 64, 0.06);
  border: 1px solid rgba(40, 200, 64, 0.2);
  margin-bottom: 2rem;
  font-size: 0.9rem;
  line-height: 1.6;
  color: #CCCCCC;
}

.free-tier-callout strong {
  color: #28C840;
}

.pricing-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  margin-bottom: 2.5rem;
}

.pricing-table th {
  text-align: left;
  padding: 0.75rem 1rem;
  border-bottom: 2px solid #2A2A2A;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888888;
}

.pricing-table th.boa-col {
  color: #FF9900;
}

.pricing-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #1A1A1A;
  vertical-align: top;
  color: #CCCCCC;
}

.pricing-table small {
  color: #666666;
}

.pricing-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.02);
}

.breakdown-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

.breakdown-card {
  border: 1px solid #2A2A2A;
  border-radius: 8px;
  padding: 1.25rem;
  background: #111111;
}

.breakdown-card h3 {
  font-size: 0.95rem;
  margin: 0 0 0.25rem;
  color: #FFFFFF;
}

.total-price {
  font-size: 1.5rem;
  font-weight: 800;
  margin-bottom: 0.75rem;
}

.line-item {
  display: flex;
  justify-content: space-between;
  padding: 0.35rem 0;
  font-size: 0.85rem;
  border-top: 1px solid #1A1A1A;
  color: #CCCCCC;
}

.vs-line {
  margin-top: 0.5rem;
  border-top: 2px solid #2A2A2A;
  padding-top: 0.5rem;
  font-weight: 600;
}

.pricing-footer-note {
  text-align: center;
  color: #666666;
  font-size: 0.85rem;
  margin-top: 2rem;
}

.pricing-footer-note code {
  background: #1A1A1A;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.8rem;
  color: #FF9900;
}
</style>
