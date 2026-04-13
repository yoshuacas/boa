---
name: boa-pricing
description: Estimate AWS costs for a BOA backend and compare with Supabase pricing. Use this skill when a developer asks about costs, pricing, "how much will this cost", "is BOA cheaper than Supabase", "estimate my AWS bill", "pricing comparison", budget planning, or wants to understand what they'll pay at different user scales. Also use when someone is evaluating whether to use BOA vs Supabase/Firebase from a cost perspective.
license: Apache-2.0
allowed-tools: "Bash(node *) Bash(jq *) Read Grep Glob"
---

# BOA Pricing — Cost Estimation & Comparison

Help developers understand what their BOA backend will cost and how it compares to Supabase.

## How BOA Pricing Works

BOA is pure pay-per-use AWS. There is no BOA fee — you pay only for the AWS services you consume. At low usage, the AWS Free Tier covers most or all of the cost. At high usage, you pay per-request and per-GB.

**Key difference from Supabase:** Supabase charges a flat monthly fee per plan tier ($0/25/599) plus a fixed compute instance that runs 24/7 whether you use it or not. BOA scales to zero — if nobody uses your app, you pay close to nothing.

## Step 1: Interview the Developer

Ask about their app to estimate usage. You need these numbers:

| Question | Why | Default if unknown |
|----------|-----|-------------------|
| What does your app do? | Determines read/write ratio | — |
| How many monthly active users? | Drives all cost calculations | Start with 1,000 |
| How many API requests per user per month? | Core cost driver | 2,000 |
| What % are reads vs writes? | DSQL charges differently | 70% read / 30% write |
| How much file storage per user? | S3 costs | 100 KB |
| How much database storage per user? | DSQL storage | 10 KB |

If the developer describes their app but doesn't know exact numbers, use these profiles as starting points:

| App Type | Requests/user/mo | Read % | Write % | Storage/user | DB/user |
|----------|-----------------|--------|---------|-------------|---------|
| Productivity (todo, notes) | 1,000 | 60% | 40% | 50 KB | 5 KB |
| Social (feeds, media) | 3,000 | 80% | 20% | 500 KB | 20 KB |
| Real-time (chat) | 8,000 | 50% | 50% | 100 KB | 30 KB |
| E-commerce (catalog, orders) | 2,000 | 75% | 25% | 200 KB | 15 KB |
| SaaS (CRM, analytics) | 4,000 | 70% | 30% | 300 KB | 50 KB |
| IoT (telemetry) | 7,500 | 6% | 94% | 5,000 KB | 500 KB |

These are starting points — adjust based on what the developer tells you about their specific app.

## Step 2: Calculate BOA Costs

Use these AWS rates (us-east-1):

### Aurora DSQL
- **DPU price:** $0.000008 per DPU ($8 per million DPUs)
- **Storage:** $0.33/GB/month
- **DPUs per operation:** Read = 0.02, Write = 0.05, Delete = 0.03
- **Free tier:** 100,000 DPUs + 1 GB storage

### Cognito
- **0 - 10,000 MAU:** Free
- **10,001 - 100,000 MAU:** $0.0055/MAU
- **100,001 - 1,000,000 MAU:** $0.0046/MAU
- **1,000,001 - 10,000,000 MAU:** $0.00325/MAU

### Lambda
- **Requests:** $0.20 per million
- **Compute:** $0.0000166667 per GB-second
- **Assumed:** 256 MB memory, 100ms average duration
- **Free tier:** 1M requests + 400,000 GB-seconds

### API Gateway (REST)
- **First 333M requests:** $3.50 per million
- **Next 667M:** $2.80 per million
- **Next 19B:** $2.38 per million
- **Free tier:** 1M requests (first 12 months)

### S3
- **Storage:** $0.023/GB/month
- **PUT:** $0.005 per 1,000 requests
- **GET:** $0.0004 per 1,000 requests
- **Free tier:** 5 GB storage + 2,000 PUT + 20,000 GET

### Calculation

```
Total Requests = MAU × requests_per_user_per_month
Reads = Total Requests × read_ratio
Writes = Total Requests × write_ratio
Deletes = Writes × 0.05 (estimate)

DSQL DPUs = (Reads × 0.02) + (Writes × 0.05) + (Deletes × 0.03)
DSQL Cost = max(0, (DPUs - 100,000) × $0.000008) + max(0, (DB_Storage_GB - 1) × $0.33)

Cognito Cost = tiered pricing on MAU (first 10K free)

Lambda Requests Cost = max(0, (Total_Requests - 1,000,000)) × $0.20 / 1,000,000
Lambda Compute Cost = Total_Requests × 0.256 × 0.1 × $0.0000166667
Lambda Cost = Requests Cost + Compute Cost

API GW Cost = max(0, (Total_Requests - 1,000,000)) × $3.50 / 1,000,000

S3 Storage = MAU × storage_per_user
S3 Cost = max(0, (S3_Storage_GB - 5)) × $0.023 + PUT_costs + GET_costs

BOA Total = DSQL + Cognito + Lambda + API GW + S3
```

## Step 3: Calculate Supabase Equivalent

Supabase pricing works differently — fixed plans with compute tiers:

| Plan | Base Cost | Included |
|------|-----------|----------|
| Free | $0/mo | 500 MB DB, 50K MAU, 5 GB egress |
| Pro | $25/mo | 8 GB DB, 100K MAU, 250 GB egress |
| Team | $599/mo | 8 GB DB, 100K MAU, 250 GB egress |

Plus a **compute tier** (runs 24/7):

| Tier | Cost/mo | Max DB | Max Connections | Max Ops/sec |
|------|---------|--------|-----------------|-------------|
| Nano | $0 | 500 MB | 200 | 50 |
| Micro | $10 | 10 GB | 200 | 150 |
| Small | $15 | 50 GB | 400 | 300 |
| Medium | $60 | 100 GB | 600 | 500 |
| Large | $110 | 200 GB | 800 | 1,000 |
| XL | $210 | 500 GB | 1,000 | 2,500 |
| 2XL | $410 | 1 TB | 1,500 | 5,000 |
| 4XL | $960 | 2 TB | 3,000 | 8,000 |

To find the right Supabase tier: estimate peak operations/second = Total_Requests / seconds_in_month × peak_multiplier (use 3x). Pick the smallest tier that handles that.

Overages: Storage $0.125/GB, Egress $0.09/GB, MAU $0.00325/user.

**Supabase Total = Plan base + Compute tier + Overages**

## Step 4: Present the Comparison

Show costs at multiple scales. Use a table like this:

```
| Scale        | Users   | BOA (AWS) /mo | Supabase /mo | Notes |
|-------------|---------|---------------|--------------|-------|
| Prototype   | 50      | ~$0           | $0           | Both free at this scale |
| Startup     | 1,000   | ~$X           | $0-25        | ... |
| Growth      | 100,000 | ~$X           | $225+        | ... |
| At Scale    | 2M      | ~$X           | $X           | ... |
```

## Step 5: Give Recommendations

Based on the numbers, tell the developer:

**When BOA wins on cost:**
- Prototype to startup (0-10K users): BOA is essentially free thanks to AWS Free Tier. Supabase Free tier is also free but hits limits faster (50 ops/sec cap, 500 MB DB).
- Variable traffic: BOA scales to zero. Supabase compute runs 24/7 even with no traffic.
- Write-light apps: DSQL reads cost 0.02 DPU vs 0.05 for writes.

**When Supabase may be cheaper:**
- Growth stage (10K-100K users): Supabase Pro ($25) + a compute tier ($60-210) can be cheaper than the per-request costs on API Gateway + Lambda at high request volumes. This is because API Gateway charges $3.50/million which adds up fast.
- High-traffic apps: At 100M+ requests/month, API Gateway alone costs $346+.

**Cost optimization tips for BOA:**
- API Gateway is often the biggest cost at scale. Consider CloudFront caching for read-heavy APIs.
- DSQL is very cheap — storage is $0.33/GB and operations are fractions of a cent.
- Cognito is free up to 10K MAU, then $0.0055/MAU — cheaper than Supabase's $0.00325/MAU overage only because Supabase includes 100K MAU in Pro.
- Lambda costs are minimal — the compute is cheap at 256MB/100ms per request.

**Be honest.** BOA's per-request pricing means it wins at low scale and loses at high scale for request-heavy apps. The crossover point depends on the app profile. Don't oversell either side — show the numbers and let the developer decide.

## Reference Data

For pre-calculated scenarios across all app profiles and scales, read the pricing data file:

```bash
BOA_PLUGIN="$(dirname "$(dirname "$CLAUDE_SKILL_DIR")")"
cat $BOA_PLUGIN/../website/public/data/pricing-data.json
```

This file has exact cost breakdowns for 6 app types at 4 scales (50, 1K, 100K, 2M users) with both BOA and Supabase costs. Use these as cross-references when presenting estimates to the developer.
