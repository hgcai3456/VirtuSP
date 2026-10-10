$ErrorActionPreference = "Stop"
$stack = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path

function Get-Tf([string]$name) {
  $value = terraform "-chdir=$stack" output -raw $name
  if ($LASTEXITCODE -ne 0) { throw "terraform output $name failed" }
  return $value.Trim()
}

$region = Get-Tf "aws_region"
$repo = Get-Tf "ecr_repository_url"
$tag = Get-Tf "image_tag"
$cluster = Get-Tf "ecs_cluster_name"
$service = Get-Tf "ecs_service_name"
$arch = Get-Tf "cpu_architecture"
$url = Get-Tf "url"
$platform = if ($arch -eq "ARM64") { "linux/arm64" } else { "linux/amd64" }
$registry = $repo.Split("/")[0]
$image = "${repo}:${tag}"

aws ecr get-login-password --region $region | docker login --username AWS --password-stdin $registry
if ($LASTEXITCODE -ne 0) { throw "ECR login failed" }

docker build --platform $platform -t $image $root
if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

docker push $image
if ($LASTEXITCODE -ne 0) { throw "docker push failed" }

aws ecs update-service --region $region --cluster $cluster --service $service --force-new-deployment | Out-Null
if ($LASTEXITCODE -ne 0) { throw "ecs update-service failed" }

Write-Host "Waiting for the service to stabilize..."
aws ecs wait services-stable --region $region --cluster $cluster --services $service
if ($LASTEXITCODE -ne 0) { throw "The service did not stabilize. Check the log group /ecs/$cluster." }

Write-Host "VirtuSP is at $url"
