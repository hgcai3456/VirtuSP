resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "Public HTTP and HTTPS entry for VirtuSP"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "${var.name}-alb"
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  for_each = toset(var.alb_ingress_cidrs)

  security_group_id = aws_security_group.alb.id
  description       = "HTTP"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = each.value
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  for_each = var.certificate_arn == "" ? toset([]) : toset(var.alb_ingress_cidrs)

  security_group_id = aws_security_group.alb.id
  description       = "HTTPS"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = each.value
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  description       = "App tasks and health checks"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "ecs" {
  name        = "${var.name}-ecs"
  description = "VirtuSP tasks. Inbound traffic comes from the load balancer."
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "${var.name}-ecs"
  }
}

resource "aws_vpc_security_group_ingress_rule" "ecs_alb" {
  security_group_id            = aws_security_group.ecs.id
  description                  = "App port from the load balancer"
  ip_protocol                  = "tcp"
  from_port                    = var.container_port
  to_port                      = var.container_port
  referenced_security_group_id = aws_security_group.alb.id
}

resource "aws_vpc_security_group_egress_rule" "ecs_all" {
  security_group_id = aws_security_group.ecs.id
  description       = "ECR, EFS, RDS, and outbound HTTPS"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "efs" {
  name        = "${var.name}-efs"
  description = "NFS for the VirtuSP data volume"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "${var.name}-efs"
  }
}

resource "aws_vpc_security_group_ingress_rule" "efs_ecs" {
  security_group_id            = aws_security_group.efs.id
  description                  = "NFS from app tasks"
  ip_protocol                  = "tcp"
  from_port                    = 2049
  to_port                      = 2049
  referenced_security_group_id = aws_security_group.ecs.id
}

resource "aws_security_group" "rds" {
  name        = "${var.name}-rds"
  description = "PostgreSQL from VirtuSP tasks"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "${var.name}-rds"
  }
}

resource "aws_vpc_security_group_ingress_rule" "rds_ecs" {
  security_group_id            = aws_security_group.rds.id
  description                  = "PostgreSQL from app and schema tasks"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.ecs.id
}
