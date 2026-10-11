# The default load balancer name is under amazonaws.com, so ACM cannot issue
# a publicly trusted certificate for it. CloudFront's default certificate is
# trusted for *.cloudfront.net. That HTTPS origin is what lets the browser
# offer camera and microphone permission.

resource "random_password" "edge" {
  count = var.certificate_arn == "" ? 1 : 0

  length  = 32
  special = false
}

resource "aws_cloudfront_response_headers_policy" "app" {
  count = var.certificate_arn == "" ? 1 : 0

  name    = "${var.name}-security-headers"
  comment = "HTTPS security headers and camera and microphone permission for VirtuSP"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = false
      preload                    = false
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "SAMEORIGIN"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      override = true
      value    = "camera=(self), microphone=(self)"
    }
  }
}

resource "aws_cloudfront_distribution" "app" {
  count = var.certificate_arn == "" ? 1 : 0

  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.name} HTTPS"
  price_class     = "PriceClass_100"
  http_version    = "http2"

  origin {
    domain_name = aws_lb.this.dns_name
    origin_id   = "alb"

    custom_header {
      name  = "X-VirtuSP-Edge"
      value = random_password.edge[0].result
    }

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "http-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 60
    }
  }

  default_cache_behavior {
    target_origin_id           = "alb"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    origin_request_policy_id   = "216adef6-5c7f-47e4-b989-5492eafa07d3"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.app[0].id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    # The default *.cloudfront.net certificate only accepts this policy name.
    # Browsers still negotiate TLS 1.2 or 1.3. Raising the floor needs an ACM
    # certificate on a domain you control.
    minimum_protocol_version = "TLSv1"
  }
}
