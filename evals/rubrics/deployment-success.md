# Rubric: Deployment Success

## What we're verifying
The CloudFormation stack deploys without errors and all resources are created.

## How to verify

```bash
# Check stack status
aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].StackStatus' \
  --output text
```

## Pass condition
Stack status is `CREATE_COMPLETE` or `UPDATE_COMPLETE`.

## Fail condition
Stack status contains `FAILED`, `ROLLBACK`, or the describe-stacks command fails.

## Common failure causes
- Missing IAM permissions on the deploying user
- CloudFormation template syntax errors
- Resource name conflicts (stack already exists)
- Lambda package too large (>50 MB zipped)
