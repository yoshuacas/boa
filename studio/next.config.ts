import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expose Cognito pool identifiers (not secrets) as NEXT_PUBLIC_ so they are
  // statically inlined at build time and available in the Edge runtime for
  // middleware JWT verification via Cognito's public JWKS endpoint.
  env: {
    NEXT_PUBLIC_STUDIO_COGNITO_REGION:
      process.env.STUDIO_COGNITO_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
    NEXT_PUBLIC_STUDIO_COGNITO_USER_POOL_ID:
      process.env.STUDIO_COGNITO_USER_POOL_ID ?? '',
  },
};

export default nextConfig;
