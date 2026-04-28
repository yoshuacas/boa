# ALB Extension

Adds an Application Load Balancer with VPC and HTTP
listener. Use when you need:

- Request timeouts longer than 29 seconds
- Response payloads larger than 10 MB
- Streaming responses
- WebSocket connections
- High-throughput workloads that benefit from ALB's
  LCU pricing model over API Gateway's per-request
  pricing

## Usage

    boa extend alb
    boa deploy

## What It Creates

- VPC with 2 public subnets and internet gateway
- Application Load Balancer (HTTP listener)
- Lambda target group
- WAF association moves from API Gateway to ALB
- Reserved concurrency restored (50)

## Limitations

- HTTP only by default. HTTPS requires an ACM certificate
  and a custom domain. Chrome HTTPS-First mode will cause
  fetch failures from HTTPS frontends.
- `apiUrl` changes from HTTPS (API Gateway) to HTTP (ALB).
  Update your frontend configuration after switching.
