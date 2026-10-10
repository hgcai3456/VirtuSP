resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.name}"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "this" {
  name = var.name

  setting {
    name  = "containerInsights"
    value = var.container_insights ? "enabled" : "disabled"
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  volume {
    name = "data"

    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.data.id
      transit_encryption = "ENABLED"

      authorization_config {
        access_point_id = aws_efs_access_point.data.id
        iam             = "DISABLED"
      }
    }
  }

  container_definitions = jsonencode([
    {
      name      = local.container_name
      image     = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
      essential = true
      command   = ["sh", "-c", local.shared_sqlite_boot]
      user      = "1000:1000"
      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "PORT", value = tostring(var.container_port) },
        { name = "NODE_ENV", value = "production" },
        { name = "HOME", value = "/tmp" },
        { name = "HOST", value = "0.0.0.0" },
        { name = "VIRTUSP_SHARDS", value = "1" },
        { name = "VIRTUSP_DB", value = "/app/data/virtusp.sqlite" },
        { name = "VIRTUSP_SQLITE_JOURNAL", value = "DELETE" },
        { name = "VIRTUSP_SQLITE_EXCLUSIVE", value = "0" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "AI_ENABLED", value = "true" },
        { name = "BEDROCK_MODEL_ID", value = var.bedrock_model_id },
        { name = "PGHOST", value = aws_db_instance.this.address },
        { name = "PGPORT", value = tostring(aws_db_instance.this.port) },
        { name = "PGDATABASE", value = var.db_name },
        { name = "PROFILE_ARCHIVE", value = "true" },
        { name = "PROFILE_S3_BUCKET", value = aws_s3_bucket.reports.id }
      ]
      secrets = [
        { name = "PGUSER", valueFrom = "${local.db_secret_arn}:username::" },
        { name = "PGPASSWORD", valueFrom = "${local.db_secret_arn}:password::" }
      ]
      mountPoints = [
        {
          sourceVolume  = "data"
          containerPath = "/app/data"
          readOnly      = false
        }
      ]
      linuxParameters = {
        initProcessEnabled = true
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "app"
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", local.health_check]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 20
      }
    }
  ])
}

resource "aws_ecs_task_definition" "migrate" {
  family                   = "${var.name}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "migrate"
      image     = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
      essential = true
      user      = "1000:1000"
      command   = ["node", "infra/rds/load-sql.js"]
      environment = [
        { name = "HOME", value = "/tmp" },
        { name = "PGHOST", value = aws_db_instance.this.address },
        { name = "PGPORT", value = tostring(aws_db_instance.this.port) },
        { name = "PGDATABASE", value = var.db_name }
      ]
      secrets = [
        { name = "PGUSER", valueFrom = "${local.db_secret_arn}:username::" },
        { name = "PGPASSWORD", valueFrom = "${local.db_secret_arn}:password::" }
      ]
      linuxParameters = {
        initProcessEnabled = true
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "migrate"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "app" {
  name                               = var.name
  cluster                            = aws_ecs_cluster.this.id
  task_definition                    = aws_ecs_task_definition.app.arn
  desired_count                      = var.autoscaling_min_capacity
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  enable_execute_command             = true
  health_check_grace_period_seconds  = 60
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100
  propagate_tags                     = "SERVICE"

  # Replace the running task before starting the next revision. Two revisions
  # must not open the EFS database during a rollout.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # The two public subnets are in different Availability Zones. Fargate
  # spreads these tasks across both, so the minimum of four containers is
  # two per zone. Availability Zone rebalancing stays off: AWS requires
  # maximumPercent above 100, and a rollout must not open the shared EFS
  # database from two task revisions at once.
  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = local.container_name
    container_port   = var.container_port
  }

  depends_on = [
    aws_lb_listener.http_forward,
    aws_lb_listener.http_redirect,
    aws_lb_listener.https,
    aws_efs_mount_target.data
  ]

  # Application Auto Scaling changes the running count. Terraform must not
  # reset it on the next apply.
  lifecycle {
    ignore_changes = [desired_count]
  }
}
