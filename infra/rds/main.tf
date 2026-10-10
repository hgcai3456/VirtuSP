# Public RDS loader for applying sql/ from this machine.
# The cloud stack (private RDS, ECS Fargate, ALB, EFS) is infra/aws.
# Both stacks default the RDS identifier to "virtusp", so apply only one of them in an account.

data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

data "aws_rds_engine_version" "postgres" {
  engine  = "postgres"
  version = var.engine_version == "" ? "16" : var.engine_version
  latest  = var.engine_version == ""
}

data "http" "my_ip" {
  count = var.publicly_accessible && length(var.allowed_cidrs) == 0 ? 1 : 0
  url   = "https://checkip.amazonaws.com"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
  allowed_cidrs = length(var.allowed_cidrs) > 0 ? var.allowed_cidrs : (
    var.publicly_accessible ? ["${chomp(data.http.my_ip[0].response_body)}/32"] : []
  )
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = var.name
  }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = var.name
  }
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(aws_vpc.this.cidr_block, 8, count.index)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.name}-public-${count.index + 1}"
  }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(aws_vpc.this.cidr_block, 8, count.index + 10)
  availability_zone = local.azs[count.index]

  tags = {
    Name = "${var.name}-private-${count.index + 1}"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = {
    Name = "${var.name}-public"
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "${var.name}-private"
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_security_group" "rds" {
  name_prefix = "${var.name}-rds-"
  description = "PostgreSQL for VirtuSP"
  vpc_id      = aws_vpc.this.id

  egress {
    description = "Replies inside the VPC"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [aws_vpc.this.cidr_block]
  }

  tags = {
    Name = "${var.name}-rds"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "cidrs" {
  count = var.publicly_accessible ? length(local.allowed_cidrs) : 0

  security_group_id = aws_security_group.rds.id
  description       = "PostgreSQL from an approved network"
  ip_protocol       = "tcp"
  from_port         = 5432
  to_port           = 5432
  cidr_ipv4         = local.allowed_cidrs[count.index]
}

resource "aws_vpc_security_group_ingress_rule" "clients" {
  count = length(var.client_security_group_ids)

  security_group_id            = aws_security_group.rds.id
  description                  = "PostgreSQL from the application"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = var.client_security_group_ids[count.index]
}

resource "aws_db_subnet_group" "this" {
  name_prefix = "${var.name}-"
  subnet_ids  = var.publicly_accessible ? aws_subnet.public[*].id : aws_subnet.private[*].id

  tags = {
    Name = var.name
  }
}

resource "aws_db_parameter_group" "this" {
  name_prefix = "${var.name}-pg16-"
  family      = "postgres16"
  description = "VirtuSP PostgreSQL settings"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "this" {
  identifier     = var.name
  engine         = "postgres"
  engine_version = data.aws_rds_engine_version.postgres.version
  instance_class = var.instance_class

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username

  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.this.name
  parameter_group_name   = aws_db_parameter_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = var.publicly_accessible
  multi_az               = var.multi_az

  backup_retention_period    = var.backup_retention_period
  backup_window              = "03:00-04:00"
  maintenance_window         = "sun:04:30-sun:05:30"
  copy_tags_to_snapshot      = true
  skip_final_snapshot        = var.skip_final_snapshot
  final_snapshot_identifier  = var.skip_final_snapshot ? null : "${var.name}-final"
  deletion_protection        = var.deletion_protection
  apply_immediately          = false
  auto_minor_version_upgrade = true

  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"]
  ca_cert_identifier                    = "rds-ca-rsa2048-g1"

  tags = {
    Name = var.name
  }

  lifecycle {
    precondition {
      condition     = var.environment != "production" || var.publicly_accessible == false
      error_message = "Production RDS must not be publicly accessible."
    }

    precondition {
      condition     = var.publicly_accessible == false || length(local.allowed_cidrs) > 0
      error_message = "Set allowed_cidrs before giving the database a public address."
    }

    precondition {
      condition     = var.environment != "production" || var.deletion_protection
      error_message = "Production RDS must keep deletion protection on."
    }

    precondition {
      condition     = var.environment != "production" || var.skip_final_snapshot == false
      error_message = "Production RDS must take a final snapshot before deletion."
    }
  }
}

resource "null_resource" "sql" {
  count = var.load_sql ? 1 : 0

  depends_on = [
    aws_vpc_security_group_ingress_rule.cidrs,
    aws_route_table_association.public
  ]

  triggers = {
    schema = filesha256("${path.module}/sql/001_schema.sql")
    seed   = filesha256("${path.module}/sql/002_seed.sql")
    host   = aws_db_instance.this.address
    secret = aws_db_instance.this.master_user_secret[0].secret_arn
  }

  provisioner "local-exec" {
    working_dir = path.module
    command     = "npm ci --omit=dev && node load-sql.js"
    environment = {
      PGHOST     = aws_db_instance.this.address
      PGPORT     = aws_db_instance.this.port
      PGUSER     = var.db_username
      PGDATABASE = var.db_name
      SECRET_ID  = aws_db_instance.this.master_user_secret[0].secret_arn
      AWS_REGION = var.aws_region
    }
  }
}
