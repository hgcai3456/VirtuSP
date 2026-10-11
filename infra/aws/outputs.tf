output "url" {
  description = "Public HTTPS address. CloudFront when no load-balancer certificate is set."
  value = coalesce(
    one([for domain in aws_cloudfront_distribution.app[*].domain_name : "https://${domain}"]),
    "https://${aws_lb.this.dns_name}"
  )
}

output "alb_dns_name" {
  description = "Load balancer hostname. Point a DNS name here when you attach a certificate."
  value       = aws_lb.this.dns_name
}

output "ecr_repository_url" {
  description = "Push the VirtuSP image here."
  value       = aws_ecr_repository.app.repository_url
}

output "image_tag" {
  description = "Image tag the task definitions pull."
  value       = var.image_tag
}

output "cpu_architecture" {
  description = "Fargate architecture. The deploy script builds the matching image."
  value       = var.cpu_architecture
}

output "aws_region" {
  description = "Region of this stack."
  value       = var.aws_region
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.app.name
}

output "migrate_task_definition_arn" {
  description = "One-off task that applies infra/rds/sql to PostgreSQL."
  value       = aws_ecs_task_definition.migrate.arn
}

output "public_subnet_ids" {
  description = "Comma-separated public subnet ids for a one-off task."
  value       = join(",", aws_subnet.public[*].id)
}

output "ecs_security_group_id" {
  description = "Security group used by app and schema tasks."
  value       = aws_security_group.ecs.id
}

output "log_group_name" {
  description = "CloudWatch log group for the app and the schema task."
  value       = aws_cloudwatch_log_group.app.name
}

output "rds_address" {
  description = "Private PostgreSQL hostname."
  value       = aws_db_instance.this.address
}

output "rds_port" {
  description = "PostgreSQL port."
  value       = aws_db_instance.this.port
}

output "rds_secret_arn" {
  description = "Secrets Manager ARN for the generated database password."
  value       = local.db_secret_arn
}

output "reports_bucket" {
  description = "Private bucket that stores the patient PDF reports."
  value       = aws_s3_bucket.reports.id
}

output "reports_object_count" {
  description = "Number of PDFs uploaded from data/reports."
  value       = length(local.report_pdfs)
}

output "autoscaling_min_capacity" {
  description = "Minimum Fargate task count."
  value       = aws_appautoscaling_target.ecs.min_capacity
}

output "autoscaling_max_capacity" {
  description = "Maximum Fargate task count."
  value       = aws_appautoscaling_target.ecs.max_capacity
}

output "autoscaling_policies" {
  description = "CPU and memory target-tracking policies on the ECS service."
  value       = [aws_appautoscaling_policy.cpu.name, aws_appautoscaling_policy.memory.name]
}

output "dashboard_name" {
  description = "CloudWatch dashboard for the running stack."
  value       = aws_cloudwatch_dashboard.app.dashboard_name
}

output "dashboard_url" {
  description = "Console link for the CloudWatch dashboard."
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.app.dashboard_name}"
}

output "cpu_alarm_name" {
  description = "Alarm raised when average ECS CPU stays above the autoscaling target."
  value       = aws_cloudwatch_metric_alarm.cpu.alarm_name
}

output "observability_dashboards" {
  description = "CloudWatch dashboards for application telemetry."
  value = [
    aws_cloudwatch_dashboard.service.dashboard_name,
    aws_cloudwatch_dashboard.encounters.dashboard_name,
    aws_cloudwatch_dashboard.ai.dashboard_name,
    aws_cloudwatch_dashboard.safety.dashboard_name,
    aws_cloudwatch_dashboard.infrastructure.dashboard_name,
    aws_cloudwatch_dashboard.cost.dashboard_name,
  ]
}

output "memory_alarm_name" {
  description = "Alarm raised when average ECS memory stays above the autoscaling target."
  value       = aws_cloudwatch_metric_alarm.memory.alarm_name
}
