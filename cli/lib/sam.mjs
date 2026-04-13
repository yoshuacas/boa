import { run } from './aws.mjs';

export function build(templateFile, buildDir, region) {
  run(`sam build --template-file ${templateFile} --build-dir ${buildDir} --region ${region}`);
}

export function deploy(templateFile, stackName, region) {
  run([
    `sam deploy`,
    `--template-file ${templateFile}`,
    `--stack-name ${stackName}`,
    `--region ${region}`,
    `--capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM`,
    `--resolve-s3`,
    `--no-confirm-changeset`,
    `--no-fail-on-empty-changeset`,
    `--parameter-overrides "ProjectName=${stackName}"`,
  ].join(' '));
}

export function remove(stackName, region) {
  run(`sam delete --stack-name ${stackName} --region ${region} --no-prompts`);
}
