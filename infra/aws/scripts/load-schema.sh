#!/bin/sh
set -eu

stack=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

tf() {
  terraform -chdir="$stack" output -raw "$1"
}

region=$(tf aws_region)
cluster=$(tf ecs_cluster_name)
task_def=$(tf migrate_task_definition_arn)
subnets=$(tf public_subnet_ids)
sg=$(tf ecs_security_group_id)
logs=$(tf log_group_name)
net="awsvpcConfiguration={subnets=[$subnets],securityGroups=[$sg],assignPublicIp=ENABLED}"

task_arn=$(aws ecs run-task \
  --region "$region" \
  --cluster "$cluster" \
  --launch-type FARGATE \
  --task-definition "$task_def" \
  --network-configuration "$net" \
  --started-by virtusp-schema \
  --query "tasks[0].taskArn" \
  --output text)

echo "Schema task $task_arn"
aws ecs wait tasks-stopped --region "$region" --cluster "$cluster" --tasks "$task_arn"
exit_code=$(aws ecs describe-tasks --region "$region" --cluster "$cluster" --tasks "$task_arn" --query "tasks[0].containers[0].exitCode" --output text)
reason=$(aws ecs describe-tasks --region "$region" --cluster "$cluster" --tasks "$task_arn" --query "tasks[0].stoppedReason" --output text)

if [ "$exit_code" != "0" ]; then
  echo "Schema load exited $exit_code ($reason). Logs are in $logs." >&2
  exit 1
fi

echo "Schema loaded."
