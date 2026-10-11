locals {
  container_name = "virtusp"
  azs            = slice(data.aws_availability_zones.available.names, 0, 2)
  db_secret_arn  = aws_db_instance.this.master_user_secret[0].secret_arn
  # Liveness only. /api/ready is the load balancer check; a shared EFS lock must
  # not fail this probe and replace every task.
  health_check   = "node -e 'require(\"http\").get(\"http://127.0.0.1:${var.container_port}/api/live\",function(r){process.exit(r.statusCode===200?0:1)}).on(\"error\",function(){process.exit(1)})'"
  # The published image takes an exclusive lock. This boot hook skips that lock
  # when VIRTUSP_SQLITE_EXCLUSIVE=0 so more than one task can open the EFS file.
  # A rebuilt image already honors the variable and this hook leaves it unchanged.
  shared_sqlite_boot = replace(<<-EOT
exec node <<'JS'
const Module = require('module');
const fs = require('fs');
const ext = Module._extensions['.js'];
Module._extensions['.js'] = function (module, filename) {
  if (filename.endsWith('/db.js')) {
    let src = fs.readFileSync(filename, 'utf8');
    const needle = "db.exec('PRAGMA locking_mode = EXCLUSIVE');";
    if (src.includes(needle) && !src.includes('function sqliteExclusive')) {
      src = src.replace(needle, "if (process.env.VIRTUSP_SQLITE_EXCLUSIVE !== '0') " + needle);
    }
    module._compile(src, filename);
    return;
  }
  return ext(module, filename);
};
Module._load('/app/server.js', null, true);
JS
EOT
  , "\r", "")
}
