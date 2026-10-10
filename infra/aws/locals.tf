locals {
  container_name = "virtusp"
  azs            = slice(data.aws_availability_zones.available.names, 0, 2)
  db_secret_arn  = aws_db_instance.this.master_user_secret[0].secret_arn
  health_check   = "node -e 'require(\"http\").get(\"http://127.0.0.1:${var.container_port}/\",function(r){process.exit(r.statusCode===200?0:1)}).on(\"error\",function(){process.exit(1)})'"
}
