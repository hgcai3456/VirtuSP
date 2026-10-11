# VirtuSP on AWS

Documentation audit, 2026-10-11: this file describes Terraform configuration and historical deployment observations, not a newly verified live stack. Studio/encounters also persist through `lib/store.js`'s in-memory state and atomic JSON manifest; SQLite is the separate ground-truth library. PostgreSQL is a profile/document archive, not the primary encounter store. Shared JSON writes and process-local sessions need distributed-correctness testing before stronger scaling claims. See [current architecture](../../docs/ARCHITECTURE.md#current-stack-and-persistence).

This stack runs the Node server on ECS Fargate behind an Application Load Balancer. SQLite stays the live database and is stored on EFS. The service can run more than one task; those tasks share that file. PostgreSQL runs in private subnets. RDS generates the password and stores it in Secrets Manager. `PGHOST`, `PGUSER`, and `PGPASSWORD` are on the task. With `PROFILE_ARCHIVE=true`, each save copies every profile document and artifact file to the private reports bucket and upserts the same rows into PostgreSQL. Dialogue still reads the local profile store.

What Terraform creates:

- A VPC with two public subnets and two private subnets
- An internet-facing load balancer and an S3 bucket for its access logs
- A private S3 bucket for the patient PDFs in `data/reports`
- An ECS cluster, one Fargate service, and a one-off schema task
- CPU and memory target-tracking policies for that service
- An encrypted EFS volume mounted at `/app/data`
- An ECR repository
- A private PostgreSQL 16 instance
- CloudWatch logs, task roles, and security groups

Tasks use public IPs so they can pull from ECR without a NAT gateway. The task security group accepts traffic only from the load balancer. The database accepts traffic only from the tasks.

Apply this stack on its own. `infra/rds` creates a public database with the same identifier.

## Prerequisites

AWS credentials, the AWS CLI, Terraform 1.5 or newer, and Docker.

## Create the stack

```bash
cd infra/aws
terraform init
terraform apply
```

The service stays unhealthy until an image exists in ECR. That is expected on the first apply.

The container probe is `GET /api/live` (the process answered HTTP). The image `HEALTHCHECK` and the load balancer use `GET /api/ready`, which runs `SELECT 1` on the ground-truth SQLite connection and returns 503 when it cannot. Neither response includes the database error. Publish a new image and apply the task definition and target group before the running service uses these paths.

## Publish the image and load the schema

From the repository root, on Windows:

```powershell
pwsh infra/aws/scripts/deploy.ps1
pwsh infra/aws/scripts/load-schema.ps1
```

On macOS or Linux:

```bash
infra/aws/scripts/deploy.sh
infra/aws/scripts/load-schema.sh
```

`deploy` builds the image from the repository Dockerfile, pushes the tag in `image_tag`, and starts a new deployment. `load-schema` runs `infra/rds/sql` against PostgreSQL. The SQL is idempotent.

Open the `url` output when the service is stable.

The SQLite file is created on first boot and starts empty. Local `data/*.sqlite` files are left out of the image. Run ingest from the task, or copy a database onto the EFS volume, when you want the ground-truth library filled. The schema task loads the PostgreSQL seed in `infra/rds/sql`.

## Autoscaling

Application Auto Scaling tracks both average CPU (70%) and average memory (75%). A scale-out starts when either metric stays above its target. A scale-in starts only when both stay below their targets. Scale-out waits 60 seconds and scale-in waits 300 seconds before changing the count again.

`autoscaling_min_capacity` defaults to 4 and `autoscaling_max_capacity` defaults to 8. Each task runs one app container. The service registers both public subnets, which are in different Availability Zones, and Fargate places tasks across them. With four tasks running, that is two containers in each zone. Tasks share the SQLite file on EFS with a busy timeout. The service sets `VIRTUSP_SQLITE_EXCLUSIVE=0` so one task does not hold the file for its whole life. A deployment still stops the running tasks before starting the next revision, so Availability Zone rebalancing stays off.

RDS storage autoscaling is already on: the database starts at 20 GiB and can grow to 100 GiB. The same bounds are set in `infra/rds`.

## Monitoring

The CloudWatch dashboard named by `dashboard_name` shows the ECS service, the load balancer, PostgreSQL, EFS, and CloudFront when that distribution exists. Recent task logs are on the same dashboard.

The same dashboard, and the `virtusp-cost` dashboard, chart unblended AWS charges for this stack: the latest complete hour, the latest complete day, the last seven complete days, the calendar month to date, and the calendar year to date. A separate line shows each hour. Samples prefer resources tagged `Project`. This account cannot activate that tag, so the sample uses this stack's service names plus Fargate, `db.t4g.micro`, and public IPv4 usage. Other EC2 instances and other databases are left out. If Cost Explorer hourly data is off, the hour is the latest complete day divided by 24. A function queries Cost Explorer about once an hour and republishes the five figures every five minutes. Each Cost Explorer request is billed. These figures are account charges, not the model price estimate on the cost dashboard.

Two alarms use the same service metrics as Application Auto Scaling. `virtusp-ecs-cpu` enters ALARM when average CPU stays above 70% for three consecutive minutes. `virtusp-ecs-memory` does the same for average memory above 75%. One minute above the target starts scale-out and does not alarm. A missing sample, such as a short deploy gap, is treated as within the threshold.

Set `alarm_email` and apply to send both alarms to that address. The recipient must confirm the subscription before mail arrives. With no address, the alarm state stays on the dashboard. Open `dashboard_url` after apply.

## Bedrock

The task enables AI and uses the configurable Bedrock model/inference profile from Terraform (the current default is `us.xai.grok-4.7`). Calls use the task role rather than a browser model key. In strict mode the model selects topics and drafts assessments; the engine constructs approved patient wording. Optional natural mode has a different boundary; set `DIALOGUE_MODE=strict` explicitly for judging. Geography, model access and actual successful calls require deployment/provider verification; an inference-profile string alone is insufficient evidence of all processing locations.

## HTTPS

With no `certificate_arn`, the public site is a CloudFront address (`https://….cloudfront.net`) that uses Amazon's trusted certificate. Port 80 on the load balancer redirects there. CloudFront reaches the app with a private header, so opening the load balancer name directly does not skip TLS. The HTTPS page is a secure context, and the response allows camera and microphone access with `Permissions-Policy: camera=(self), microphone=(self)`.

Set `certificate_arn` to an ACM certificate in this region when you have a DNS name of your own, then apply again. Port 80 redirects to 443 on the load balancer, and CloudFront is not created. Point the certificate's DNS name at `alb_dns_name`.

## Tear down

Deletion protection is on for the database and the load balancer. The database keeps a final snapshot, and the reports bucket is not force-destroyed. Set `deletion_protection` to false and apply that change before destroy:

```bash
cd infra/aws
terraform apply -var="deletion_protection=false"
terraform destroy
```
