$ErrorActionPreference = "Stop"
$stack = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Get-Tf([string]$name) {
  $value = terraform "-chdir=$stack" output -raw $name
  if ($LASTEXITCODE -ne 0) { throw "terraform output $name failed" }
  return $value.Trim()
}

$region = Get-Tf "aws_region"
$cluster = Get-Tf "ecs_cluster_name"
$taskDef = Get-Tf "migrate_task_definition_arn"
$subnets = Get-Tf "public_subnet_ids"
$sg = Get-Tf "ecs_security_group_id"
$logs = Get-Tf "log_group_name"
$net = "awsvpcConfiguration={subnets=[$subnets],securityGroups=[$sg],assignPublicIp=ENABLED}"

$taskArn = aws ecs run-task `
  --region $region `
  --cluster $cluster `
  --launch-type FARGATE `
  --task-definition $taskDef `
  --network-configuration $net `
  --started-by virtusp-schema `
  --query "tasks[0].taskArn" `
  --output text
if ($LASTEXITCODE -ne 0 -or -not $taskArn -or $taskArn -eq "None") {
  throw "ecs run-task failed"
}

Write-Host "Schema task $taskArn"
aws ecs wait tasks-stopped --region $region --cluster $cluster --tasks $taskArn
if ($LASTEXITCODE -ne 0) { throw "schema task wait failed" }

$exitCode = aws ecs describe-tasks --region $region --cluster $cluster --tasks $taskArn --query "tasks[0].containers[0].exitCode" --output text
$reason = aws ecs describe-tasks --region $region --cluster $cluster --tasks $taskArn --query "tasks[0].stoppedReason" --output text
if ($exitCode -ne "0") {
  throw "Schema load exited $exitCode ($reason). Logs are in $logs."
}

Write-Host "Schema loaded."
