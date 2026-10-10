terraform {
  required_version = ">= 1.5.0"

  # Keep state in a locked remote backend before anyone else applies this stack.
  # Local state stores the master-secret ARN on disk.

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.4"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "VirtuSP"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
