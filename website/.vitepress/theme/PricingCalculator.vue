<script setup>
import { ref, computed } from 'vue'

const APP_PROFILES = {
  productivity: {
    name: 'Productivity App',
    example: 'Todo lists, notes, project management',
    requestsPerUserMonth: 1000, readRatio: 0.60, writeRatio: 0.40,
    storagePerUserKB: 50, dbStoragePerUserKB: 5,
  },
  social: {
    name: 'Social App',
    example: 'Feeds, posts, comments, likes, media sharing',
    requestsPerUserMonth: 3000, readRatio: 0.80, writeRatio: 0.20,
    storagePerUserKB: 500, dbStoragePerUserKB: 20,
  },
  realtime: {
    name: 'Real-time App',
    example: 'Chat, collaboration, live dashboards',
    requestsPerUserMonth: 8000, readRatio: 0.50, writeRatio: 0.50,
    storagePerUserKB: 100, dbStoragePerUserKB: 30,
  },
  ecommerce: {
    name: 'E-Commerce App',
    example: 'Product catalog, cart, orders, payments',
    requestsPerUserMonth: 2000, readRatio: 0.75, writeRatio: 0.25,
    storagePerUserKB: 200, dbStoragePerUserKB: 15,
  },
  saas: {
    name: 'Multi-tenant SaaS',
    example: 'CRM, analytics dashboard, admin tools',
    requestsPerUserMonth: 4000, readRatio: 0.70, writeRatio: 0.30,
    storagePerUserKB: 300, dbStoragePerUserKB: 50,
  },
  healthIot: {
    name: 'Health / IoT App',
    example: 'Tracking, telemetry, sensor data',
    requestsPerUserMonth: 7500, readRatio: 0.06, writeRatio: 0.94,
    storagePerUserKB: 5000, dbStoragePerUserKB: 500,
  },
}

const SIZE_TIERS = {
  prototype: { name: 'Prototype', users: 50, desc: 'Building & testing' },
  startup:   { name: 'Startup',   users: 1000, desc: 'First paying customers' },
  growth:    { name: 'Growth',    users: 100000, desc: 'Series A/B, scaling' },
  unicorn:   { name: 'Unicorn',   users: 2000000, desc: 'At scale, 1M+ users' },
}

const BOA_PRICING = {
  dsql: {
    dpuPricePerMillion: 8.00, storagePricePerGB: 0.33,
    freeTierDPUs: 100000, freeTierStorageGB: 1.0,
    dpuPerRead: 0.020, dpuPerWrite: 0.050, dpuPerDelete: 0.030,
  },
  cognito: {
    tiers: [
      { upTo: 10000, pricePerMAU: 0 },
      { upTo: 100000, pricePerMAU: 0.0055 },
      { upTo: 1000000, pricePerMAU: 0.0046 },
      { upTo: 10000000, pricePerMAU: 0.00325 },
    ],
  },
  lambda: {
    requestPricePerMillion: 0.20, gbSecondPrice: 0.0000166667,
    freeTierRequests: 1000000, freeTierGBSeconds: 400000,
    memoryMB: 256, avgDurationMs: 100,
  },
  apiGateway: {
    tiers: [
      { upTo: 333000000, pricePerMillion: 3.50 },
      { upTo: 667000000, pricePerMillion: 2.80 },
      { upTo: 19000000000, pricePerMillion: 2.38 },
    ],
    freeTierRequests: 1000000,
  },
  s3: {
    storagePricePerGB: 0.023, putPricePer1000: 0.005, getPricePer1000: 0.0004,
    freeTierStorageGB: 5, freeTierPutRequests: 2000, freeTierGetRequests: 20000,
  },
}

const SUPABASE_PRICING = {
  plans: {
    free: { name: 'Free', baseCost: 0, includedStorageGB: 0.5, includedEgressGB: 5, includedMAU: 50000, maxOpsPerSec: 50 },
    pro: { name: 'Pro', baseCost: 25, computeCredit: 10, includedStorageGB: 8, includedEgressGB: 250, includedMAU: 100000 },
  },
  computeTiers: [
    { name: 'Nano',   cost: 0,    maxDB: 0.5,   maxConn: 200,  maxOps: 50 },
    { name: 'Micro',  cost: 10,   maxDB: 10,    maxConn: 200,  maxOps: 150 },
    { name: 'Small',  cost: 15,   maxDB: 50,    maxConn: 400,  maxOps: 300 },
    { name: 'Medium', cost: 60,   maxDB: 100,   maxConn: 600,  maxOps: 500 },
    { name: 'Large',  cost: 110,  maxDB: 200,   maxConn: 800,  maxOps: 1000 },
    { name: 'XL',     cost: 210,  maxDB: 500,   maxConn: 1000, maxOps: 2500 },
    { name: '2XL',    cost: 410,  maxDB: 1000,  maxConn: 1500, maxOps: 5000 },
    { name: '4XL',    cost: 960,  maxDB: 2000,  maxConn: 3000, maxOps: 8000 },
    { name: '8XL',    cost: 1870, maxDB: 4000,  maxConn: 6000, maxOps: 15000 },
    { name: '12XL',   cost: 2800, maxDB: 6000,  maxConn: 9000, maxOps: 22000 },
    { name: '16XL',   cost: 3730, maxDB: 10000, maxConn: 12000, maxOps: 30000 },
  ],
  overageRates: { storagePerGB: 0.125, egressPerGB: 0.09, mauPerUser: 0.00325 },
  secondsPerMonth: 2628000,
}

function round2(n) { return Math.round(n * 100) / 100 }

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

function deriveWorkload(profileKey, sizeKey) {
  const profile = APP_PROFILES[profileKey]
  const size = SIZE_TIERS[sizeKey]
  const users = size.users
  const totalRequests = users * profile.requestsPerUserMonth
  const reads = Math.round(totalRequests * profile.readRatio)
  const writes = Math.round(totalRequests * profile.writeRatio)
  const deletes = Math.round(writes * 0.05)
  const dbStorageGB = (users * profile.dbStoragePerUserKB) / 1000000
  const s3StorageGB = (users * profile.storagePerUserKB) / 1000000
  const egressGB = (reads * 1024) / (1024 ** 3)
  const peakConnections = Math.max(5, Math.floor(users / 100))
  return { profileKey, sizeKey, users, totalRequests, reads, writes, deletes,
    dbStorageGB: Math.round(dbStorageGB * 1000) / 1000,
    s3StorageGB: Math.round(s3StorageGB * 1000) / 1000,
    egressGB: Math.round(egressGB * 10) / 10,
    peakConnections, mau: users }
}

function calculateBOA(workload) {
  const p = BOA_PRICING
  const readDPUs = workload.reads * p.dsql.dpuPerRead
  const writeDPUs = workload.writes * p.dsql.dpuPerWrite
  const deleteDPUs = workload.deletes * p.dsql.dpuPerDelete
  const totalDPUs = readDPUs + writeDPUs + deleteDPUs
  const billableDPUs = Math.max(0, totalDPUs - p.dsql.freeTierDPUs)
  const billableDbStorage = Math.max(0, workload.dbStorageGB - p.dsql.freeTierStorageGB)
  const dsqlCost = (billableDPUs / 1000000) * p.dsql.dpuPricePerMillion + billableDbStorage * p.dsql.storagePricePerGB

  let cognitoCost = 0, remainingMAU = workload.mau, prevLimit = 0
  for (const tier of p.cognito.tiers) {
    const tierUsers = Math.min(remainingMAU, tier.upTo - prevLimit)
    if (tierUsers <= 0) break
    cognitoCost += tierUsers * tier.pricePerMAU
    remainingMAU -= tierUsers
    prevLimit = tier.upTo
  }

  const billableLambdaReqs = Math.max(0, workload.totalRequests - p.lambda.freeTierRequests)
  const lambdaRequestCost = (billableLambdaReqs / 1000000) * p.lambda.requestPricePerMillion
  const memoryGB = p.lambda.memoryMB / 1024
  const durationSec = p.lambda.avgDurationMs / 1000
  const totalGBSeconds = workload.totalRequests * memoryGB * durationSec
  const billableGBSeconds = Math.max(0, totalGBSeconds - p.lambda.freeTierGBSeconds)
  const lambdaCost = lambdaRequestCost + billableGBSeconds * p.lambda.gbSecondPrice

  const billableApigwReqs = Math.max(0, workload.totalRequests - p.apiGateway.freeTierRequests)
  let apigwCost = 0, remaining = billableApigwReqs, prevTierLimit = 0
  for (const tier of p.apiGateway.tiers) {
    const tierCapacity = tier.upTo - prevTierLimit
    const inThisTier = Math.min(remaining, tierCapacity)
    if (inThisTier <= 0) break
    apigwCost += (inThisTier / 1000000) * tier.pricePerMillion
    remaining -= inThisTier
    prevTierLimit = tier.upTo
  }

  const billableS3Storage = Math.max(0, workload.s3StorageGB - p.s3.freeTierStorageGB)
  const s3StorageCost = billableS3Storage * p.s3.storagePricePerGB
  const billablePuts = Math.max(0, workload.writes - p.s3.freeTierPutRequests)
  const billableGets = Math.max(0, workload.reads - p.s3.freeTierGetRequests)
  const s3Cost = s3StorageCost + (billablePuts / 1000) * p.s3.putPricePer1000 + (billableGets / 1000) * p.s3.getPricePer1000

  const total = dsqlCost + cognitoCost + lambdaCost + apigwCost + s3Cost
  return { dsql: round2(dsqlCost), cognito: round2(cognitoCost), lambda: round2(lambdaCost), apiGateway: round2(apigwCost), s3: round2(s3Cost), total: round2(total) }
}

function calculateSupabase(workload) {
  const sp = SUPABASE_PRICING
  const totalOps = workload.reads + workload.writes + workload.deletes
  const avgOpsPerSec = totalOps / sp.secondsPerMonth
  const fitsNano = workload.dbStorageGB <= 0.5 && workload.egressGB <= 5 && workload.mau <= 50000 && workload.peakConnections <= 200 && avgOpsPerSec <= 50
  const planKey = fitsNano ? 'free' : 'pro'
  const plan = sp.plans[planKey]

  let tierName, tierCost
  if (planKey === 'free') { tierName = 'Nano'; tierCost = 0 }
  else {
    const totalStorageGB = workload.dbStorageGB + workload.s3StorageGB
    const found = sp.computeTiers.find((t, i) => i >= 1 && totalStorageGB <= t.maxDB && workload.peakConnections <= t.maxConn && avgOpsPerSec <= t.maxOps)
    if (found) { tierName = found.name; tierCost = found.cost }
    else { const last = sp.computeTiers[sp.computeTiers.length - 1]; tierName = last.name; tierCost = last.cost }
  }

  const computeCredit = plan.computeCredit || 0
  const effectiveCompute = Math.max(0, tierCost - computeCredit)
  const storageOverageCost = Math.max(0, (workload.dbStorageGB + workload.s3StorageGB) - plan.includedStorageGB) * sp.overageRates.storagePerGB
  const egressOverageCost = Math.max(0, workload.egressGB - plan.includedEgressGB) * sp.overageRates.egressPerGB
  const mauOverageCost = Math.max(0, workload.mau - plan.includedMAU) * sp.overageRates.mauPerUser
  const total = plan.baseCost + effectiveCompute + storageOverageCost + egressOverageCost + mauOverageCost
  return { plan: plan.name, tier: tierName, total: round2(total) }
}

const selectedApp = ref('productivity')

const results = computed(() => {
  const out = []
  for (const sizeKey of Object.keys(SIZE_TIERS)) {
    const workload = deriveWorkload(selectedApp.value, sizeKey)
    const boa = calculateBOA(workload)
    const supa = calculateSupabase(workload)
    out.push({ sizeKey, workload, boa, supa })
  }
  return out
})
</script>

<template>
<div class="pricing-widget">

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
    <tr v-for="r in results" :key="r.sizeKey">
      <td>
        <strong>{{ SIZE_TIERS[r.sizeKey].name }}</strong><br>
        <small>{{ SIZE_TIERS[r.sizeKey].desc }}</small>
      </td>
      <td>{{ formatNumber(SIZE_TIERS[r.sizeKey].users) }}</td>
      <td>
        <strong :style="{ color: r.boa.total === 0 ? '#27ae60' : '#ec7211' }">
          {{ r.boa.total === 0 ? '$0 (free tier)' : formatMoney(r.boa.total) }}
        </strong>
      </td>
      <td>
        <strong>{{ r.supa.total === 0 ? '$0 (free tier)' : formatMoney(r.supa.total) }}</strong>
      </td>
      <td>
        <span v-if="r.supa.total === 0 && r.boa.total === 0" style="color: #27ae60">Both free</span>
        <span v-else-if="r.boa.total === 0 && r.supa.total > 0" style="color: #27ae60">Save {{ formatMoney(r.supa.total) }}/mo</span>
        <span v-else-if="r.boa.total < r.supa.total" style="color: #27ae60">
          {{ Math.round(((r.supa.total - r.boa.total) / r.supa.total) * 100) }}% less
        </span>
        <span v-else-if="r.boa.total > r.supa.total" style="color: #6c757d">
          Supabase {{ Math.round(((r.boa.total - r.supa.total) / r.supa.total) * 100) }}% less
        </span>
        <span v-else style="color: #6c757d">Same</span>
      </td>
      <td><small>{{ r.supa.plan }} + {{ r.supa.tier }}</small></td>
    </tr>
  </tbody>
</table>

<h2>Cost Breakdown by Service</h2>

<div class="breakdown-grid">
  <div v-for="r in results" :key="'b-' + r.sizeKey" class="breakdown-card">
    <h3>{{ SIZE_TIERS[r.sizeKey].name }} — {{ formatNumber(SIZE_TIERS[r.sizeKey].users) }} users</h3>
    <div class="total-price" :style="{ color: r.boa.total === 0 ? '#27ae60' : '#ec7211' }">
      {{ r.boa.total === 0 ? '$0/mo' : formatMoney(r.boa.total) + '/mo' }}
    </div>
    <div class="line-item" v-for="svc in [
      { name: 'Aurora DSQL', cost: r.boa.dsql },
      { name: 'Cognito', cost: r.boa.cognito },
      { name: 'Lambda', cost: r.boa.lambda },
      { name: 'API Gateway', cost: r.boa.apiGateway },
      { name: 'S3', cost: r.boa.s3 },
    ]" :key="svc.name">
      <span>{{ svc.name }}</span>
      <span :style="{ color: svc.cost === 0 ? '#27ae60' : 'inherit', fontWeight: 600 }">
        {{ svc.cost === 0 ? '$0 (free)' : formatMoney(svc.cost) }}
      </span>
    </div>
    <div class="line-item" style="margin-top: 0.5rem; border-top: 2px solid var(--vp-c-divider); padding-top: 0.5rem;">
      <span style="font-weight: 600;">vs Supabase</span>
      <span style="font-weight: 600;">{{ formatMoney(r.supa.total) }}/mo</span>
    </div>
  </div>
</div>

<p style="text-align: center; color: var(--vp-c-text-3); font-size: 0.85rem; margin-top: 2rem;">
  All prices US East (N. Virginia), April 2026.
  The calculator source code is open — see <code>website/js/pricing.js</code> in the repo.
</p>

</div>
</template>

<style scoped>
.pricing-widget {
  margin-top: 1.5rem;
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
}
.pricing-controls select {
  padding: 0.6rem 1rem;
  border: 1.5px solid var(--vp-c-divider);
  border-radius: 8px;
  font-size: 0.9rem;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  min-width: 320px;
}
.pricing-controls select:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}
.free-tier-callout {
  padding: 1rem 1.5rem;
  border-radius: 8px;
  background: rgba(46, 204, 113, 0.08);
  border: 1px solid rgba(46, 204, 113, 0.2);
  margin-bottom: 2rem;
  font-size: 0.9rem;
  line-height: 1.6;
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
  border-bottom: 2px solid var(--vp-c-divider);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vp-c-text-3);
}
.pricing-table th.boa-col {
  color: #ec7211;
}
.pricing-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--vp-c-divider);
  vertical-align: top;
}
.pricing-table small {
  color: var(--vp-c-text-3);
}
.breakdown-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}
.breakdown-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 1.25rem;
}
.breakdown-card h3 {
  font-size: 0.95rem;
  margin: 0 0 0.25rem;
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
  border-top: 1px solid var(--vp-c-divider);
}
</style>
