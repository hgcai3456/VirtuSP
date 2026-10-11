#!/usr/bin/env bash
set -euo pipefail
: "${SOURCE_SHA:?}" "${REGISTRY:?}" "${IMAGE_REPO:?}"
cluster=virtusp
service=virtusp
digest=$(aws ecr describe-images --repository-name "$IMAGE_REPO" --image-ids "imageTag=$SOURCE_SHA" --query 'imageDetails[0].imageDigest' --output text)
[[ "$digest" == sha256:* ]]
image="$REGISTRY/$IMAGE_REPO@$digest"
previous=$(aws ecs describe-services --cluster "$cluster" --services "$service" --query 'services[0].taskDefinition' --output text)
aws ecs describe-task-definition --task-definition "$previous" --query taskDefinition > /tmp/virtusp-task-before.json
jq --arg image "$image" 'del(.taskDefinitionArn,.revision,.status,.requiresAttributes,.compatibilities,.registeredAt,.registeredBy,.deregisteredAt) | (.containerDefinitions[] | select(.name == "virtusp") | .image) = $image' /tmp/virtusp-task-before.json > /tmp/virtusp-task-next.json
next=$(aws ecs register-task-definition --cli-input-json file:///tmp/virtusp-task-next.json --query 'taskDefinition.taskDefinitionArn' --output text)
echo "Deploying $SOURCE_SHA as $next; rollback task: $previous"
aws ecs update-service --cluster "$cluster" --service "$service" --task-definition "$next" --query 'service.taskDefinition' --output text
aws ecs wait services-stable --cluster "$cluster" --services "$service"
actual=$(aws ecs describe-services --cluster "$cluster" --services "$service" --query 'services[0].taskDefinition' --output text)
[[ "$actual" == "$next" ]] || { echo "Deployment rolled back to $actual"; exit 1; }
for attempt in $(seq 1 12); do
  live=$(curl --fail --silent --show-error "https://d18g7r2mfy8mll.cloudfront.net/api/live?release=$SOURCE_SHA" | jq -r .gitSha) || live=unavailable
  if [[ "$live" == "$SOURCE_SHA" ]]; then
    echo "Verified live release $SOURCE_SHA ($digest)"
    exit 0
  fi
  sleep 5
done
echo "Live release verification failed: expected $SOURCE_SHA, got $live"
exit 1
