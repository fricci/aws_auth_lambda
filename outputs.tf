# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

output "lambda_arn" {
  description = "Deployment invoke url"
  value       = aws_apigatewayv2_stage.lambda.invoke_url
}

output "publish_test_url" {
  description = "Deployment invoke url"
  value       = "${aws_apigatewayv2_stage.lambda.invoke_url}/lambda_test"
}
