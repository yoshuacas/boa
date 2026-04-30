# Scenario: E-Commerce App

## Prompt

Build a marketplace where users can list products for sale, other users can browse products, add them to a cart, and place orders. Products should have images. Deploy to AWS.

## Expected outcome

- DSQL tables: `products`, `cart_items`, `orders`, `order_items` (better-auth stores users in its own schema)
- better-auth sign-up and sign-in working through `/auth/v1/*`
- REST API exposing `/rest/v1/*` via pgrest-lambda
- S3 bucket for product images, accessed through the built-in presigned URL endpoints
- Cedar access policies: owners manage their products, authenticated users own their cart and orders
- Checkout uses SQL transactions (BEGIN/COMMIT) for atomicity, issued through the REST API or a custom Lambda
- Frontend with product listing, cart, checkout flow
- CloudFormation stack in `CREATE_COMPLETE` or `UPDATE_COMPLETE`
