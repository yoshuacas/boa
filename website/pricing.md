---
outline: false
layout: page
---

<script setup>
import PricingCalculator from './.vitepress/theme/PricingCalculator.vue'
</script>

<div class="pricing-page">

<div class="pricing-hero">
  <h1>Free until your users show up.</h1>
  <p class="pricing-subtitle">No fees, no tiers, no paid plans. BOA is open source. You only pay for the AWS services your backend uses, and the free tier covers most of it.</p>
</div>

<PricingCalculator />

</div>

<style>
.pricing-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.pricing-hero {
  text-align: center;
  padding: 3rem 0 2rem;
}

.pricing-hero h1 {
  font-size: 2.5rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.3;
  padding-bottom: 0.1em;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #FF9900, #FF6600);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.pricing-subtitle {
  font-size: 1.15rem;
  color: var(--vp-c-text-2);
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.7;
}
</style>
