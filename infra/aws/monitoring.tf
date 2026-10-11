# Scale-out starts when either average stays above its target for a minute.
# These alarms use the same metrics and the same thresholds, and they wait
# for three consecutive minutes so one sample is not a breach.

resource "aws_sns_topic" "alarms" {
  count = var.alarm_email == "" ? 0 : 1

  name = "${var.name}-alarms"
}

data "aws_iam_policy_document" "alarms" {
  count = var.alarm_email == "" ? 0 : 1

  statement {
    sid = "Owner"

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    actions = [
      "SNS:GetTopicAttributes",
      "SNS:SetTopicAttributes",
      "SNS:AddPermission",
      "SNS:RemovePermission",
      "SNS:DeleteTopic",
      "SNS:Subscribe",
      "SNS:ListSubscriptionsByTopic",
      "SNS:Publish",
      "SNS:Receive"
    ]

    resources = [aws_sns_topic.alarms[0].arn]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceOwner"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid = "CloudWatch"

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.alarms[0].arn]

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cloudwatch:${var.aws_region}:${data.aws_caller_identity.current.account_id}:alarm:${var.name}-ecs-*"]
    }
  }
}

resource "aws_sns_topic_policy" "alarms" {
  count = var.alarm_email == "" ? 0 : 1

  arn    = aws_sns_topic.alarms[0].arn
  policy = data.aws_iam_policy_document.alarms[0].json
}

resource "aws_sns_topic_subscription" "alarms" {
  count = var.alarm_email == "" ? 0 : 1

  topic_arn = aws_sns_topic.alarms[0].arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_metric_alarm" "cpu" {
  alarm_name          = "${var.name}-ecs-cpu"
  alarm_description   = "Average ECS CPU stayed above ${var.autoscaling_cpu_target}% for 3 minutes. The service scales out at this same target."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = var.autoscaling_cpu_target
  treat_missing_data  = "notBreaching"
  alarm_actions       = aws_sns_topic.alarms[*].arn
  ok_actions          = aws_sns_topic.alarms[*].arn

  dimensions = {
    ClusterName = aws_ecs_cluster.this.name
    ServiceName = aws_ecs_service.app.name
  }
}

resource "aws_cloudwatch_metric_alarm" "memory" {
  alarm_name          = "${var.name}-ecs-memory"
  alarm_description   = "Average ECS memory stayed above ${var.autoscaling_memory_target}% for 3 minutes. The service scales out at this same target."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = var.autoscaling_memory_target
  treat_missing_data  = "notBreaching"
  alarm_actions       = aws_sns_topic.alarms[*].arn
  ok_actions          = aws_sns_topic.alarms[*].arn

  dimensions = {
    ClusterName = aws_ecs_cluster.this.name
    ServiceName = aws_ecs_service.app.name
  }
}

resource "aws_cloudwatch_dashboard" "app" {
  dashboard_name = var.name
  dashboard_body = jsonencode({
    start          = "-PT3H"
    periodOverride = "inherit"
    widgets = concat(
      [
        {
          type   = "text"
          x      = 0
          y      = 0
          width  = 24
          height = 3
          properties = {
            markdown = "## VirtuSP\nAverage ECS CPU above **${var.autoscaling_cpu_target}%** or memory above **${var.autoscaling_memory_target}%** for three minutes raises an alarm. Application Auto Scaling uses those same targets and can run ${var.autoscaling_min_capacity} to ${var.autoscaling_max_capacity} tasks."
          }
        },
        {
          type   = "alarm"
          x      = 0
          y      = 3
          width  = 24
          height = 4
          properties = {
            title = "CPU and memory alarms"
            alarms = [
              aws_cloudwatch_metric_alarm.cpu.arn,
              aws_cloudwatch_metric_alarm.memory.arn
            ]
          }
        },
        {
          type   = "metric"
          x      = 0
          y      = 7
          width  = 12
          height = 6
          properties = {
            title  = "ECS average CPU"
            region = var.aws_region
            period = 60
            stat   = "Average"
            view   = "timeSeries"
            yAxis = {
              left = { min = 0, max = 100 }
            }
            annotations = {
              horizontal = [
                {
                  label = "${var.autoscaling_cpu_target}% target"
                  value = var.autoscaling_cpu_target
                  color = "#d13212"
                }
              ]
            }
            metrics = [
              ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.this.name, "ServiceName", aws_ecs_service.app.name]
            ]
          }
        },
        {
          type   = "metric"
          x      = 12
          y      = 7
          width  = 12
          height = 6
          properties = {
            title  = "ECS average memory"
            region = var.aws_region
            period = 60
            stat   = "Average"
            view   = "timeSeries"
            yAxis = {
              left = { min = 0, max = 100 }
            }
            annotations = {
              horizontal = [
                {
                  label = "${var.autoscaling_memory_target}% target"
                  value = var.autoscaling_memory_target
                  color = "#d13212"
                }
              ]
            }
            metrics = [
              ["AWS/ECS", "MemoryUtilization", "ClusterName", aws_ecs_cluster.this.name, "ServiceName", aws_ecs_service.app.name]
            ]
          }
        },
        {
          type   = "metric"
          x      = 0
          y      = 13
          width  = 8
          height = 6
          properties = {
            title  = "Load balancer targets"
            region = var.aws_region
            period = 60
            stat   = "Average"
            view   = "timeSeries"
            metrics = [
              ["AWS/ApplicationELB", "HealthyHostCount", "TargetGroup", aws_lb_target_group.app.arn_suffix, "LoadBalancer", aws_lb.this.arn_suffix, { label = "Healthy" }],
              ["AWS/ApplicationELB", "UnHealthyHostCount", "TargetGroup", aws_lb_target_group.app.arn_suffix, "LoadBalancer", aws_lb.this.arn_suffix, { label = "Unhealthy" }]
            ]
          }
        },
        {
          type   = "metric"
          x      = 8
          y      = 13
          width  = 8
          height = 6
          properties = {
            title  = "Load balancer requests"
            region = var.aws_region
            period = 60
            stat   = "Sum"
            view   = "timeSeries"
            metrics = [
              ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.this.arn_suffix]
            ]
          }
        },
        {
          type   = "metric"
          x      = 16
          y      = 13
          width  = 8
          height = 6
          properties = {
            title  = "Target response time"
            region = var.aws_region
            period = 60
            stat   = "Average"
            view   = "timeSeries"
            metrics = [
              ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.this.arn_suffix]
            ]
          }
        },
        {
          type   = "metric"
          x      = 0
          y      = 19
          width  = 24
          height = 6
          properties = {
            title  = "Load balancer 5xx"
            region = var.aws_region
            period = 60
            stat   = "Sum"
            view   = "timeSeries"
            metrics = [
              ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", aws_lb.this.arn_suffix, { label = "Target 5xx" }],
              ["AWS/ApplicationELB", "HTTPCode_ELB_5XX_Count", "LoadBalancer", aws_lb.this.arn_suffix, { label = "Load balancer 5xx" }]
            ]
          }
        },
        {
          type   = "metric"
          x      = 0
          y      = 25
          width  = 6
          height = 6
          properties = {
            title  = "RDS CPU"
            region = var.aws_region
            period = 60
            stat   = "Average"
            view   = "timeSeries"
            yAxis = {
              left = { min = 0, max = 100 }
            }
            metrics = [
              ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.this.identifier]
            ]
          }
        },
        {
          type   = "metric"
          x      = 6
          y      = 25
          width  = 6
          height = 6
          properties = {
            title  = "RDS freeable memory (bytes)"
            region = var.aws_region
            period = 60
            stat   = "Average"
            view   = "timeSeries"
            metrics = [
              ["AWS/RDS", "FreeableMemory", "DBInstanceIdentifier", aws_db_instance.this.identifier]
            ]
          }
        },
        {
          type   = "metric"
          x      = 12
          y      = 25
          width  = 6
          height = 6
          properties = {
            title  = "RDS connections"
            region = var.aws_region
            period = 60
            stat   = "Average"
            view   = "timeSeries"
            metrics = [
              ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", aws_db_instance.this.identifier]
            ]
          }
        },
        {
          type   = "metric"
          x      = 18
          y      = 25
          width  = 6
          height = 6
          properties = {
            title  = "RDS free storage (bytes)"
            region = var.aws_region
            period = 60
            stat   = "Average"
            view   = "timeSeries"
            metrics = [
              ["AWS/RDS", "FreeStorageSpace", "DBInstanceIdentifier", aws_db_instance.this.identifier]
            ]
          }
        },
        {
          type   = "metric"
          x      = 0
          y      = 31
          width  = 8
          height = 6
          properties = {
            title  = "EFS IO limit"
            region = var.aws_region
            period = 60
            stat   = "Average"
            view   = "timeSeries"
            yAxis = {
              left = { min = 0, max = 100 }
            }
            metrics = [
              ["AWS/EFS", "PercentIOLimit", "FileSystemId", aws_efs_file_system.data.id]
            ]
          }
        },
        {
          type   = "metric"
          x      = 8
          y      = 31
          width  = 8
          height = 6
          properties = {
            title  = "EFS burst credits (bytes)"
            region = var.aws_region
            period = 60
            stat   = "Average"
            view   = "timeSeries"
            metrics = [
              ["AWS/EFS", "BurstCreditBalance", "FileSystemId", aws_efs_file_system.data.id]
            ]
          }
        },
        {
          type   = "metric"
          x      = 16
          y      = 31
          width  = 8
          height = 6
          properties = {
            title  = "EFS client connections"
            region = var.aws_region
            period = 60
            stat   = "Average"
            view   = "timeSeries"
            metrics = [
              ["AWS/EFS", "ClientConnections", "FileSystemId", aws_efs_file_system.data.id]
            ]
          }
        }
      ],
      var.certificate_arn == "" ? [
        {
          type   = "metric"
          x      = 0
          y      = 37
          width  = 12
          height = 6
          properties = {
            title  = "CloudFront requests"
            region = "us-east-1"
            period = 60
            stat   = "Sum"
            view   = "timeSeries"
            metrics = [
              ["AWS/CloudFront", "Requests", "DistributionId", one(aws_cloudfront_distribution.app[*].id), "Region", "Global"]
            ]
          }
        },
        {
          type   = "metric"
          x      = 12
          y      = 37
          width  = 12
          height = 6
          properties = {
            title  = "CloudFront 5xx error rate"
            region = "us-east-1"
            period = 60
            stat   = "Average"
            view   = "timeSeries"
            metrics = [
              ["AWS/CloudFront", "5xxErrorRate", "DistributionId", one(aws_cloudfront_distribution.app[*].id), "Region", "Global"]
            ]
          }
        }
      ] : [],
      [
        {
          type   = "log"
          x      = 0
          y      = var.certificate_arn == "" ? 43 : 37
          width  = 24
          height = 6
          properties = {
            title  = "Recent task logs"
            region = var.aws_region
            view   = "table"
            query  = "SOURCE '${aws_cloudwatch_log_group.app.name}' | fields @timestamp, @message | sort @timestamp desc | limit 30"
          }
        }
      ]
    )
  })
}
