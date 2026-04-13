import { run, shellEscape } from './aws.mjs';

export function build(templateFile, buildDir, region) {
  run(`sam build --template-file ${shellEscape(templateFile)} --build-dir ${shellEscape(buildDir)} --region ${shellEscape(region)}`);
}

export function deploy(templateFile, stackName, region) {
  run([
    `sam deploy`,
    `--template-file ${shellEscape(templateFile)}`,
    `--stack-name ${shellEscape(stackName)}`,
    `--region ${shellEscape(region)}`,
    `--capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM`,
    `--resolve-s3`,
    `--no-confirm-changeset`,
    `--no-fail-on-empty-changeset`,
    `--parameter-overrides "ProjectName=${stackName}"`,
  ].join(' '));
}

export function remove(stackName, region) {
  run(`sam delete --stack-name ${shellEscape(stackName)} --region ${shellEscape(region)} --no-prompts`);
}
