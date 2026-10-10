resource "aws_efs_file_system" "data" {
  encrypted        = true
  throughput_mode  = "bursting"
  performance_mode = "generalPurpose"

  tags = {
    Name = var.name
  }
}

resource "aws_efs_backup_policy" "data" {
  count = var.efs_backup ? 1 : 0

  file_system_id = aws_efs_file_system.data.id

  backup_policy {
    status = "ENABLED"
  }
}

resource "aws_efs_access_point" "data" {
  file_system_id = aws_efs_file_system.data.id

  posix_user {
    uid = 1000
    gid = 1000
  }

  root_directory {
    path = "/virtusp"

    creation_info {
      owner_uid   = 1000
      owner_gid   = 1000
      permissions = "0755"
    }
  }

  tags = {
    Name = var.name
  }
}

resource "aws_efs_mount_target" "data" {
  count = 2

  file_system_id  = aws_efs_file_system.data.id
  subnet_id       = aws_subnet.public[count.index].id
  security_groups = [aws_security_group.efs.id]
}
