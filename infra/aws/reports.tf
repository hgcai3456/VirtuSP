# Private store for the patient PDFs in data/reports.
# That directory is gitignored, so a checkout without it plans an empty upload.

locals {
  reports_dir = "${path.module}/../../data/reports"
  report_pdfs = toset(try(fileset(local.reports_dir, "*.pdf"), []))
}

resource "aws_s3_bucket" "reports" {
  bucket        = "${var.name}-reports-${data.aws_caller_identity.current.account_id}"
  force_destroy = !var.deletion_protection
}

resource "aws_s3_bucket_public_access_block" "reports" {
  bucket = aws_s3_bucket.reports.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "reports" {
  bucket = aws_s3_bucket.reports.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "reports" {
  bucket = aws_s3_bucket.reports.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_policy" "reports" {
  bucket = aws_s3_bucket.reports.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.reports.arn,
          "${aws_s3_bucket.reports.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.reports]
}

resource "aws_s3_object" "report" {
  for_each = local.report_pdfs

  bucket       = aws_s3_bucket.reports.id
  key          = each.value
  source       = "${local.reports_dir}/${each.value}"
  etag         = filemd5("${local.reports_dir}/${each.value}")
  content_type = "application/pdf"

  depends_on = [
    aws_s3_bucket_public_access_block.reports,
    aws_s3_bucket_server_side_encryption_configuration.reports,
    aws_s3_bucket_policy.reports
  ]
}

resource "aws_iam_role_policy" "task_reports" {
  name = "${var.name}-reports"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.reports.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.reports.arn}/*"
      }
    ]
  })
}
