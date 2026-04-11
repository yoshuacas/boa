/**
 * BOA Full-Stack Pricing Calculator
 *
 * Estimates monthly cost for the complete BOA serverless stack:
 *   - Aurora DSQL (database)
 *   - Amazon Cognito (auth)
 *   - AWS Lambda (compute)
 *   - API Gateway REST (API layer)
 *   - Amazon S3 (storage)
 *
 * Also calculates equivalent Supabase cost for comparison.
 *
 * All prices: US East (N. Virginia), April 2026.
 * Sources: aws.amazon.com/pricing, supabase.com/pricing
 */

// ---------------------------------------------------------------------------
// App Profiles — per-user behavior for different application types
// ---------------------------------------------------------------------------

const APP_PROFILES = {
  productivity: {
    name: 'Productivity App',
    example: 'Todo lists, notes, project management',
    requestsPerUserMonth: 1000,
    readRatio: 0.60,
    writeRatio: 0.40,
    storagePerUserKB: 50,       // S3 file storage per user
    dbStoragePerUserKB: 5,      // database rows per user
  },
  social: {
    name: 'Social App',
    example: 'Feeds, posts, comments, likes, media sharing',
    requestsPerUserMonth: 3000,
    readRatio: 0.80,
    writeRatio: 0.20,
    storagePerUserKB: 500,
    dbStoragePerUserKB: 20,
  },
  realtime: {
    name: 'Real-time App',
    example: 'Chat, collaboration, live dashboards',
    requestsPerUserMonth: 8000,
    readRatio: 0.50,
    writeRatio: 0.50,
    storagePerUserKB: 100,
    dbStoragePerUserKB: 30,
  },
  healthIot: {
    name: 'Health / IoT App',
    example: 'Tracking, telemetry, sensor data',
    requestsPerUserMonth: 7500,
    readRatio: 0.06,
    writeRatio: 0.94,
    storagePerUserKB: 5000,
    dbStoragePerUserKB: 500,
  },
  ecommerce: {
    name: 'E-Commerce App',
    example: 'Product catalog, cart, orders, payments',
    requestsPerUserMonth: 2000,
    readRatio: 0.75,
    writeRatio: 0.25,
    storagePerUserKB: 200,
    dbStoragePerUserKB: 15,
  },
  saas: {
    name: 'Multi-tenant SaaS',
    example: 'CRM, analytics dashboard, admin tools',
    requestsPerUserMonth: 4000,
    readRatio: 0.70,
    writeRatio: 0.30,
    storagePerUserKB: 300,
    dbStoragePerUserKB: 50,
  },
};

// ---------------------------------------------------------------------------
// Size Tiers — company scale
// ---------------------------------------------------------------------------

const SIZE_TIERS = {
  prototype:  { name: 'Prototype',      users: 50,        desc: 'Building & testing' },
  startup:    { name: 'Startup',        users: 1000,      desc: 'First paying customers' },
  growth:     { name: 'Growth',         users: 100000,    desc: 'Series A/B, scaling' },
  unicorn:    { name: 'Unicorn',        users: 2000000,   desc: 'At scale, 1M+ users' },
};

// ---------------------------------------------------------------------------
// BOA Stack Pricing Constants (us-east-1, April 2026)
// ---------------------------------------------------------------------------

const BOA_PRICING = {
  // Aurora DSQL
  dsql: {
    dpuPricePerMillion: 8.00,
    storagePricePerGB: 0.33,
    freeTierDPUs: 100000,
    freeTierStorageGB: 1.0,
    dpuPerRead: 0.020,
    dpuPerWrite: 0.050,
    dpuPerDelete: 0.030,
  },

  // Amazon Cognito
  cognito: {
    // Pricing tiers (cumulative)
    tiers: [
      { upTo: 10000,    pricePerMAU: 0 },       // first 10K free
      { upTo: 100000,   pricePerMAU: 0.0055 },  // 10K–100K
      { upTo: 1000000,  pricePerMAU: 0.0046 },  // 100K–1M
      { upTo: 10000000, pricePerMAU: 0.00325 }, // 1M–10M
    ],
  },

  // AWS Lambda
  lambda: {
    requestPricePerMillion: 0.20,
    gbSecondPrice: 0.0000166667,
    freeTierRequests: 1000000,       // 1M requests/month
    freeTierGBSeconds: 400000,       // 400K GB-seconds/month
    memoryMB: 256,                   // allocated memory per function
    avgDurationMs: 100,              // average invocation duration
  },

  // API Gateway REST
  apiGateway: {
    tiers: [
      { upTo: 333000000,   pricePerMillion: 3.50 },
      { upTo: 667000000,   pricePerMillion: 2.80 },
      { upTo: 19000000000, pricePerMillion: 2.38 },
    ],
    freeTierRequests: 1000000,       // 1M requests/month (12 months)
  },

  // Amazon S3
  s3: {
    storagePricePerGB: 0.023,
    putPricePer1000: 0.005,
    getPricePer1000: 0.0004,
    freeTierStorageGB: 5,            // 5 GB (12 months)
    freeTierPutRequests: 2000,
    freeTierGetRequests: 20000,
  },
};

// ---------------------------------------------------------------------------
// Supabase Pricing Constants
// ---------------------------------------------------------------------------

const SUPABASE_PRICING = {
  plans: {
    free: {
      name: 'Free',
      baseCost: 0,
      includedStorageGB: 0.5,
      includedEgressGB: 5,
      includedMAU: 50000,
      maxOpsPerSec: 50,
    },
    pro: {
      name: 'Pro',
      baseCost: 25,
      computeCredit: 10,
      includedStorageGB: 8,
      includedEgressGB: 250,
      includedMAU: 100000,
    },
    team: {
      name: 'Team',
      baseCost: 599,
      computeCredit: 10,
      includedStorageGB: 8,
      includedEgressGB: 250,
      includedMAU: 100000,
    },
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
    { name: '16XL',   cost: 3730, maxDB: 10000, maxConn: 12000,maxOps: 30000 },
  ],
  overageRates: {
    storagePerGB: 0.125,
    egressPerGB: 0.09,
    mauPerUser: 0.00325,
  },
  secondsPerMonth: 2628000,
};

// ---------------------------------------------------------------------------
// Workload Derivation
// ---------------------------------------------------------------------------

function deriveWorkload(profileKey, sizeKey) {
  const profile = APP_PROFILES[profileKey];
  const size = SIZE_TIERS[sizeKey];
  const users = size.users;
  const totalRequests = users * profile.requestsPerUserMonth;
  const reads = Math.round(totalRequests * profile.readRatio);
  const writes = Math.round(totalRequests * profile.writeRatio);
  const deletes = Math.round(writes * 0.05);
  const dbStorageGB = (users * profile.dbStoragePerUserKB) / 1000000;
  const s3StorageGB = (users * profile.storagePerUserKB) / 1000000;
  const egressGB = (reads * 1024) / (1024 ** 3);    // ~1 KB per read
  const peakConnections = Math.max(5, Math.floor(users / 100));

  return {
    name: `${profile.name} — ${size.name}`,
    profileKey,
    sizeKey,
    users,
    totalRequests,
    reads,
    writes,
    deletes,
    dbStorageGB: Math.round(dbStorageGB * 1000) / 1000,
    s3StorageGB: Math.round(s3StorageGB * 1000) / 1000,
    egressGB: Math.round(egressGB * 10) / 10,
    peakConnections,
    mau: users,
  };
}

// ---------------------------------------------------------------------------
// BOA Stack Calculator
// ---------------------------------------------------------------------------

function calculateBOA(workload) {
  const p = BOA_PRICING;

  // 1. Aurora DSQL
  const readDPUs = workload.reads * p.dsql.dpuPerRead;
  const writeDPUs = workload.writes * p.dsql.dpuPerWrite;
  const deleteDPUs = workload.deletes * p.dsql.dpuPerDelete;
  const totalDPUs = readDPUs + writeDPUs + deleteDPUs;
  const billableDPUs = Math.max(0, totalDPUs - p.dsql.freeTierDPUs);
  const billableDbStorage = Math.max(0, workload.dbStorageGB - p.dsql.freeTierStorageGB);
  const dsqlCost = (billableDPUs / 1000000) * p.dsql.dpuPricePerMillion
                 + billableDbStorage * p.dsql.storagePricePerGB;

  // 2. Amazon Cognito
  let cognitoCost = 0;
  let remainingMAU = workload.mau;
  let prevLimit = 0;
  for (const tier of p.cognito.tiers) {
    const tierUsers = Math.min(remainingMAU, tier.upTo - prevLimit);
    if (tierUsers <= 0) break;
    cognitoCost += tierUsers * tier.pricePerMAU;
    remainingMAU -= tierUsers;
    prevLimit = tier.upTo;
  }

  // 3. AWS Lambda
  const lambdaRequests = workload.totalRequests;
  const billableLambdaReqs = Math.max(0, lambdaRequests - p.lambda.freeTierRequests);
  const lambdaRequestCost = (billableLambdaReqs / 1000000) * p.lambda.requestPricePerMillion;

  const memoryGB = p.lambda.memoryMB / 1024;
  const durationSec = p.lambda.avgDurationMs / 1000;
  const totalGBSeconds = lambdaRequests * memoryGB * durationSec;
  const billableGBSeconds = Math.max(0, totalGBSeconds - p.lambda.freeTierGBSeconds);
  const lambdaComputeCost = billableGBSeconds * p.lambda.gbSecondPrice;
  const lambdaCost = lambdaRequestCost + lambdaComputeCost;

  // 4. API Gateway REST
  const apigwRequests = workload.totalRequests;
  const billableApigwReqs = Math.max(0, apigwRequests - p.apiGateway.freeTierRequests);
  let apigwCost = 0;
  let remaining = billableApigwReqs;
  let prevTierLimit = 0;
  for (const tier of p.apiGateway.tiers) {
    const tierCapacity = tier.upTo - prevTierLimit;
    const inThisTier = Math.min(remaining, tierCapacity);
    if (inThisTier <= 0) break;
    apigwCost += (inThisTier / 1000000) * tier.pricePerMillion;
    remaining -= inThisTier;
    prevTierLimit = tier.upTo;
  }

  // 5. Amazon S3
  const billableS3Storage = Math.max(0, workload.s3StorageGB - p.s3.freeTierStorageGB);
  const s3StorageCost = billableS3Storage * p.s3.storagePricePerGB;

  const putRequests = workload.writes;
  const getRequests = workload.reads;
  const billablePuts = Math.max(0, putRequests - p.s3.freeTierPutRequests);
  const billableGets = Math.max(0, getRequests - p.s3.freeTierGetRequests);
  const s3RequestCost = (billablePuts / 1000) * p.s3.putPricePer1000
                      + (billableGets / 1000) * p.s3.getPricePer1000;
  const s3Cost = s3StorageCost + s3RequestCost;

  const total = dsqlCost + cognitoCost + lambdaCost + apigwCost + s3Cost;

  return {
    platform: 'BOA (AWS)',
    dsql: round2(dsqlCost),
    cognito: round2(cognitoCost),
    lambda: round2(lambdaCost),
    apiGateway: round2(apigwCost),
    s3: round2(s3Cost),
    total: round2(total),
    breakdown: {
      totalDPUs: Math.round(totalDPUs),
      billableDPUs: Math.round(billableDPUs),
      lambdaRequests: lambdaRequests,
      billableLambdaReqs: billableLambdaReqs,
      apigwRequests: apigwRequests,
      billableApigwReqs: billableApigwReqs,
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase Calculator
// ---------------------------------------------------------------------------

function calculateSupabase(workload) {
  const sp = SUPABASE_PRICING;
  const totalOps = workload.reads + workload.writes + workload.deletes;
  const avgOpsPerSec = totalOps / sp.secondsPerMonth;

  // Plan selection
  const fitsNano = workload.dbStorageGB <= 0.5
    && workload.egressGB <= 5
    && workload.mau <= 50000
    && workload.peakConnections <= 200
    && avgOpsPerSec <= 50;

  const planKey = fitsNano ? 'free' : 'pro';
  const plan = sp.plans[planKey];

  // Compute tier
  let tierName, tierCost;
  if (planKey === 'free') {
    tierName = 'Nano';
    tierCost = 0;
  } else {
    const totalStorageGB = workload.dbStorageGB + workload.s3StorageGB;
    const found = sp.computeTiers.find((t, i) =>
      i >= 1 && totalStorageGB <= t.maxDB
      && workload.peakConnections <= t.maxConn
      && avgOpsPerSec <= t.maxOps
    );
    if (found) {
      tierName = found.name;
      tierCost = found.cost;
    } else {
      const last = sp.computeTiers[sp.computeTiers.length - 1];
      tierName = last.name;
      tierCost = last.cost;
    }
  }

  const computeCredit = plan.computeCredit || 0;
  const effectiveCompute = Math.max(0, tierCost - computeCredit);

  // Overages
  const storageOverageGB = Math.max(0, (workload.dbStorageGB + workload.s3StorageGB) - plan.includedStorageGB);
  const storageOverageCost = storageOverageGB * sp.overageRates.storagePerGB;

  const egressOverageGB = Math.max(0, workload.egressGB - plan.includedEgressGB);
  const egressOverageCost = egressOverageGB * sp.overageRates.egressPerGB;

  const mauOverage = Math.max(0, workload.mau - plan.includedMAU);
  const mauOverageCost = mauOverage * sp.overageRates.mauPerUser;

  const total = plan.baseCost + effectiveCompute + storageOverageCost + egressOverageCost + mauOverageCost;

  return {
    platform: 'Supabase',
    plan: plan.name,
    tier: tierName,
    baseCost: plan.baseCost,
    computeCost: effectiveCompute,
    storageOverage: round2(storageOverageCost),
    egressOverage: round2(egressOverageCost),
    mauOverage: round2(mauOverageCost),
    total: round2(total),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n) {
  return Math.round(n * 100) / 100;
}

function formatMoney(val) {
  if (val === 0) return '$0';
  if (val < 0.01) return '<$0.01';
  if (val < 1) return `$${val.toFixed(2)}`;
  if (val >= 10000) return `$${val.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (val >= 100) return `$${val.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${val.toFixed(2)}`;
}

function formatNumber(n) {
  if (n >= 1000000000) return `${(n / 1000000000).toFixed(1)}B`;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}

// ---------------------------------------------------------------------------
// Comparison for all sizes of a given app profile
// ---------------------------------------------------------------------------

function compareProfile(profileKey) {
  const results = [];
  for (const sizeKey of Object.keys(SIZE_TIERS)) {
    const workload = deriveWorkload(profileKey, sizeKey);
    const boa = calculateBOA(workload);
    const supa = calculateSupabase(workload);
    let savings = null;
    if (supa.total > 0 && boa.total > 0) {
      savings = `${(((supa.total - boa.total) / supa.total) * 100).toFixed(0)}% less`;
    } else if (supa.total === 0 && boa.total === 0) {
      savings = 'Both free';
    } else if (boa.total === 0) {
      savings = 'BOA is free';
    }
    results.push({ workload, boa, supa, savings });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Exports for use in HTML
// ---------------------------------------------------------------------------

window.BOAPricing = {
  APP_PROFILES,
  SIZE_TIERS,
  BOA_PRICING,
  deriveWorkload,
  calculateBOA,
  calculateSupabase,
  compareProfile,
  formatMoney,
  formatNumber,
};
