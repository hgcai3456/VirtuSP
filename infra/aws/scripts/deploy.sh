#!/bin/sh
set -eu

stack=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
root=$(CDPATH= cd -- "$(dirname "$0")/../../.." && pwd)

tf() {
  terraform -chdir="$stack" output -raw "$1"
}

region=$(tf aws_region)
repo=$(tf ecr_repository_url)
tag=$(tf image_tag)
cluster=$(tf ecs_cluster_name)
service=$(tf ecs_service_name)
arch=$(tf cpu_architecture)
url=$(tf url)
registry=${repo%%/*}
image="$repo:$tag"

if [ "$arch" = "ARM64" ]; then
  platform=linux/arm64
else
  platform=linux/amd64
fi

aws ecr get-login-password --region "$region" | docker login --username AWS --password-stdin "$registry"
docker build --platform "$platform" -t "$image" "$root"
docker push "$image"
aws ecs update-service --region "$region" --cluster "$cluster" --service "$service" --force-new-deployment >/dev/null
echo "Waiting for the service to stabilize..."
aws ecs wait services-stable --region "$region" --cluster "$cluster" --services "$service"
echo "VirtuSP is at $url"
