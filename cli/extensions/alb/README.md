# ALB Extension

Adds an Application Load Balancer with VPC, HTTPS listener
(required), and an HTTP→HTTPS redirect. Use when you need:

- Request timeouts longer than 29 seconds
- Response payloads larger than 10 MB
- Streaming responses
- WebSocket connections
- High-throughput workloads that benefit from ALB's LCU
  pricing model over API Gateway's per-request pricing

## Prerequisites — ACM certificate

The extension serves HTTPS end-to-end (no plaintext path).
You must provision an ACM certificate in the same region
before running `boa extend alb`.

    aws acm request-certificate \
      --domain-name api.yourdomain.com \
      --validation-method DNS \
      --region us-east-1

Complete DNS validation (add the CNAME record to your DNS
provider), then grab the certificate ARN with:

    aws acm list-certificates --region us-east-1

## Usage

    boa extend alb --certificate-arn arn:aws:acm:us-east-1:123456789012:certificate/...
    boa deploy

`boa extend alb` refuses to install without `--certificate-arn`.
The ARN is persisted to `.boa/config.json` so subsequent
`boa deploy` runs pick it up automatically.

## What It Creates

- VPC with 2 public subnets and internet gateway
- Application Load Balancer
- HTTPS:443 listener (TLS 1.3, `ELBSecurityPolicy-TLS13-1-2-2021-06`)
- HTTP:80 listener that 301-redirects to HTTPS
- Lambda target group
- WAF association moves from API Gateway to ALB

## DNS

After deploy, `AlbUrl` is an HTTPS URL pointing at the ALB's
AWS-assigned DNS name. For production, create a Route 53 (or
external-provider) CNAME from your certified domain name to
that DNS name. `boa deploy` does not manage DNS.

## Notes

- `apiUrl` changes from the API Gateway URL to the HTTPS ALB
  URL. Update your frontend configuration after switching.
- The HTTP listener never forwards traffic; it only exists
  so clients that hit `http://…` still get to HTTPS.
