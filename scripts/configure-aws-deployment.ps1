$ErrorActionPreference = 'Stop'
# Run with authorized AWS administrator credentials already in the environment.
# This configures the existing VirtuSP production project; it does not start a build.
$region = 'us-west-2'
$account = '389023343021'
$backup = Join-Path $env:TEMP ('virtusp-deploy-config-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
function Invoke-Aws([string[]]$Arguments) {
  $result = & aws @Arguments
  if ($LASTEXITCODE -ne 0) { throw "AWS command failed: $($Arguments[0]) $($Arguments[1])" }
  return $result
}
function Write-Json([string]$Name, $Value) {
  $file = Join-Path $backup $Name
  $Value | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $file -Encoding utf8NoBOM
  return "file://$file"
}
Invoke-Aws @('codebuild','batch-get-projects','--region',$region,'--names','virtusp-image','--output','json') | Set-Content (Join-Path $backup 'project-before.json')
Invoke-Aws @('ecs','describe-services','--region',$region,'--cluster','virtusp','--services','virtusp','--output','json') | Set-Content (Join-Path $backup 'service-before.json')
Invoke-Aws @('ecs','describe-task-definition','--region',$region,'--task-definition','virtusp','--output','json') | Set-Content (Join-Path $backup 'task-before.json')
$providers = (Invoke-Aws @('iam','list-open-id-connect-providers','--output','json') | ConvertFrom-Json).OpenIDConnectProviderList
$providerArn = "arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com"
if ($providerArn -notin $providers.Arn) {
  Invoke-Aws @('iam','create-open-id-connect-provider','--url','https://token.actions.githubusercontent.com','--client-id-list','sts.amazonaws.com','--output','json') | Out-Null
}
$trust = @{Version='2012-10-17';Statement=@(@{Effect='Allow';Principal=@{Federated=$providerArn};Action='sts:AssumeRoleWithWebIdentity';Condition=@{StringEquals=@{'token.actions.githubusercontent.com:aud'='sts.amazonaws.com';'token.actions.githubusercontent.com:sub'='repo:hgcai3456@14112169/VirtuSP@1413194225:ref:refs/heads/main'}}})}
$trustFile = Write-Json 'github-trust.json' $trust
$roles = (Invoke-Aws @('iam','list-roles','--query','Roles[].RoleName','--output','json') | ConvertFrom-Json)
if ('virtusp-github-deploy' -in $roles) {
  Invoke-Aws @('iam','get-role','--role-name','virtusp-github-deploy','--output','json') | Set-Content (Join-Path $backup 'github-role-before.json')
  Invoke-Aws @('iam','update-assume-role-policy','--role-name','virtusp-github-deploy','--policy-document',$trustFile) | Out-Null
} else {
  Invoke-Aws @('iam','create-role','--role-name','virtusp-github-deploy','--assume-role-policy-document',$trustFile) | Out-Null
}
$triggerPolicy = @{Version='2012-10-17';Statement=@(@{Effect='Allow';Action=@('codebuild:StartBuild','codebuild:BatchGetBuilds');Resource=@("arn:aws:codebuild:${region}:${account}:project/virtusp-image","arn:aws:codebuild:${region}:${account}:build/virtusp-image:*")})}
Invoke-Aws @('iam','put-role-policy','--role-name','virtusp-github-deploy','--policy-name','virtusp-main-build','--policy-document',(Write-Json 'github-policy.json' $triggerPolicy)) | Out-Null
$deployPolicy = @{Version='2012-10-17';Statement=@(
  @{Effect='Allow';Action='ecr:DescribeImages';Resource="arn:aws:ecr:${region}:${account}:repository/virtusp"},
  @{Effect='Allow';Action=@('ecs:DescribeServices','ecs:UpdateService');Resource="arn:aws:ecs:${region}:${account}:service/virtusp/virtusp"},
  @{Effect='Allow';Action=@('ecs:DescribeTaskDefinition','ecs:RegisterTaskDefinition');Resource='*'},
  @{Effect='Allow';Action='iam:PassRole';Resource=@("arn:aws:iam::${account}:role/virtusp-ecs-task","arn:aws:iam::${account}:role/virtusp-ecs-execution");Condition=@{StringEquals=@{'iam:PassedToService'='ecs-tasks.amazonaws.com'}}}
)}
Invoke-Aws @('iam','put-role-policy','--role-name','virtusp-codebuild','--policy-name','virtusp-ecs-deploy','--policy-document',(Write-Json 'codebuild-deploy-policy.json' $deployPolicy)) | Out-Null
$source = @{type='GITHUB';location='https://github.com/hgcai3456/VirtuSP.git';gitCloneDepth=1;buildspec='buildspec.yml';reportBuildStatus=$false;insecureSsl=$false;gitSubmodulesConfig=@{fetchSubmodules=$false}}
Invoke-Aws @('codebuild','update-project','--region',$region,'--name','virtusp-image','--source',(Write-Json 'github-source.json' $source),'--source-version','refs/heads/main','--concurrent-build-limit','1','--queued-timeout-in-minutes','30','--query','project.{name:name,source:source,sourceVersion:sourceVersion}','--output','json')
Write-Output "Configuration backups: $backup"
