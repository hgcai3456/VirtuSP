variable "aws_region" {
  type        = string
  description = "Region for the VirtuSP RDS instance."
  default     = "us-east-1"
}

variable "environment" {
  type        = string
  description = "production, staging, or development. Production stays private, protected, and snapshot-backed."
  default     = "development"

  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "environment must be production, staging, or development."
  }
}

variable "name" {
  type        = string
  description = "Name prefix for the VPC, security group, and RDS instance."
  default     = "virtusp"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,38}$", var.name)) && !strcontains(var.name, "--") && !endswith(var.name, "-")
    error_message = "name must be a lowercase identifier of at most 39 characters, without a trailing or doubled hyphen."
  }
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR for the VirtuSP VPC."
  default     = "10.42.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr must be a valid IPv4 CIDR."
  }
}

variable "instance_class" {
  type        = string
  description = "RDS instance class."
  default     = "db.t4g.micro"

  validation {
    condition     = can(regex("^db\\.[a-z0-9]+\\.[a-z0-9]+$", var.instance_class))
    error_message = "instance_class must look like db.t4g.micro."
  }
}

variable "engine_version" {
  type        = string
  description = "PostgreSQL version. Empty uses the latest 16 available in the region."
  default     = ""
}

variable "multi_az" {
  type        = bool
  description = "Run a standby in a second availability zone. Turn this on for production."
  default     = false
}

variable "db_name" {
  type        = string
  description = "Initial PostgreSQL database name."
  default     = "virtusp"

  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]{0,62}$", var.db_name))
    error_message = "db_name must start with a letter and contain only letters, numbers, and underscores."
  }
}

variable "db_username" {
  type        = string
  description = "Master username. RDS stores the generated password in Secrets Manager."
  default     = "virtusp"

  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]{0,15}$", var.db_username)) && !contains(["rdsadmin", "admin", "postgres"], lower(var.db_username))
    error_message = "db_username must be 1-16 characters, start with a letter, and must not be a reserved name."
  }
}

variable "publicly_accessible" {
  type        = bool
  description = "Attach a public address so this machine can load SQL. Production rejects this."
  default     = true
}

variable "allowed_cidrs" {
  type        = list(string)
  description = "CIDR blocks allowed to connect on port 5432 when the instance is public. Empty uses this machine's address. Never 0.0.0.0/0."
  default     = []

  validation {
    condition     = alltrue([for cidr in var.allowed_cidrs : can(cidrhost(cidr, 0))])
    error_message = "allowed_cidrs must be valid IPv4 CIDR blocks."
  }

  validation {
    condition     = alltrue([for cidr in var.allowed_cidrs : cidr != "0.0.0.0/0" && cidr != "::/0"])
    error_message = "Do not open PostgreSQL to the internet."
  }
}

variable "client_security_group_ids" {
  type        = list(string)
  description = "Security groups of application tasks that may connect to PostgreSQL."
  default     = []
}

variable "backup_retention_period" {
  type        = number
  description = "Days of automated backups to retain."
  default     = 7

  validation {
    condition     = var.backup_retention_period >= 7 && var.backup_retention_period <= 35
    error_message = "backup_retention_period must be from 7 to 35 days."
  }
}

variable "deletion_protection" {
  type        = bool
  description = "Block deletion of the instance. Required in production."
  default     = false
}

variable "skip_final_snapshot" {
  type        = bool
  description = "Skip the snapshot taken when the instance is deleted. Production rejects this."
  default     = true
}

variable "load_sql" {
  type        = bool
  description = "Run the schema and seed loader from this machine after create. The machine must be able to open TLS to the instance."
  default     = true
}
