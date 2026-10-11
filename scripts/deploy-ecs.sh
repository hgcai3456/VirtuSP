#!/usr/bin/env bash
set -euo pipefail
: "${SOURCE_SHA:?}" "${AWS_ACCOUNT_ID:?}"
[[ "$SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid release SHA'; exit 1; }
work=$(mktemp -d)
trap 'rm -f "$work"/*.json; rmdir "$work"' EXIT

deploy_region() {
  local region=$1 name=$2 url=$3 digest image previous next actual live ready
  digest=$(aws ecr describe-images --region "$region" --repository-name "$name" --image-ids "imageTag=$SOURCE_SHA" --query 'imageDetails[0].imageDigest' --output text)
  [[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo "Invalid image digest in $region"; return 1; }
  image="$AWS_ACCOUNT_ID.dkr.ecr.$region.amazonaws.com/$name@$digest"
  previous=$(aws ecs describe-services --region "$region" --cluster "$name" --services "$name" --query 'services[0].taskDefinition' --output text)
  aws ecs describe-task-definition --region "$region" --task-definition "$previous" --query taskDefinition > "$work/$region-before.json"
  node - "$image" "$SOURCE_SHA" "$work/$region-before.json" "$work/$region-next.json" <<'NODE'
const fs = require('fs');
const [image, sha, input, output] = process.argv.slice(2);
const task = JSON.parse(fs.readFileSync(input, 'utf8'));
for (const field of ['taskDefinitionArn', 'revision', 'status', 'requiresAttributes', 'compatibilities', 'registeredAt', 'registeredBy', 'deregisteredAt']) delete task[field];
const container = task.containerDefinitions.find(c => c.name === 'virtusp');
if (!container) throw new Error('Existing task has no virtusp container');
container.image = image;
container.environment = (container.environment || []).filter(e => e.name !== 'VIRTUSP_GIT_SHA');
container.environment.push({name: 'VIRTUSP_GIT_SHA', value: sha});
fs.writeFileSync(output, JSON.stringify(task));
NODE
  next=$(aws ecs register-task-definition --region "$region" --cli-input-json "file://$work/$region-next.json" --query 'taskDefinition.taskDefinitionArn' --output text)
  echo "Deploying $SOURCE_SHA in $region as $next; rollback task: $previous"
  aws ecs update-service --region "$region" --cluster "$name" --service "$name" --task-definition "$next" --query 'service.taskDefinition' --output text
  aws ecs wait services-stable --region "$region" --cluster "$name" --services "$name"
  actual=$(aws ecs describe-services --region "$region" --cluster "$name" --services "$name" --query 'services[0].taskDefinition' --output text)
  [[ "$actual" == "$next" ]] || { echo "Deployment in $region rolled back to $actual"; return 1; }
  for attempt in $(seq 1 12); do
    live=$(curl --connect-timeout 10 --max-time 20 --fail --silent --show-error "$url/api/live?release=$SOURCE_SHA" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log(JSON.parse(s).gitSha));') || live=unavailable
    ready=$(curl --connect-timeout 10 --max-time 20 --fail --silent --show-error "$url/api/ready?release=$SOURCE_SHA" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log(JSON.parse(s).gitSha));') || ready=unavailable
    if [[ "$live" == "$SOURCE_SHA" && "$ready" == "$SOURCE_SHA" ]]; then
      echo "Verified $region release $SOURCE_SHA ($digest)"
      return 0
    fi
    sleep 5
  done
  echo "Verification failed in $region: expected $SOURCE_SHA, live=$live, ready=$ready"
  return 1
}

deploy_region us-east-1 virtusp-east https://d1uwsor6aitm.cloudfront.net
deploy_region us-west-2 virtusp https://d18g7r2mfy8mll.cloudfront.net
