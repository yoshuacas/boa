# Open Source Positioning Analysis (Internal Only)

Date: 2026-04-17

This document records the analysis of AWS Open Source Positioning Tenets (https://w.amazon.com/bin/view/Open_Source/Positioning_Tenets) applied to BOA, and the changes made as a result.

## The Tenets

1. **Relevant** -- Good product messaging includes relevant open source projects and positions them relative to our services.
2. **Collaborative** -- Community involvement informs and shapes our positioning.
3. **Humble** -- We accurately and humbly describe our contributions to open source projects.
4. **Positive** -- We don't disparage open source projects or publicly draw comparisons to our services.
5. **Appreciative** -- AWS publicly acknowledges and thanks open source projects that enable our innovation.
6. **Balanced** -- We weigh promotion of the service against promotion of the open source project.
7. **Uplifting** -- Open source projects are not competitors, they are stakeholders.

## Where BOA Already Aligned

- BOA is itself open source (Apache-2.0), the strongest form of collaboration (Tenet 2).
- The CLI and skill don't claim to have invented patterns -- they use PostgREST, GoTrue, Cedar, PostgreSQL (Tenet 3).
- Cedar is AWS's own open source project -- no tension.

## Issues Identified and Changes Made

### 1. Comparison table in PRODUCT.md (Tenet 4: Positive)

**Problem:** PRODUCT.md had a competitive comparison table (BOA vs Supabase vs Firebase vs Amplify) with checkmarks and Xs. Even with the disclaimer "We do not position against Supabase," the table itself was positioning against them.

**Change:** Removed the comparison table from PRODUCT.md. Moved it to docs/internal/COMPETITIVE.md for team use only. External materials (website, README, docs) must not include comparison tables.

### 2. Supabase compatibility framing (Tenet 5: Appreciative)

**Problem:** PRODUCT.md described Supabase compatibility as "an implementation detail, nothing more" and said "we do not track Supabase API changes." This was dismissive of a project BOA directly benefits from -- we use their SDK as the primary client, their API patterns as our interface, and their developer mindshare as our on-ramp.

**Change:** Rewrote to acknowledge PostgREST, GoTrue, and Supabase as the open source communities that defined the patterns BOA implements. New language: "We are grateful to the PostgREST, GoTrue, and Supabase communities for defining the API patterns that BOA builds on."

### 3. "Alternative to" framing (Tenet 7: Uplifting)

**Problem:** The business value statement framed BOA as "converting developers who would otherwise choose Supabase/Firebase." This is valid for internal documents (questionnaires, PRFAQs) but must never appear in external materials.

**Change:** Added explicit guidance to PRODUCT.md: "We never disparage or draw public comparisons to Supabase, Firebase, Amplify, or any other open source project or service."

## Rules for External Communication

| Context | Allowed | Not Allowed |
|---------|---------|-------------|
| Website, README, docs | "Implements PostgREST/GoTrue open standards" | "Alternative to Supabase" |
| Website, README, docs | "Tools built for those ecosystems work out of the box" | Comparison tables |
| Website, README, docs | "We are grateful to [project] for..." | "Better than X" |
| Internal docs, PRFAQs | Competitive framing, comparison tables | Publishing internally framed content externally |
| Blog posts, talks | Credit open source projects by name | Position them as competitors |

## Files Changed

- `docs/PRODUCT.md` -- Removed comparison table and dismissive compatibility language. Added "Open Source Acknowledgment" section.
- `docs/internal/COMPETITIVE.md` -- New file. Holds the comparison table and business case for internal use only.
- `docs/internal/OPEN-SOURCE-POSITIONING.md` -- This file.
