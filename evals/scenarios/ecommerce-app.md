# Scenario: E-Commerce App

## Prompt

Build a marketplace where users can list products for sale, other users can browse products, add them to a cart, and place orders. Products should have images. Deploy to AWS.

## Expected outcome

- DSQL database with users, products, cart_items, orders, order_items tables
- Cognito user pool with self-signup
- Lambda function with CRUD + checkout transaction
- S3 bucket for product images
- REST API Gateway with Cognito authorizer
- Checkout uses SQL transactions (BEGIN/COMMIT) for atomicity
- Frontend with product listing, cart, checkout flow
- Stack deployed via SAM
