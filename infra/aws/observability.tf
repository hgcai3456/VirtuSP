# Application observability. Domain metrics are extracted from Embedded Metric
# Format lines in the application log group. This file does not add a metric
# filter for those names, and the task does not call PutMetricData for them.
# The optional sidecar publishes only AWS/ApplicationSignals metrics.

locals {
  observability_alarm_actions = var.observability_alarm_email == "" ? [] : aws_sns_topic.observability[*].arn
  cloudwatch_agent_container = {
    name      = "cloudwatch-agent"
    image     = var.cloudwatch_agent_image
    essential = false
    environment = [
      {
        name  = "CW_CONFIG_CONTENT"
        value = file("${path.module}/cloudwatch-agent.json")
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
        awslogs-stream-prefix = "cloudwatch-agent"
      }
    }
  }
}

resource "aws_cloudwatch_log_group" "telemetry_findings" {
  name              = "/ecs/${var.name}/telemetry-findings"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_data_protection_policy" "app" {
  log_group_name = aws_cloudwatch_log_group.app.name
  policy_document = jsonencode({
    Name        = "virtusp-telemetry-redaction"
    Description = "Second-layer mask. Application allowlisting remains the primary control."
    Version     = "2021-06-01"
    Statement = [
      {
        Sid = "Audit"
        DataIdentifier = [
          "arn:aws:dataprotection::aws:data-identifier/EmailAddress",
          "arn:aws:dataprotection::aws:data-identifier/AwsSecretKey"
        ]
        Operation = {
          Audit = {
            FindingsDestination = {
              CloudWatchLogs = {
                LogGroup = aws_cloudwatch_log_group.telemetry_findings.name
              }
            }
          }
        }
      },
      {
        Sid = "Redact"
        DataIdentifier = [
          "arn:aws:dataprotection::aws:data-identifier/EmailAddress",
          "arn:aws:dataprotection::aws:data-identifier/AwsSecretKey"
        ]
        Operation = {
          Deidentify = {
            MaskConfig = {}
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "task_application_signals" {
  count = var.enable_application_signals ? 1 : 0
  name  = "${var.name}-application-signals"
  role  = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "XRayPut"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets"
        ]
        # These X-Ray APIs do not support resource-level permissions.
        Resource = "*"
      },
      {
        Sid      = "ApplicationSignalsOnly"
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricData"]
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = "AWS/ApplicationSignals"
          }
        }
      },
      {
        Sid    = "AgentLogStream"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "${aws_cloudwatch_log_group.app.arn}:*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "task_observability_read" {
  count = var.observability_aws_read ? 1 : 0
  name  = "${var.name}-observability-read"
  role  = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadThisLogGroup"
        Effect = "Allow"
        Action = [
          "logs:StartQuery",
          "logs:FilterLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = [
          aws_cloudwatch_log_group.app.arn,
          "${aws_cloudwatch_log_group.app.arn}:*"
        ]
      },
      {
        Sid    = "QueryResults"
        Effect = "Allow"
        # GetQueryResults is authorized by query id, not by log group.
        Action   = ["logs:GetQueryResults"]
        Resource = "*"
      },
      {
        Sid    = "ReadMetricsAndAlarms"
        Effect = "Allow"
        # GetMetricData and DescribeAlarms do not support resource ARNs.
        Action = [
          "cloudwatch:GetMetricData",
          "cloudwatch:ListMetrics",
          "cloudwatch:DescribeAlarms"
        ]
        Resource = "*"
      },
      {
        Sid    = "ReadTraces"
        Effect = "Allow"
        # X-Ray read APIs do not support resource-level permissions.
        Action = [
          "xray:GetTraceSummaries",
          "xray:BatchGetTraces"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_cloudwatch_query_definition" "turn" {
  name = "${var.name}/encounter-turn"

  log_group_names = [aws_cloudwatch_log_group.app.name]

  query_string = <<-EOT
fields @timestamp, event_name, operation, outcome, duration_ms, request_id, trace_id, encounter_correlation_id, validation_outcome, error_code, provider, model_alias
| filter schema = "virtusp.telemetry.v1"
| filter operation like /encounter/
| sort @timestamp desc
| limit 100
EOT
}

resource "aws_cloudwatch_query_definition" "provider" {
  name            = "${var.name}/provider-attempts"
  log_group_names = [aws_cloudwatch_log_group.app.name]
  query_string    = <<-EOT
fields @timestamp, operation, outcome, duration_ms, provider, model_alias, execution_mode, retry_count, token_input, token_output, estimated_cost_usd, cost_basis, finish_reason, error_code
| filter event_name = "provider.attempt"
| sort @timestamp desc
| limit 100
EOT
}

resource "aws_cloudwatch_query_definition" "safety" {
  name            = "${var.name}/safety-validation"
  log_group_names = [aws_cloudwatch_log_group.app.name]
  query_string    = <<-EOT
fields @timestamp, operation, outcome, validation_outcome, error_code, request_id, trace_id, encounter_correlation_id
| filter event_name = "encounter.turn" or event_name = "feedback"
| sort @timestamp desc
| limit 100
EOT
}

resource "aws_sns_topic" "observability" {
  count = var.observability_alarms_enabled && var.observability_alarm_email != "" ? 1 : 0
  name  = "${var.name}-observability"
}

resource "aws_sns_topic_subscription" "observability" {
  count     = var.observability_alarms_enabled && var.observability_alarm_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.observability[0].arn
  protocol  = "email"
  endpoint  = var.observability_alarm_email
}

resource "aws_cloudwatch_metric_alarm" "api_burn_fast" {
  count               = var.observability_alarms_enabled ? 1 : 0
  alarm_name          = "${var.name}-api-burn-fast"
  alarm_description   = "Eligible API error rate exceeded 7.2% for 5 minutes with at least 20 calls (14.4x burn on a 99.5% objective). Runbook: docs/runbooks/observability.md#api-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0.072
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.observability_alarm_actions
  ok_actions          = local.observability_alarm_actions

  metric_query {
    id          = "s"
    expression  = "SUM(SEARCH('{VirtuSP,Environment,Service,Operation,Outcome} MetricName=\"ApiEligible\" Environment=\"production\" Outcome=\"success\"', 'Sum', 300))"
    return_data = false
  }

  metric_query {
    id          = "f"
    expression  = "SUM(SEARCH('{VirtuSP,Environment,Service,Operation,Outcome} MetricName=\"ApiEligible\" Environment=\"production\" Outcome=\"failure\"', 'Sum', 300))"
    return_data = false
  }

  metric_query {
    id          = "rate"
    expression  = "IF(s+f<20,0,f/(s+f))"
    label       = "Eligible error rate"
    return_data = true
  }
}

resource "aws_cloudwatch_metric_alarm" "api_burn_slow" {
  count               = var.observability_alarms_enabled ? 1 : 0
  alarm_name          = "${var.name}-api-burn-slow"
  alarm_description   = "Eligible API error rate exceeded 7.2% for 1 hour with at least 20 calls. Runbook: docs/runbooks/observability.md#api-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0.072
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.observability_alarm_actions
  ok_actions          = local.observability_alarm_actions

  metric_query {
    id          = "s"
    expression  = "SUM(SEARCH('{VirtuSP,Environment,Service,Operation,Outcome} MetricName=\"ApiEligible\" Environment=\"production\" Outcome=\"success\"', 'Sum', 3600))"
    return_data = false
  }

  metric_query {
    id          = "f"
    expression  = "SUM(SEARCH('{VirtuSP,Environment,Service,Operation,Outcome} MetricName=\"ApiEligible\" Environment=\"production\" Outcome=\"failure\"', 'Sum', 3600))"
    return_data = false
  }

  metric_query {
    id          = "rate"
    expression  = "IF(s+f<20,0,f/(s+f))"
    label       = "Eligible error rate"
    return_data = true
  }
}

resource "aws_cloudwatch_composite_alarm" "api_burn" {
  count             = var.observability_alarms_enabled ? 1 : 0
  alarm_name        = "${var.name}-api-burn"
  alarm_description = "Pages only when the 5-minute and 1-hour API burn rates are both elevated. Runbook: docs/runbooks/observability.md#api-errors"
  alarm_rule        = "ALARM(${aws_cloudwatch_metric_alarm.api_burn_fast[0].alarm_name}) AND ALARM(${aws_cloudwatch_metric_alarm.api_burn_slow[0].alarm_name})"
  alarm_actions     = local.observability_alarm_actions
  ok_actions        = local.observability_alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "turn_latency" {
  count               = var.observability_alarms_enabled ? 1 : 0
  alarm_name          = "${var.name}-turn-latency"
  alarm_description   = "p95 time to an approved student-visible reply stayed above 5 seconds. Runbook: docs/runbooks/observability.md#latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "ApprovedResponseLatency"
  namespace           = "VirtuSP"
  period              = 300
  extended_statistic  = "p95"
  threshold           = 5000
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.observability_alarm_actions
  ok_actions          = local.observability_alarm_actions

  dimensions = {
    Environment = "production"
    Service     = "virtusp"
    Operation   = "encounter.deliver_response"
  }
}

resource "aws_cloudwatch_metric_alarm" "persistence" {
  count               = var.observability_alarms_enabled ? 1 : 0
  alarm_name          = "${var.name}-persistence"
  alarm_description   = "A required encounter record failed to save. Runbook: docs/runbooks/observability.md#persistence"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "PersistenceFailure"
  namespace           = "VirtuSP"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.observability_alarm_actions
  ok_actions          = local.observability_alarm_actions

  dimensions = {
    Environment = "production"
    Service     = "virtusp"
    Operation   = "dependency.sqlite.save"
    Outcome     = "persistence_failed"
  }
}

resource "aws_cloudwatch_metric_alarm" "unauthorized_delivery" {
  count               = var.observability_alarms_enabled ? 1 : 0
  alarm_name          = "${var.name}-unauthorized-delivery"
  alarm_description   = "Confirmed unsupported content was delivered. Blocked attempts do not increment this alarm. Runbook: docs/runbooks/observability.md#unauthorized-delivery"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ValidationOutcome"
  namespace           = "VirtuSP"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.observability_alarm_actions
  ok_actions          = local.observability_alarm_actions

  dimensions = {
    Environment = "production"
    Service     = "virtusp"
    Operation   = "encounter.validate_response"
    Outcome     = "confirmed_unsupported_delivered"
  }
}

resource "aws_cloudwatch_metric_alarm" "audit" {
  count               = var.observability_alarms_enabled ? 1 : 0
  alarm_name          = "${var.name}-audit"
  alarm_description   = "A required audit record could not be stored. Runbook: docs/runbooks/observability.md#audit"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "AuditFailure"
  namespace           = "VirtuSP"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.observability_alarm_actions
  ok_actions          = local.observability_alarm_actions

  dimensions = {
    Environment = "production"
    Service     = "virtusp"
    Operation   = "encounter.receive_turn"
    Outcome     = "audit_failed"
  }
}

resource "aws_cloudwatch_metric_alarm" "heartbeat" {
  count               = var.observability_alarms_enabled ? 1 : 0
  alarm_name          = "${var.name}-telemetry-heartbeat"
  alarm_description   = "No telemetry heartbeat for 10 minutes. Missing telemetry is not a healthy service. Runbook: docs/runbooks/observability.md#telemetry"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "TelemetryHeartbeat"
  namespace           = "VirtuSP"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = local.observability_alarm_actions
  ok_actions          = local.observability_alarm_actions

  dimensions = {
    Environment = "production"
    Service     = "virtusp"
  }
}

resource "aws_cloudwatch_metric_alarm" "export" {
  count               = var.observability_alarms_enabled ? 1 : 0
  alarm_name          = "${var.name}-telemetry-export"
  alarm_description   = "The process dropped telemetry or an export failed. Runbook: docs/runbooks/observability.md#telemetry"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "TelemetryDropped"
  namespace           = "VirtuSP"
  period              = 300
  statistic           = "Sum"
  threshold           = 50
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.observability_alarm_actions
  ok_actions          = local.observability_alarm_actions

  dimensions = {
    Environment = "production"
    Service     = "virtusp"
    Operation   = "telemetry.export"
    Outcome     = "error"
  }
}

resource "aws_cloudwatch_metric_alarm" "fallback" {
  count               = var.observability_alarms_enabled ? 1 : 0
  alarm_name          = "${var.name}-fallback"
  alarm_description   = "Approved fallback replaced model selection more than 20 times in 5 minutes. Runbook: docs/runbooks/observability.md#provider"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FallbackUsed"
  namespace           = "VirtuSP"
  period              = 300
  statistic           = "Sum"
  threshold           = 20
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.observability_alarm_actions
  ok_actions          = local.observability_alarm_actions

  dimensions = {
    Environment = "production"
    Service     = "virtusp"
    Operation   = "encounter.select_safe_fallback"
    Outcome     = "fallback"
  }
}

resource "aws_cloudwatch_metric_alarm" "provider_throttle" {
  count               = var.observability_alarms_enabled ? 1 : 0
  alarm_name          = "${var.name}-provider-throttle"
  alarm_description   = "Bedrock attempts were throttled. Runbook: docs/runbooks/observability.md#provider"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ProviderAttempt"
  namespace           = "VirtuSP"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.observability_alarm_actions
  ok_actions          = local.observability_alarm_actions

  dimensions = {
    Environment   = "production"
    Service       = "virtusp"
    Operation     = "dependency.bedrock.converse"
    Outcome       = "throttled"
    Provider      = "bedrock"
    ModelAlias    = var.bedrock_model_id
    ExecutionMode = "live"
  }
}

resource "aws_s3_bucket" "synthetics" {
  count  = var.enable_synthetics ? 1 : 0
  bucket = "${var.name}-synthetics-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "synthetics" {
  count                   = var.enable_synthetics ? 1 : 0
  bucket                  = aws_s3_bucket.synthetics[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "synthetics" {
  count  = var.enable_synthetics ? 1 : 0
  bucket = aws_s3_bucket.synthetics[0].id
  rule {
    id     = "expire-canary-artifacts"
    status = "Enabled"
    filter {}
    expiration { days = 14 }
  }
}

data "aws_iam_policy_document" "synthetics_assume" {
  count = var.enable_synthetics ? 1 : 0
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "synthetics" {
  count              = var.enable_synthetics ? 1 : 0
  name               = "${var.name}-synthetics"
  assume_role_policy = data.aws_iam_policy_document.synthetics_assume[0].json
}

resource "aws_iam_role_policy" "synthetics" {
  count = var.enable_synthetics ? 1 : 0
  name  = "${var.name}-synthetics"
  role  = aws_iam_role.synthetics[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Artifacts"
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:GetBucketLocation", "s3:ListBucket"]
        Resource = [
          aws_s3_bucket.synthetics[0].arn,
          "${aws_s3_bucket.synthetics[0].arn}/*"
        ]
      },
      {
        Sid    = "CanaryLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/cwsyn-${var.name}-ready*"
      },
      {
        Sid      = "CanaryMetrics"
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricData"]
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = "CloudWatchSynthetics"
          }
        }
      }
    ]
  })
}

resource "aws_s3_object" "canary" {
  count  = var.enable_synthetics ? 1 : 0
  bucket = aws_s3_bucket.synthetics[0].id
  key    = "canary/api-ready.zip"
  source = data.archive_file.synthetics[0].output_path
  etag   = data.archive_file.synthetics[0].output_md5
}

data "archive_file" "synthetics" {
  count       = var.enable_synthetics ? 1 : 0
  type        = "zip"
  source_file = "${path.module}/synthetics/api-ready.js"
  output_path = "${path.module}/synthetics/api-ready.zip"
}

resource "aws_synthetics_canary" "ready" {
  count                = var.enable_synthetics ? 1 : 0
  name                 = substr("${var.name}-ready", 0, 21)
  artifact_s3_location = "s3://${aws_s3_bucket.synthetics[0].bucket}/canary"
  execution_role_arn   = aws_iam_role.synthetics[0].arn
  runtime_version      = "syn-nodejs-puppeteer-11.0"
  handler              = "api-ready.handler"
  s3_bucket            = aws_s3_bucket.synthetics[0].bucket
  s3_key               = aws_s3_object.canary[0].key
  start_canary         = false

  schedule {
    expression = "rate(5 minutes)"
  }

  run_config {
    timeout_in_seconds = 30
    environment_variables = {
      HEALTH_HOSTNAME = var.synthetics_health_hostname
    }
  }

  depends_on = [aws_s3_bucket_public_access_block.synthetics]
}

resource "aws_cloudwatch_metric_alarm" "synthetic" {
  count               = var.enable_synthetics && var.observability_alarms_enabled ? 1 : 0
  alarm_name          = "${var.name}-synthetic-ready"
  alarm_description   = "The external readiness canary failed. Runbook: docs/runbooks/observability.md#synthetic"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "SuccessPercent"
  namespace           = "CloudWatchSynthetics"
  period              = 300
  statistic           = "Average"
  threshold           = 100
  treat_missing_data  = "breaching"
  alarm_actions       = local.observability_alarm_actions
  ok_actions          = local.observability_alarm_actions

  dimensions = {
    CanaryName = aws_synthetics_canary.ready[0].name
  }
}

resource "aws_budgets_budget" "monthly" {
  count        = var.monthly_budget_usd > 0 && var.observability_alarm_email != "" ? 1 : 0
  name         = "${var.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.observability_alarm_email == "" ? [] : [var.observability_alarm_email]
  }
}
