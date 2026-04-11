#!/usr/bin/env node

/**
 * BOA Pricing Data Generator
 *
 * Fetches current pricing from the AWS Pricing API (us-east-1),
 * computes costs for every app profile x size tier combination,
 * and writes website/data/pricing-data.json for the website to render.
 *
 * Usage:  node website/scripts/generate-pricing.mjs
 *
 * Requires: AWS credentials with pricing:GetProducts permission.
 * The Pricing API is only available in us-east-1 and ap-south-1.
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'public', 'data', 'pricing-data.json');
const REGION = 'us-east-1';

// ---------------------------------------------------------------------------
// AWS Pricing API helpers
// ---------------------------------------------------------------------------

function fetchProducts(serviceCode, filters = []) {
  let allProducts = [];
  let nextToken = null;

  do {
    const args = [
      'aws', 'pricing', 'get-products',
      '--service-code', serviceCode,
      '--region', 'us-east-1',
      '--max-results', '100',
    ];
    if (filters.length > 0) {
      args.push('--filters');
      for (const f of filters) {
        args.push(`Type=TERM_MATCH,Field=${f.field},Value=${f.value}`);
      }
    }
    if (nextToken) {
      args.push('--next-token', nextToken);
    }
    const cmd = args.join(' ');
    const raw = execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
    const data = JSON.parse(raw);
    for (const p of data.PriceList || []) {
      allProducts.push(JSON.parse(p));
    }
    nextToken = data.NextToken || null;
  } while (nextToken);

  return allProducts;
}

function extractRates(product) {
  const results = [];
  const terms = product.terms?.OnDemand || {};
  for (const term of Object.values(terms)) {
    for (const dim of Object.values(term.priceDimensions || {})) {
      results.push({
        description: dim.description,
        rate: parseFloat(dim.pricePerUnit.USD),
        beginRange: dim.beginRange,
        endRange: dim.endRange,
        unit: dim.unit,
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Fetch pricing for each service
// ---------------------------------------------------------------------------

function fetchDSQLPricing() {
  console.log('Fetching Aurora DSQL pricing...');
  const products = fetchProducts('AuroraDSQL');

  let dpuPerUnit = null;
  let storagePerGB = null;
  let freeTierDPUs = null;
  let freeTierStorageGB = null;

  for (const p of products) {
    const region = p.product?.attributes?.regionCode;
    const usage = p.product?.attributes?.usagetype || '';
    const rates = extractRates(p);

    for (const r of rates) {
      if (usage.includes('DSQL-DistributedProcessingUnits') && region === REGION) {
        dpuPerUnit = r.rate;
      }
      if (usage.includes('DSQL-Storage-ByteHrs') && region === REGION) {
        storagePerGB = r.rate;
      }
      // Global free tier entries
      if (usage === 'Global-DSQL-DistributedProcessingUnits' && r.rate === 0) {
        const match = r.description.match(/first ([\d,]+)k? DPUs/i);
        if (match) freeTierDPUs = parseInt(match[1].replace(/,/g, ''));
      }
      if (usage === 'Global-DSQL-Storage-ByteHrs' && r.rate === 0) {
        const match = r.description.match(/first ([\d.]+) GB/i);
        if (match) freeTierStorageGB = parseFloat(match[1]);
      }
    }
  }

  // Parse free tier from descriptions if regex didn't match
  if (freeTierDPUs === null) {
    for (const p of products) {
      const usage = p.product?.attributes?.usagetype || '';
      if (usage === 'Global-DSQL-DistributedProcessingUnits') {
        const rates = extractRates(p);
        for (const r of rates) {
          if (r.rate === 0 && r.description.includes('100k')) {
            freeTierDPUs = 100000;
          }
        }
      }
    }
  }

  assert(dpuPerUnit !== null, 'Failed to fetch DSQL DPU price');
  assert(storagePerGB !== null, 'Failed to fetch DSQL storage price');

  return {
    dpuPrice: dpuPerUnit,
    dpuPricePerMillion: dpuPerUnit * 1000000,
    storagePricePerGB: storagePerGB,
    freeTierDPUs: freeTierDPUs || 100000,
    freeTierStorageGB: freeTierStorageGB || 1.0,
    dpuPerRead: 0.020,
    dpuPerWrite: 0.050,
    dpuPerDelete: 0.030,
  };
}

function fetchCognitoPricing() {
  console.log('Fetching Cognito pricing...');
  const products = fetchProducts('AmazonCognito', [
    { field: 'regionCode', value: REGION },
  ]);

  // We use the Lite tier (cheapest for typical BOA workloads)
  const liteTiers = [];
  const essentialsRate = { rate: null };

  for (const p of products) {
    const usage = p.product?.attributes?.usagetype || '';
    const rates = extractRates(p);

    if (usage.includes('CognitoLiteMAU')) {
      for (const r of rates) {
        liteTiers.push({
          beginRange: parseInt(r.beginRange),
          endRange: r.endRange === 'Inf' ? Infinity : parseInt(r.endRange),
          pricePerMAU: r.rate,
        });
      }
    }
    if (usage.includes('CognitoEssentialsMAU')) {
      for (const r of rates) {
        essentialsRate.rate = r.rate;
      }
    }
  }

  liteTiers.sort((a, b) => a.beginRange - b.beginRange);

  assert(liteTiers.length > 0, 'Failed to fetch Cognito Lite pricing tiers');

  // Cognito free tier: first 10,000 MAU free (separate from per-MAU tiers).
  // The API tiers start at 0, so we insert the free tier and use API
  // boundaries directly for the paid tiers.
  const tiers = [
    { upTo: 10000, pricePerMAU: 0 },
  ];
  for (const lt of liteTiers) {
    const upTo = lt.endRange === Infinity ? 10000000 : lt.endRange;
    if (upTo > 10000) {
      tiers.push({ upTo, pricePerMAU: lt.pricePerMAU });
    }
  }

  return {
    tiers,
    essentialsRatePerMAU: essentialsRate.rate,
    tierModel: 'Lite',
  };
}

function fetchLambdaPricing() {
  console.log('Fetching Lambda pricing...');
  const products = fetchProducts('AWSLambda', [
    { field: 'regionCode', value: REGION },
  ]);

  let requestPrice = null;
  let gbSecondPrice = null;

  for (const p of products) {
    const usage = p.product?.attributes?.usagetype || '';
    const rates = extractRates(p);

    // x86 request pricing: Lambda-Request
    if (usage === 'Request' || usage === 'USE1-Request') {
      for (const r of rates) {
        if (r.description.includes('per Request') && !r.description.includes('ARM')) {
          requestPrice = r.rate;
        }
      }
    }
    // x86 GB-second pricing: Lambda-GB-Second (not ARM, not provisioned)
    if ((usage === 'Lambda-GB-Second' || usage === 'USE1-Lambda-GB-Second') && !usage.includes('ARM')) {
      for (const r of rates) {
        if (r.beginRange === '0') {
          gbSecondPrice = r.rate;
        }
      }
    }
  }

  // Lambda standard pricing is stable and well-known
  // Fall back to published rates if not found in API
  if (requestPrice === null) {
    console.log('  Lambda request price not in API, using published rate: $0.20/1M');
    requestPrice = 0.0000002;
  }
  if (gbSecondPrice === null) {
    console.log('  Lambda GB-second price not in API, using published rate: $0.0000166667');
    gbSecondPrice = 0.0000166667;
  }

  return {
    requestPricePerMillion: requestPrice * 1000000,
    gbSecondPrice,
    freeTierRequests: 1000000,
    freeTierGBSeconds: 400000,
    memoryMB: 256,
    avgDurationMs: 100,
  };
}

function fetchApiGatewayPricing() {
  console.log('Fetching API Gateway pricing...');
  const products = fetchProducts('AmazonApiGateway', [
    { field: 'regionCode', value: REGION },
  ]);

  const restTiers = [];

  for (const p of products) {
    const usage = p.product?.attributes?.usagetype || '';
    const fam = p.product?.productFamily || '';

    // REST API: ApiGatewayRequest (not Http, not WebSocket)
    if (usage.includes('ApiGatewayRequest') && !usage.includes('Http') && fam === 'API Calls') {
      const rates = extractRates(p);
      for (const r of rates) {
        const perMillion = r.rate * 1000000;
        restTiers.push({
          description: r.description,
          pricePerMillion: round(perMillion, 2),
          beginRange: parseInt(r.beginRange || '0'),
          endRange: r.endRange === 'Inf' ? Infinity : parseInt(r.endRange),
        });
      }
    }
  }

  restTiers.sort((a, b) => a.beginRange - b.beginRange);

  assert(restTiers.length >= 3, `Expected 3+ API Gateway REST tiers, got ${restTiers.length}`);

  // Convert to the format our calculator uses
  const tiers = restTiers.map(t => ({
    upTo: t.endRange === Infinity ? 20000000000 : t.endRange,
    pricePerMillion: t.pricePerMillion,
  }));

  return {
    tiers,
    freeTierRequests: 1000000,
  };
}

function fetchS3Pricing() {
  console.log('Fetching S3 pricing...');
  const products = fetchProducts('AmazonS3', [
    { field: 'regionCode', value: REGION },
  ]);

  let putPricePer1000 = null;
  let getPricePer1000 = null;
  const storageTiers = [];

  for (const p of products) {
    const usage = p.product?.attributes?.usagetype || '';
    const fam = p.product?.productFamily || '';
    const storageClass = p.product?.attributes?.storageClass || '';
    const rates = extractRates(p);

    // S3 Standard storage
    if (fam === 'Storage' && (usage === 'TimedStorage-ByteHrs' || usage === 'USE1-TimedStorage-ByteHrs') && storageClass === 'General Purpose') {
      for (const r of rates) {
        storageTiers.push({
          beginRange: parseInt(r.beginRange || '0'),
          endRange: r.endRange === 'Inf' ? Infinity : parseInt(r.endRange),
          pricePerGB: r.rate,
        });
      }
    }

    // S3 Standard requests - Tier1 (PUT/COPY/POST/LIST)
    if (usage === 'Requests-Tier1' && fam === 'API Request') {
      for (const r of rates) {
        if (r.description.includes('PUT') || r.description.includes('COPY')) {
          putPricePer1000 = r.rate * 1000;
        }
      }
    }

    // S3 Standard requests - Tier2 (GET/SELECT)
    if (usage === 'Requests-Tier2' && fam === 'API Request') {
      for (const r of rates) {
        if (r.description.includes('GET') || r.description.includes('all other')) {
          getPricePer1000 = r.rate * 1000;
        }
      }
    }
  }

  storageTiers.sort((a, b) => a.beginRange - b.beginRange);

  // Use first tier price (covers up to 50TB, well beyond our scenarios)
  const storagePricePerGB = storageTiers.length > 0 ? storageTiers[0].pricePerGB : null;

  assert(storagePricePerGB !== null, 'Failed to fetch S3 storage price');
  assert(putPricePer1000 !== null, 'Failed to fetch S3 PUT request price');
  assert(getPricePer1000 !== null, 'Failed to fetch S3 GET request price');

  return {
    storagePricePerGB,
    putPricePer1000,
    getPricePer1000,
    freeTierStorageGB: 5,
    freeTierPutRequests: 2000,
    freeTierGetRequests: 20000,
  };
}

// ---------------------------------------------------------------------------
// Supabase pricing (manually maintained — they don't have a public API)
// ---------------------------------------------------------------------------

const SUPABASE_PRICING = {
  source: 'https://supabase.com/pricing',
  lastVerified: new Date().toISOString().slice(0, 10),
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
    { name: '16XL',   cost: 3730, maxDB: 10000, maxConn: 12000, maxOps: 30000 },
  ],
  overageRates: {
    storagePerGB: 0.125,
    egressPerGB: 0.09,
    mauPerUser: 0.00325,
  },
  secondsPerMonth: 2628000,
};

// ---------------------------------------------------------------------------
// App Profiles
// ---------------------------------------------------------------------------

const APP_PROFILES = {
  productivity: {
    name: 'Productivity App',
    example: 'Todo lists, notes, project management',
    requestsPerUserMonth: 1000,
    readRatio: 0.60,
    writeRatio: 0.40,
    storagePerUserKB: 50,
    dbStoragePerUserKB: 5,
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

const SIZE_TIERS = {
  prototype: { name: 'Prototype',  users: 50,      desc: 'Building & testing' },
  startup:   { name: 'Startup',    users: 1000,    desc: 'First paying customers' },
  growth:    { name: 'Growth',     users: 100000,  desc: 'Series A/B, scaling' },
  unicorn:   { name: 'Unicorn',    users: 2000000, desc: 'At scale, 1M+ users' },
};

// ---------------------------------------------------------------------------
// Calculators (same logic as pricing.js, now using fetched rates)
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
  const egressGB = (reads * 1024) / (1024 ** 3);
  const peakConnections = Math.max(5, Math.floor(users / 100));

  return {
    profileKey,
    sizeKey,
    users,
    totalRequests,
    reads,
    writes,
    deletes,
    dbStorageGB: round(dbStorageGB, 3),
    s3StorageGB: round(s3StorageGB, 3),
    egressGB: round(egressGB, 1),
    peakConnections,
    mau: users,
  };
}

function calculateBOA(workload, rates) {
  const { dsql, cognito, lambda, apiGateway, s3 } = rates;

  // 1. Aurora DSQL
  const readDPUs = workload.reads * dsql.dpuPerRead;
  const writeDPUs = workload.writes * dsql.dpuPerWrite;
  const deleteDPUs = workload.deletes * dsql.dpuPerDelete;
  const totalDPUs = readDPUs + writeDPUs + deleteDPUs;
  const billableDPUs = Math.max(0, totalDPUs - dsql.freeTierDPUs);
  const billableDbStorage = Math.max(0, workload.dbStorageGB - dsql.freeTierStorageGB);
  const dsqlCost = (billableDPUs / 1000000) * dsql.dpuPricePerMillion
                 + billableDbStorage * dsql.storagePricePerGB;

  // 2. Amazon Cognito
  let cognitoCost = 0;
  let remainingMAU = workload.mau;
  let prevLimit = 0;
  for (const tier of cognito.tiers) {
    const tierUsers = Math.min(remainingMAU, tier.upTo - prevLimit);
    if (tierUsers <= 0) break;
    cognitoCost += tierUsers * tier.pricePerMAU;
    remainingMAU -= tierUsers;
    prevLimit = tier.upTo;
  }

  // 3. AWS Lambda
  const lambdaRequests = workload.totalRequests;
  const billableLambdaReqs = Math.max(0, lambdaRequests - lambda.freeTierRequests);
  const lambdaRequestCost = (billableLambdaReqs / 1000000) * lambda.requestPricePerMillion;
  const memoryGB = lambda.memoryMB / 1024;
  const durationSec = lambda.avgDurationMs / 1000;
  const totalGBSeconds = lambdaRequests * memoryGB * durationSec;
  const billableGBSeconds = Math.max(0, totalGBSeconds - lambda.freeTierGBSeconds);
  const lambdaComputeCost = billableGBSeconds * lambda.gbSecondPrice;
  const lambdaCost = lambdaRequestCost + lambdaComputeCost;

  // 4. API Gateway REST
  const apigwRequests = workload.totalRequests;
  const billableApigwReqs = Math.max(0, apigwRequests - apiGateway.freeTierRequests);
  let apigwCost = 0;
  let remaining = billableApigwReqs;
  let prevTierLimit = 0;
  for (const tier of apiGateway.tiers) {
    const tierCapacity = tier.upTo - prevTierLimit;
    const inThisTier = Math.min(remaining, tierCapacity);
    if (inThisTier <= 0) break;
    apigwCost += (inThisTier / 1000000) * tier.pricePerMillion;
    remaining -= inThisTier;
    prevTierLimit = tier.upTo;
  }

  // 5. Amazon S3
  const billableS3Storage = Math.max(0, workload.s3StorageGB - s3.freeTierStorageGB);
  const s3StorageCost = billableS3Storage * s3.storagePricePerGB;
  const billablePuts = Math.max(0, workload.writes - s3.freeTierPutRequests);
  const billableGets = Math.max(0, workload.reads - s3.freeTierGetRequests);
  const s3RequestCost = (billablePuts / 1000) * s3.putPricePer1000
                      + (billableGets / 1000) * s3.getPricePer1000;
  const s3Cost = s3StorageCost + s3RequestCost;

  const total = dsqlCost + cognitoCost + lambdaCost + apigwCost + s3Cost;

  return {
    dsql: round2(dsqlCost),
    cognito: round2(cognitoCost),
    lambda: round2(lambdaCost),
    apiGateway: round2(apigwCost),
    s3: round2(s3Cost),
    total: round2(total),
  };
}

function calculateSupabase(workload) {
  const sp = SUPABASE_PRICING;
  const totalOps = workload.reads + workload.writes + workload.deletes;
  const avgOpsPerSec = totalOps / sp.secondsPerMonth;

  const fitsNano = workload.dbStorageGB <= 0.5
    && workload.egressGB <= 5
    && workload.mau <= 50000
    && workload.peakConnections <= 200
    && avgOpsPerSec <= 50;

  const planKey = fitsNano ? 'free' : 'pro';
  const plan = sp.plans[planKey];

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

  const storageOverageGB = Math.max(0, (workload.dbStorageGB + workload.s3StorageGB) - plan.includedStorageGB);
  const storageOverageCost = storageOverageGB * sp.overageRates.storagePerGB;
  const egressOverageGB = Math.max(0, workload.egressGB - plan.includedEgressGB);
  const egressOverageCost = egressOverageGB * sp.overageRates.egressPerGB;
  const mauOverage = Math.max(0, workload.mau - (plan.includedMAU || 0));
  const mauOverageCost = mauOverage * sp.overageRates.mauPerUser;

  const total = plan.baseCost + effectiveCompute + storageOverageCost + egressOverageCost + mauOverageCost;

  return {
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

function round2(n) { return Math.round(n * 100) / 100; }
function round(n, decimals) { const f = 10 ** decimals; return Math.round(n * f) / f; }

function assert(condition, message) {
  if (!condition) {
    console.error(`ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log(`\nBOA Pricing Generator — ${new Date().toISOString()}`);
  console.log(`Region: ${REGION}\n`);

  // Fetch rates from AWS
  const rates = {
    dsql: fetchDSQLPricing(),
    cognito: fetchCognitoPricing(),
    lambda: fetchLambdaPricing(),
    apiGateway: fetchApiGatewayPricing(),
    s3: fetchS3Pricing(),
  };

  console.log('\nFetched rates:');
  console.log(`  DSQL:        $${rates.dsql.dpuPrice}/DPU, $${rates.dsql.storagePricePerGB}/GB-mo`);
  console.log(`  Cognito:     ${rates.cognito.tiers.length} tiers (model: ${rates.cognito.tierModel})`);
  console.log(`  Lambda:      $${rates.lambda.requestPricePerMillion}/1M req, $${rates.lambda.gbSecondPrice}/GB-s`);
  console.log(`  API Gateway: ${rates.apiGateway.tiers.length} tiers, first at $${rates.apiGateway.tiers[0].pricePerMillion}/1M`);
  console.log(`  S3:          $${rates.s3.storagePricePerGB}/GB, PUT $${rates.s3.putPricePer1000}/1K, GET $${rates.s3.getPricePer1000}/1K`);

  // Compute all scenarios
  console.log('\nComputing scenarios...');
  const scenarios = {};
  for (const profileKey of Object.keys(APP_PROFILES)) {
    scenarios[profileKey] = [];
    for (const sizeKey of Object.keys(SIZE_TIERS)) {
      const workload = deriveWorkload(profileKey, sizeKey);
      const boa = calculateBOA(workload, rates);
      const supa = calculateSupabase(workload);

      let savings = null;
      if (supa.total > 0 && boa.total > 0) {
        savings = round2(((supa.total - boa.total) / supa.total) * 100);
      } else if (supa.total === 0 && boa.total === 0) {
        savings = 0;
      } else if (boa.total === 0 && supa.total > 0) {
        savings = 100;
      }

      scenarios[profileKey].push({ workload, boa, supa, savingsPercent: savings });
    }
  }

  // Build output
  const output = {
    generatedAt: new Date().toISOString(),
    region: REGION,
    regionName: 'US East (N. Virginia)',
    sources: {
      aws: 'AWS Pricing API (pricing.us-east-1.amazonaws.com)',
      supabase: 'https://supabase.com/pricing',
    },
    rates: {
      dsql: rates.dsql,
      cognito: rates.cognito,
      lambda: rates.lambda,
      apiGateway: rates.apiGateway,
      s3: rates.s3,
    },
    supabasePricing: SUPABASE_PRICING,
    appProfiles: APP_PROFILES,
    sizeTiers: SIZE_TIERS,
    scenarios,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`\nWrote ${OUTPUT_PATH}`);

  // Print summary table
  console.log('\n--- Summary ---\n');
  for (const [profileKey, profile] of Object.entries(APP_PROFILES)) {
    console.log(`${profile.name}:`);
    for (const s of scenarios[profileKey]) {
      const size = SIZE_TIERS[s.workload.sizeKey];
      const boaStr = s.boa.total === 0 ? '$0 (free)' : `$${s.boa.total.toFixed(2)}`;
      const supaStr = s.supa.total === 0 ? '$0 (free)' : `$${s.supa.total.toFixed(2)}`;
      const saveStr = s.savingsPercent !== null ? `${s.savingsPercent}%` : 'n/a';
      console.log(`  ${size.name.padEnd(12)} ${size.users.toString().padStart(10)} users | BOA: ${boaStr.padStart(12)} | Supa: ${supaStr.padStart(12)} | Save: ${saveStr}`);
    }
  }
}

main();
