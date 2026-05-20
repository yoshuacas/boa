# Task 07: CloudFormation Template Additions

**Agent:** implementer
**Design:** docs/design/scheduled-functions.md

## Objective

Add the `FunctionsScheduleRole`, `FunctionsSchedulesStack`
nested-stack reference, and `FunctionsSchedulesTemplateUrl`
parameter to `cli/templates/backend.yaml`, all conditional
on schedules being present.

## Target Tests

No direct E2E test targets this task -- it is
infrastructure required for Tasks 08 (deploy wiring).
Validation is structural: the template must parse
correctly and contain the expected resources.

## Implementation

Modify `cli/templates/backend.yaml`:

### 1. New Parameter

Add to the `Parameters` section:

```yaml
  FunctionsSchedulesTemplateUrl:
    Type: String
    Default: ''
    Description: S3 URL for the schedules nested stack template
```

### 2. New Condition

Add to the `Conditions` section (create it if it does not
exist, after Parameters):

```yaml
  HasSchedules:
    !Not [!Equals [!Ref FunctionsSchedulesTemplateUrl, '']]
```

### 3. FunctionsScheduleRole Resource

Add after the existing Functions-related resources:

```yaml
  FunctionsScheduleRole:
    Type: AWS::IAM::Role
    Condition: HasSchedules
    Properties:
      RoleName: !Sub '${ProjectName}-functions-schedule'
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: scheduler.amazonaws.com
            Action: sts:AssumeRole
      Policies:
        - PolicyName: InvokeFunctionsLambda
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action: lambda:InvokeFunction
                Resource: !GetAtt FunctionsLambda.Arn
```

### 4. FunctionsSchedulesStack Resource

Add immediately after `FunctionsScheduleRole`:

```yaml
  FunctionsSchedulesStack:
    Type: AWS::CloudFormation::Stack
    Condition: HasSchedules
    Properties:
      TemplateURL: !Ref FunctionsSchedulesTemplateUrl
      Parameters:
        FunctionsLambdaArn: !GetAtt FunctionsLambda.Arn
        FunctionsScheduleRoleArn: !GetAtt FunctionsScheduleRole.Arn
        ProjectName: !Ref ProjectName
```

**Key details:**

- Both resources use `Condition: HasSchedules` so they
  are skipped when no schedules exist.
- `FunctionsScheduleRole` has a `RoleName` with the
  project name to avoid conflicts in multi-project
  accounts.
- The role's trust policy only allows
  `scheduler.amazonaws.com`.
- The policy only allows `lambda:InvokeFunction` on the
  specific FunctionsLambda ARN (least privilege).
- `Default: ''` on the parameter means existing deploys
  without schedules continue to work without passing this
  parameter.

## Acceptance Criteria

- `backend.yaml` is valid YAML (parse without errors)
- The template contains `FunctionsSchedulesTemplateUrl`
  parameter with `Default: ''`
- The template contains `HasSchedules` condition
- The template contains `FunctionsScheduleRole` with
  correct trust policy and invoke permission
- The template contains `FunctionsSchedulesStack` with
  correct parameter mappings
- Existing deployments (without the new parameter) still
  produce a valid stack (the condition handles this)
- No other template content is changed

## Conflict Criteria

- If `backend.yaml` already contains a
  `FunctionsScheduleRole` or `FunctionsSchedulesStack`,
  escalate -- the design assumes these do not exist.
- If a `Conditions` section already exists, add
  `HasSchedules` to it rather than creating a duplicate
  section.
