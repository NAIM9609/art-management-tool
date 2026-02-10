output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = [aws_subnet.public_1.id, aws_subnet.public_2.id]
}

output "backend_security_group_id" {
  description = "ID of the backend security group"
  value       = aws_security_group.backend.id
}

output "frontend_security_group_id" {
  description = "ID of the frontend security group"
  value       = aws_security_group.frontend.id
}

output "table_name" {
  description = "Name of the DynamoDB table"
  value       = aws_dynamodb_table.art_management.name
}

output "table_arn" {
  description = "ARN of the DynamoDB table"
  value       = aws_dynamodb_table.art_management.arn
}

output "gsi1_name" {
  description = "Name of GSI1"
  value       = local.gsi1_name
}

output "gsi2_name" {
  description = "Name of GSI2"
  value       = local.gsi2_name
}

output "gsi3_name" {
  description = "Name of GSI3"
  value       = local.gsi3_name
}
