# Cost Explorer is queried from us-east-1 inside the function. This account's
# service control policy denies cost-allocation tag changes, so the function
# falls back to the stack's service names when the Project tag is not active.

locals {
  aws_cost_namespace = "VirtuSP/AwsCost"
  aws_cost_period_metrics = [
    [local.aws_cost_namespace, "CostUsd", "Project", var.name, "Period", "Hour", { label = "Hour" }],
    [local.aws_cost_namespace, "CostUsd", "Project", var.name, "Period", "Day", { label = "Day" }],
    [local.aws_cost_namespace, "CostUsd", "Project", var.name, "Period", "Week", { label = "Week" }],
    [local.aws_cost_namespace, "CostUsd", "Project", var.name, "Period", "Month", { label = "Month" }],
    [local.aws_cost_namespace, "CostUsd", "Project", var.name, "Period", "Year", { label = "Year" }],
  ]
  # Placed near the top of a dashboard by adding to y. The block is 20 rows tall.
  aws_cost_widgets = [
    {
      type   = "text"
      x      = 0
      y      = 0
      width  = 24
      height = 4
      properties = {
        markdown = "## AWS running cost\nUnblended Cost Explorer charges, in USD. **Hour** is the latest complete UTC hour. **Day** is the latest complete UTC day. **Week** is the last seven complete UTC days. **Month** and **year** are calendar to date and include today. The numbers and bars are the latest sample. The line is each hour. This account cannot activate cost-allocation tags, so the sample is this stack's services plus Fargate, db.t4g.micro, and public IPv4 usage. Other EC2 instances and other databases are not included. If hourly data is off, the hour is that day divided by 24. Cost Explorer can lag. This is account billing, not a model price estimate."
      }
    },
    {
      type   = "metric"
      x      = 0
      y      = 4
      width  = 24
      height = 4
      properties = {
        title                = "AWS running cost (USD)"
        region               = var.aws_region
        view                 = "singleValue"
        stat                 = "Average"
        period               = 900
        setPeriodToTimeRange = true
        start                = "-PT15M"
        end                  = "-PT0M"
        metrics              = local.aws_cost_period_metrics
      }
    },
    {
      type   = "metric"
      x      = 0
      y      = 8
      width  = 24
      height = 6
      properties = {
        title                = "AWS running cost by period"
        region               = var.aws_region
        view                 = "bar"
        stacked              = false
        stat                 = "Average"
        period               = 900
        setPeriodToTimeRange = true
        start                = "-PT15M"
        end                  = "-PT0M"
        yAxis = {
          left = { min = 0, label = "USD", showUnits = false }
        }
        legend  = { position = "bottom" }
        metrics = local.aws_cost_period_metrics
      }
    },
    {
      type   = "metric"
      x      = 0
      y      = 14
      width  = 24
      height = 6
      properties = {
        title  = "Hourly AWS cost (USD)"
        region = var.aws_region
        view   = "timeSeries"
        stat   = "Average"
        period = 3600
        start  = "-P7D"
        end    = "-PT0M"
        yAxis = {
          left = { min = 0, label = "USD", showUnits = false }
        }
        metrics = [
          [local.aws_cost_namespace, "HourlyCostUsd", "Project", var.name, { label = "Hour" }]
        ]
      }
    }
  ]
}

data "archive_file" "aws_cost" {
  type        = "zip"
  source_dir  = "${path.module}/cost"
  output_path = "${path.module}/cost/publish.zip"
  excludes    = ["publish.zip"]
}

resource "aws_cloudwatch_log_group" "aws_cost" {
  name              = "/aws/lambda/${var.name}-aws-cost"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "aws_cost_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "aws_cost" {
  name               = "${var.name}-aws-cost"
  assume_role_policy = data.aws_iam_policy_document.aws_cost_assume.json
}

resource "aws_iam_role_policy_attachment" "aws_cost_logs" {
  role       = aws_iam_role.aws_cost.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "aws_cost" {
  name = "${var.name}-aws-cost"
  role = aws_iam_role.aws_cost.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ce:GetCostAndUsage", "ce:GetDimensionValues", "ce:ListCostAllocationTags"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricData"]
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = local.aws_cost_namespace
          }
        }
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:PutParameter"]
        Resource = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.name}/aws-cost"
      }
    ]
  })
}

resource "aws_lambda_function" "aws_cost" {
  function_name    = "${var.name}-aws-cost"
  role             = aws_iam_role.aws_cost.arn
  runtime          = "nodejs20.x"
  handler          = "publish.handler"
  timeout          = 90
  memory_size      = 256
  filename         = data.archive_file.aws_cost.output_path
  source_code_hash = data.archive_file.aws_cost.output_base64sha256

  environment {
    variables = {
      PROJECT_TAG      = var.name
      ACCOUNT_ID       = data.aws_caller_identity.current.account_id
      METRIC_NAMESPACE = local.aws_cost_namespace
      PARAMETER_NAME   = "/${var.name}/aws-cost"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.aws_cost,
    aws_iam_role_policy.aws_cost,
    aws_iam_role_policy_attachment.aws_cost_logs,
  ]
}

resource "aws_cloudwatch_event_rule" "aws_cost" {
  name                = "${var.name}-aws-cost"
  description         = "Refresh VirtuSP AWS cost samples every five minutes. Cost Explorer is queried about once an hour."
  schedule_expression = "rate(5 minutes)"
}

resource "aws_cloudwatch_event_target" "aws_cost" {
  rule      = aws_cloudwatch_event_rule.aws_cost.name
  target_id = "aws-cost"
  arn       = aws_lambda_function.aws_cost.arn
}

resource "aws_lambda_permission" "aws_cost" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.aws_cost.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.aws_cost.arn
}
