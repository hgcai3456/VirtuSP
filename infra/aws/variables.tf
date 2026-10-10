variable "aws_region" {
  type        = string
  description = "Region for the VirtuSP stack."
  default     = "us-east-1"
}

variable "name" {
  type        = string
  description = "Short name used for the cluster, load balancer, database, and repository. Apply this stack on its own: infra/rds uses the same default database identifier."
  default     = "virtusp"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,22}$", var.name))
    error_message = "Use 1-23 characters: a lowercase letter, then lowercase letters, numbers, or hyphens."
  }
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR for the VirtuSP VPC."
  default     = "10.42.0.0/16"
}

variable "container_port" {
  type        = number
  description = "Port the Node server listens on inside the task."
  default     = 3000
}

variable "image_tag" {
  type        = string
  description = "Tag pushed to ECR and deployed by the service. The deploy script overwrites this tag and forces a new deployment."
  default     = "latest"
}

variable "cpu_architecture" {
  type        = string
  description = "Fargate CPU architecture. X86_64 matches a normal Docker build on Windows."
  default     = "X86_64"

  validation {
    condition     = contains(["X86_64", "ARM64"], var.cpu_architecture)
    error_message = "cpu_architecture must be X86_64 or ARM64."
  }
}

variable "task_cpu" {
  type        = string
  description = "Fargate CPU units. 512 is 0.5 vCPU and pairs with 1024 MiB."
  default     = "512"
}

variable "task_memory" {
  type        = string
  description = "Fargate memory in MiB. 1024 pairs with 512 CPU units."
  default     = "1024"
}

variable "certificate_arn" {
  type        = string
  description = "ACM certificate in this region for the load balancer. Leave empty to publish HTTPS on a CloudFront address with Amazon's trusted certificate. When set, port 80 redirects to HTTPS on the load balancer instead."
  default     = ""
}

variable "alb_ingress_cidrs" {
  type        = list(string)
  description = "CIDR blocks allowed to open the load balancer."
  default     = ["0.0.0.0/0"]
}

variable "log_retention_days" {
  type        = number
  description = "CloudWatch retention for task logs."
  default     = 14
}

variable "container_insights" {
  type        = bool
  description = "Turn on ECS Container Insights."
  default     = false
}

variable "db_name" {
  type        = string
  description = "PostgreSQL database name."
  default     = "virtusp"
}

variable "db_username" {
  type        = string
  description = "PostgreSQL master username. RDS stores the generated password in Secrets Manager."
  default     = "virtusp"
}

variable "db_instance_class" {
  type        = string
  description = "RDS instance class."
  default     = "db.t4g.micro"
}

variable "db_backup_retention_days" {
  type        = number
  description = "Automated RDS backup retention."
  default     = 7
}

variable "db_multi_az" {
  type        = bool
  description = "Run a synchronous standby for the database."
  default     = false
}

variable "deletion_protection" {
  type        = bool
  description = "Block deletion of the load balancer and the database. Leave this off so terraform destroy can remove a practice stack. A protected database also keeps a final snapshot."
  default     = false
}

variable "efs_backup" {
  type        = bool
  description = "Turn on the automatic EFS backup. Leave this off so terraform destroy can remove the volume without leftover recovery points."
  default     = false
}

variable "autoscaling_min_capacity" {
  type        = number
  description = "Minimum number of Fargate tasks."
  default     = 1

  validation {
    condition     = var.autoscaling_min_capacity >= 1 && var.autoscaling_min_capacity <= 10
    error_message = "autoscaling_min_capacity must be from 1 to 10."
  }
}

variable "autoscaling_max_capacity" {
  type        = number
  description = "Maximum number of Fargate tasks. CPU or memory above target scales the service up to this count."
  default     = 4

  validation {
    condition     = var.autoscaling_max_capacity >= 1 && var.autoscaling_max_capacity <= 10
    error_message = "autoscaling_max_capacity must be from 1 to 10."
  }
}

variable "autoscaling_cpu_target" {
  type        = number
  description = "Target average CPU utilization for the ECS service, as a percent."
  default     = 70

  validation {
    condition     = var.autoscaling_cpu_target >= 10 && var.autoscaling_cpu_target <= 90
    error_message = "autoscaling_cpu_target must be from 10 to 90."
  }
}

variable "autoscaling_memory_target" {
  type        = number
  description = "Target average memory utilization for the ECS service, as a percent."
  default     = 75

  validation {
    condition     = var.autoscaling_memory_target >= 10 && var.autoscaling_memory_target <= 90
    error_message = "autoscaling_memory_target must be from 10 to 90."
  }
}
