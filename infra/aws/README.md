# VirtuSP on AWS

This stack runs the Node server on ECS Fargate behind an Application Load Balancer. SQLite stays the live database and is stored on EFS, one task at a time. PostgreSQL runs in private subnets. RDS generates the password and stores it in Secrets Manager. The server does not query PostgreSQL yet. `PGHOST`, `PGUSER`, and `PGPASSWORD` are on the task for that follow-up.

What Terraform creates:

- A VPC with two public subnets and two private subnets
- An internet-facing load balancer and an S3 bucket for its access logs
- A private S3 bucket for the patient PDFs in `data/reports`
- An ECS cluster, one Fargate service, and a one-off schema task
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

## HTTPS

Set `certificate_arn` to an ACM certificate in this region, then apply again. Port 80 redirects to 443. Point the certificate's DNS name at `alb_dns_name`.

## Tear down

```bash
cd infra/aws
terraform destroy
```

`deletion_protection` is off, and the database skips a final snapshot, so destroy can remove the practice stack. Turn `deletion_protection` on once you want to keep the database and the load balancer.
