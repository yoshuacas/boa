import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import * as config from '../lib/config.mjs';
import * as amplify from '../lib/amplify.mjs';
import * as deployLib from '../lib/deploy.mjs';
import { resolveTemplate } from '../lib/extensions.mjs';
import {
  detectFramework,
  buildFrontend,
  scanBundleForSecrets,
  findSourceMaps,
  writeRuntimeConfig,
  writeAmplifyHeaders,
  validateHeaders,
  registerOrigin,
} from '../lib/frontend.mjs';
import { heading, ok, warn, fail, blank, color, sym } from '../lib/ui.mjs';

function resolveFrontendPath(args, cfg) {
  if (args[0]) return resolve(args[0]);
  if (cfg.frontend?.path) return resolve(cfg.frontend.path);

  const candidates = ['./web', './frontend'];
  for (const c of candidates) {
    if (existsSync(resolve(c))) return resolve(c);
  }
  if (existsSync(resolve('.', 'index.html'))) return resolve('.');
  return null;
}

function parseOpts(args) {
  const opts = { path: null, allowSourceMaps: false, skipSecretScan: false, domain: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--path' && args[i + 1]) {
      opts.path = args[++i];
    } else if (args[i] === '--allow-source-maps') {
      opts.allowSourceMaps = true;
    } else if (args[i] === '--skip-secret-scan') {
      opts.skipSecretScan = true;
    } else if (args[i] === '--domain' && args[i + 1]) {
      opts.domain = args[++i];
    }
  }
  return opts;
}

function zipDir(dir) {
  const zipPath = join(dir, '..', 'boa-deploy.zip');
  execSync(`zip -r -q ${zipPath} .`, { cwd: dir });
  return zipPath;
}

export default async function deployFrontend(args, opts = {}) {
  const cfg = config.requireConfig();
  const { stackName, region } = cfg;
  const cliOpts = parseOpts(args);

  const positionalArgs = args.filter(
    (a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--path' && args[args.indexOf(a) - 1] !== '--domain'
  );

  const frontendPath = cliOpts.path
    ? resolve(cliOpts.path)
    : resolveFrontendPath(positionalArgs, cfg);

  if (!frontendPath || !existsSync(frontendPath)) {
    fail('Could not find frontend directory.');
    console.error(
      '  Provide a path: boa deploy frontend ./my-app'
    );
    process.exit(1);
  }

  const framework = detectFramework(frontendPath);
  if (!framework) {
    fail(`Could not detect frontend framework in ${frontendPath}`);
    process.exit(1);
  }

  heading(`Deploying frontend`);
  console.log(`  Frontend: ${frontendPath} (detected: ${framework})`);
  console.log(`  Backend:  ${color.bold(stackName)} (${region})`);
  blank();

  const startTime = Date.now();
  const distDir = buildFrontend(frontendPath, framework);
  const buildDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  ok(`Building... ${sym.ok} ${buildDuration}s`);

  if (cliOpts.skipSecretScan) {
    warn('Secret scan skipped (--skip-secret-scan). Deploy at your own risk.');
  } else {
    const knownSecrets = {
      serviceRoleKey: cfg.serviceRoleKey,
      jwtSecret: cfg.jwtSecret,
    };
    const matches = scanBundleForSecrets(distDir, knownSecrets);
    if (matches.length > 0) {
      fail('Secrets found in build output:');
      for (const m of matches) {
        console.error(`  ${m.file}:${m.line} — ${m.pattern}`);
        console.error(`    ${color.dim(m.snippet)}`);
      }
      process.exit(1);
    }
    ok('Scanning bundle for secrets... clean');
  }

  const allowSourceMaps = cliOpts.allowSourceMaps || cfg.frontend?.allowSourceMaps;
  const sourceMaps = findSourceMaps(distDir);
  if (sourceMaps.length > 0 && !allowSourceMaps) {
    fail('Source maps found in build output:');
    for (const f of sourceMaps) {
      console.error(`  ${f}`);
    }
    console.error('');
    console.error('  Remove source maps or pass --allow-source-maps to proceed.');
    process.exit(1);
  }
  ok(`Checking for source maps... ${sourceMaps.length === 0 ? 'none' : 'allowed'}`);

  writeRuntimeConfig(distDir, cfg);
  const headersPath = writeAmplifyHeaders(distDir, cfg);

  const headerWarnings = validateHeaders(headersPath, cfg);
  if (headerWarnings.length > 0) {
    for (const w of headerWarnings) {
      warn(w);
    }
  }
  ok('Validating headers... defaults applied');

  const amplifyDomain = cfg.frontend?.amplifyDomain;
  const expectedOrigin = amplifyDomain
    ? `https://${amplifyDomain}`
    : null;
  const isFirstDeploy = !cfg.frontend?.amplifyAppId;

  let appId = cfg.frontend?.amplifyAppId;
  let defaultDomain;

  if (appId) {
    const app = amplify.getApp({ appId, region });
    if (!app) {
      fail(`Amplify app ${appId} not found. Remove frontend.amplifyAppId from config to create a new one.`);
      process.exit(1);
    }
    defaultDomain = cfg.frontend.amplifyDomain || `main.${appId}.amplifyapp.com`;
    ok(`Using existing Amplify app ${appId}`);
  } else {
    const appName = `${stackName}-web`;
    const created = amplify.createApp({ name: appName, region });
    appId = created.appId;
    defaultDomain = created.defaultDomain;
    amplify.createBranch({ appId, branch: 'main', region });
    ok(`Creating Amplify app ${appName}... done`);
  }

  const origin = `https://${defaultDomain}`;
  const originalOrigins = [...(cfg.allowedOrigins || [])];
  const needsBackendUpdate = isFirstDeploy || (expectedOrigin && expectedOrigin !== origin);

  if (needsBackendUpdate) {
    registerOrigin(origin);
    ok('Registering origin in backend allow-list... done');

    const updatedCfg = config.read();
    const templatePath = resolveTemplate(process.cwd());
    try {
      let lambdaKey = updatedCfg.lambdaS3Key;
      let accountId = updatedCfg.accountId;

      if (!lambdaKey || !accountId) {
        const packaged = deployLib.packageArtifacts({
          projectDir: process.cwd(),
          templatePath,
          region,
          stackName,
        });
        lambdaKey = packaged.lambdaKey;
        accountId = packaged.accountId;
      }

      const bucket = deployLib.artifactsBucketName(accountId, region);
      const templateUrl = deployLib.uploadTemplate({
        templatePath, bucket, region, stackName,
      });
      const parameters = {
        ProjectName: stackName,
        LambdaS3Bucket: bucket,
        LambdaS3Key: lambdaKey,
        AllowedOrigins: updatedCfg.allowedOrigins.join(','),
      };
      if (updatedCfg.certificateArn) {
        parameters.CertificateArn = updatedCfg.certificateArn;
      }
      await deployLib.deployStack({
        stackName, region, templateUrl, parameters,
      });
      ok('Updating backend CORS allow-list... done');
    } catch (err) {
      const reverted = config.read();
      reverted.allowedOrigins = originalOrigins;
      config.write(reverted);
      throw err;
    }
  }

  const deployStart = Date.now();
  const zipPath = zipDir(distDir);
  const { jobId } = amplify.startDeployment({
    appId,
    branch: 'main',
    sourceUrl: zipPath,
    region,
  });
  const result = amplify.waitForDeployment({
    appId,
    branch: 'main',
    jobId,
    region,
  });
  const deployDuration = ((Date.now() - deployStart) / 1000).toFixed(1);

  if (result.status !== 'SUCCEED') {
    fail(`Amplify deployment failed (status: ${result.status})`);
    process.exit(1);
  }
  ok(`Deploying... ${sym.ok} ${deployDuration}s`);

  if (cliOpts.domain) {
    amplify.attachDomain({ appId, domain: cliOpts.domain, branch: 'main', region });
    ok(`Custom domain ${cliOpts.domain} attached`);
  }

  const updatedCfg = config.read() || cfg;
  updatedCfg.frontend = {
    ...updatedCfg.frontend,
    path: frontendPath,
    framework,
    amplifyAppId: appId,
    amplifyDomain: defaultDomain,
    deployedAt: new Date().toISOString(),
  };
  if (cliOpts.domain) {
    updatedCfg.frontend.customDomain = cliOpts.domain;
  }
  config.write(updatedCfg);

  blank();
  console.log(`  Frontend: ${color.cyan(`https://${defaultDomain}`)}`);
  console.log(`  Backend:  ${color.cyan(cfg.apiUrl)}`);
  blank();
}
