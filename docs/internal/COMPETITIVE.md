# Competitive Positioning (Internal Only)

This document is for internal team use only. Do not publish or reference in any external material.

## Comparison

| | BOA | Supabase | Firebase | Amplify Gen 2 |
|---|---|---|---|---|
| You own the infrastructure | Yes | No | No | Partial |
| Scales to zero ($0 idle) | Yes | No ($25/mo min) | Partial | Yes |
| PostgreSQL | Yes (DSQL) | Yes | No (Firestore) | No (DynamoDB) |
| Agent-ready skill | Yes | No | No | No |
| No vendor lock-in | Yes | No | No | AWS only |

## Business Case

BOA drives AWS service adoption by converting developers who would otherwise choose third-party BaaS providers (Supabase, Firebase) into AWS customers. Every BOA deployment creates paid usage of Aurora DSQL, Cognito, Lambda, S3, ALB, WAF, and Amplify.

## Why Supabase Compatibility Matters (Internally)

BOA's REST API is PostgREST-compatible and the auth API is GoTrue-compatible, which means `@supabase/supabase-js` works as a drop-in client library. This reduces adoption friction for the largest pool of potential users -- developers who already know the Supabase SDK. It is a deliberate growth strategy, not an accident.

We do not promise full Supabase compatibility externally, and we do not track upstream Supabase API changes.
