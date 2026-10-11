# CloudWatch dashboards for the VirtuSP namespace. Widgets read metrics that
# the application emits. An empty graph means those points have not arrived.

locals {
  obs_search = {
    api_success = "SUM(SEARCH('{VirtuSP,Environment,Service,Operation,Outcome} MetricName=\"ApiEligible\" Environment=\"production\" Outcome=\"success\"', 'Sum', 60))"
    api_failure = "SUM(SEARCH('{VirtuSP,Environment,Service,Operation,Outcome} MetricName=\"ApiEligible\" Environment=\"production\" Outcome=\"failure\"', 'Sum', 60))"
    turns       = "SUM(SEARCH('{VirtuSP,Environment,Service,Operation,Outcome} MetricName=\"TurnEligible\" Environment=\"production\" Outcome=\"success\"', 'Sum', 60))"
    fallback    = "SUM(SEARCH('{VirtuSP,Environment,Service,Operation,Outcome} MetricName=\"FallbackUsed\" Environment=\"production\" Outcome=\"fallback\"', 'Sum', 60))"
    blocked     = "SUM(SEARCH('{VirtuSP,Environment,Service,Operation,Outcome} MetricName=\"ValidationOutcome\" Environment=\"production\" Outcome=\"blocked_before_delivery\"', 'Sum', 60))"
    confirmed   = "SUM(SEARCH('{VirtuSP,Environment,Service,Operation,Outcome} MetricName=\"ValidationOutcome\" Environment=\"production\" Outcome=\"confirmed_unsupported_delivered\"', 'Sum', 60))"
    heartbeat   = "SUM(SEARCH('{VirtuSP,Environment,Service} MetricName=\"TelemetryHeartbeat\" Environment=\"production\"', 'Sum', 60))"
    dropped     = "SUM(SEARCH('{VirtuSP,Environment,Service,Operation,Outcome} MetricName=\"TelemetryDropped\" Environment=\"production\"', 'Sum', 60))"
    tokens      = "SUM(SEARCH('{VirtuSP,Environment,Service,Provider,ModelAlias} MetricName=\"TokenInput\" Environment=\"production\"', 'Sum', 60))"
    cost        = "SUM(SEARCH('{VirtuSP,Environment,Service,Provider,ModelAlias} MetricName=\"EstimatedModelCostMicroUsd\" Environment=\"production\"', 'Sum', 60))"
  }
}

resource "aws_cloudwatch_dashboard" "service" {
  dashboard_name = "${var.name}-service"
  dashboard_body = jsonencode({
    widgets = [
      {
        type       = "text", x = 0, y = 0, width = 24, height = 2
        properties = { markdown = "## Service overview\nEligible API success, latency, heartbeat, and the load balancer. Empty panels are missing telemetry, not a healthy service." }
      },
      {
        type = "metric", x = 0, y = 2, width = 12, height = 6
        properties = {
          title  = "Eligible API calls"
          region = var.aws_region
          view   = "timeSeries"
          metrics = [
            [{ expression = local.obs_search.api_success, id = "s", label = "Success" }],
            [{ expression = local.obs_search.api_failure, id = "f", label = "Failure" }]
          ]
        }
      },
      {
        type = "metric", x = 12, y = 2, width = 12, height = 6
        properties = {
          title  = "Eligible API latency p95"
          region = var.aws_region
          view   = "timeSeries"
          metrics = [
            [{ expression = "SEARCH('{VirtuSP,Environment,Service,Operation} MetricName=\"ApiLatency\" Environment=\"production\"', 'p95', 60)", id = "p", label = "p95" }]
          ]
        }
      },
      {
        type = "metric", x = 0, y = 8, width = 8, height = 6
        properties = {
          title   = "Telemetry heartbeat"
          region  = var.aws_region
          view    = "timeSeries"
          metrics = [[{ expression = local.obs_search.heartbeat, id = "h", label = "Heartbeat" }]]
        }
      },
      {
        type = "metric", x = 8, y = 8, width = 8, height = 6
        properties = {
          title  = "Load balancer healthy targets"
          region = var.aws_region
          view   = "timeSeries"
          metrics = [
            ["AWS/ApplicationELB", "HealthyHostCount", "TargetGroup", aws_lb_target_group.app.arn_suffix, "LoadBalancer", aws_lb.this.arn_suffix]
          ]
        }
      },
      {
        type = "metric", x = 16, y = 8, width = 8, height = 6
        properties = {
          title  = "ECS CPU"
          region = var.aws_region
          view   = "timeSeries"
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.this.name, "ServiceName", aws_ecs_service.app.name]
          ]
        }
      }
    ]
  })
}

resource "aws_cloudwatch_dashboard" "encounters" {
  dashboard_name = "${var.name}-encounters"
  dashboard_body = jsonencode({
    widgets = [
      {
        type       = "text", x = 0, y = 0, width = 24, height = 2
        properties = { markdown = "## Encounter operations\nStarts, completed turns, latency, persistence failures, and queued conflicts." }
      },
      {
        type = "metric", x = 0, y = 2, width = 12, height = 6
        properties = {
          title   = "Eligible turns delivered"
          region  = var.aws_region
          metrics = [[{ expression = local.obs_search.turns, id = "t", label = "Approved replies" }]]
        }
      },
      {
        type = "metric", x = 12, y = 2, width = 12, height = 6
        properties = {
          title  = "Approved response latency p95"
          region = var.aws_region
          metrics = [
            ["VirtuSP", "ApprovedResponseLatency", "Environment", "production", "Service", "virtusp", "Operation", "encounter.deliver_response", { stat = "p95" }]
          ]
        }
      },
      {
        type = "metric", x = 0, y = 8, width = 12, height = 6
        properties = {
          title  = "Persistence failures"
          region = var.aws_region
          metrics = [
            ["VirtuSP", "PersistenceFailure", "Environment", "production", "Service", "virtusp", "Operation", "dependency.sqlite.save", "Outcome", "persistence_failed"]
          ]
        }
      },
      {
        type = "metric", x = 12, y = 8, width = 12, height = 6
        properties = {
          title  = "Queued encounter actions"
          region = var.aws_region
          metrics = [
            ["VirtuSP", "EncounterConflict", "Environment", "production", "Service", "virtusp", "Operation", "encounter.load_state", "Outcome", "queued"]
          ]
        }
      }
    ]
  })
}

resource "aws_cloudwatch_dashboard" "ai" {
  dashboard_name = "${var.name}-ai"
  dashboard_body = jsonencode({
    widgets = [
      {
        type       = "text", x = 0, y = 0, width = 24, height = 2
        properties = { markdown = "## AI and dependencies\nProvider attempts, fallbacks, and reported token usage. Missing token points mean the provider did not report usage." }
      },
      {
        type = "metric", x = 0, y = 2, width = 12, height = 6
        properties = {
          title   = "Fallbacks"
          region  = var.aws_region
          metrics = [[{ expression = local.obs_search.fallback, id = "fb", label = "Fallback" }]]
        }
      },
      {
        type = "metric", x = 12, y = 2, width = 12, height = 6
        properties = {
          title  = "Bedrock attempt latency p95"
          region = var.aws_region
          metrics = [
            [{ expression = "SEARCH('{VirtuSP,Environment,Service,Operation,Provider} MetricName=\"ProviderLatency\" Provider=\"bedrock\"', 'p95', 60)", id = "pl", label = "p95" }]
          ]
        }
      },
      {
        type = "metric", x = 0, y = 8, width = 12, height = 6
        properties = {
          title   = "Reported input tokens"
          region  = var.aws_region
          metrics = [[{ expression = local.obs_search.tokens, id = "tk", label = "Input tokens" }]]
        }
      }
    ]
  })
}

resource "aws_cloudwatch_dashboard" "safety" {
  dashboard_name = "${var.name}-safety"
  dashboard_body = jsonencode({
    widgets = [
      {
        type       = "text", x = 0, y = 0, width = 24, height = 2
        properties = { markdown = "## Safety and assessment\nBlocked replies are not successful disclosures. Confirmed unsupported delivery is a separate counter and stays empty until that event is recorded." }
      },
      {
        type = "metric", x = 0, y = 2, width = 12, height = 6
        properties = {
          title   = "Blocked before delivery"
          region  = var.aws_region
          metrics = [[{ expression = local.obs_search.blocked, id = "b", label = "Blocked" }]]
        }
      },
      {
        type = "metric", x = 12, y = 2, width = 12, height = 6
        properties = {
          title   = "Confirmed unsupported delivery"
          region  = var.aws_region
          metrics = [[{ expression = local.obs_search.confirmed, id = "c", label = "Confirmed" }]]
        }
      },
      {
        type = "metric", x = 0, y = 8, width = 12, height = 6
        properties = {
          title  = "Feedback latency p95"
          region = var.aws_region
          metrics = [
            ["VirtuSP", "FeedbackLatency", "Environment", "production", "Service", "virtusp", "Operation", "feedback.generate", { stat = "p95" }]
          ]
        }
      }
    ]
  })
}

resource "aws_cloudwatch_dashboard" "infrastructure" {
  dashboard_name = "${var.name}-infrastructure"
  dashboard_body = jsonencode({
    widgets = [
      {
        type       = "text", x = 0, y = 0, width = 24, height = 2
        properties = { markdown = "## Infrastructure and telemetry\nOnly resources in this stack: ECS, the load balancer, EFS, RDS, and in-process telemetry drops." }
      },
      {
        type = "metric", x = 0, y = 2, width = 8, height = 6
        properties = {
          title  = "ECS memory"
          region = var.aws_region
          metrics = [
            ["AWS/ECS", "MemoryUtilization", "ClusterName", aws_ecs_cluster.this.name, "ServiceName", aws_ecs_service.app.name]
          ]
        }
      },
      {
        type = "metric", x = 8, y = 2, width = 8, height = 6
        properties = {
          title  = "Target 5xx"
          region = var.aws_region
          metrics = [
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", aws_lb.this.arn_suffix]
          ]
        }
      },
      {
        type = "metric", x = 16, y = 2, width = 8, height = 6
        properties = {
          title   = "Dropped telemetry"
          region  = var.aws_region
          metrics = [[{ expression = local.obs_search.dropped, id = "d", label = "Dropped" }]]
        }
      },
      {
        type = "metric", x = 0, y = 8, width = 12, height = 6
        properties = {
          title  = "EFS percent IO limit"
          region = var.aws_region
          metrics = [
            ["AWS/EFS", "PercentIOLimit", "FileSystemId", aws_efs_file_system.data.id]
          ]
        }
      },
      {
        type = "metric", x = 12, y = 8, width = 12, height = 6
        properties = {
          title  = "RDS CPU"
          region = var.aws_region
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.this.identifier]
          ]
        }
      }
    ]
  })
}

resource "aws_cloudwatch_dashboard" "cost" {
  dashboard_name = "${var.name}-cost"
  dashboard_body = jsonencode({
    widgets = concat(
      [
        {
          type       = "text", x = 0, y = 0, width = 24, height = 3
          properties = { markdown = "## Cost and capacity\nEstimated model cost is emitted only when usage and a pricing row both exist. A missing point is unknown, not zero. A budget alarm is not a spending cap. See docs/OBSERVABILITY.md for the assumptions." }
        },
        {
          type = "metric", x = 0, y = 3, width = 12, height = 6
          properties = {
            title   = "Estimated model cost (micro-USD)"
            region  = var.aws_region
            metrics = [[{ expression = local.obs_search.cost, id = "c", label = "Estimated micro-USD" }]]
          }
        },
        {
          type = "metric", x = 12, y = 3, width = 12, height = 6
          properties = {
            title   = "Telemetry heartbeat as a freshness check"
            region  = var.aws_region
            metrics = [[{ expression = local.obs_search.heartbeat, id = "h", label = "Heartbeat" }]]
          }
        }
      ],
      [for widget in local.aws_cost_widgets : merge(widget, { y = widget.y + 9 })]
    )
  })
}
