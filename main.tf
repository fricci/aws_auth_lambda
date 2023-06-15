# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

terraform {
  required_version = ">= 0.13.1"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 2.0"
    }
  }
}

provider "aws" {
  region = "eu-central-1" # eg. us-east-1
  #access_key                  = "fake"
  #secret_key                  = "fake"
  #skip_credentials_validation = true
  #skip_metadata_api_check     = true
  #skip_requesting_account_id  = true

  #endpoints {
  #  dynamodb = "http://localhost:4566"
  #  lambda   = "http://localhost:4566"
  #  kinesis  = "http://localhost:4566"
  #}
}

data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "dist"
  output_path = "${local.building_path}/${local.lambda_code_filename}"
}

resource "aws_lambda_function" "dept_selling_api_gateway_authorizer" {

  filename      = "${local.building_path}/${local.lambda_code_filename}"
  handler       = "api-gateway-authorizer.handler"
  runtime       = "nodejs18.x"
  function_name = "dept_selling_api_gateway_authorizer"
  role          = aws_iam_role.iam_for_lambda.arn
  timeout       = 30

  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  depends_on = [
    null_resource.build_lambda_function
  ]

}

resource "null_resource" "sam_metadata_aws_lambda_function_dept_selling_api_gateway_authorizer" {
  triggers = {
    resource_name        = "aws_lambda_function.dept_selling_api_gateway_authorizer"
    resource_type        = "ZIP_LAMBDA_FUNCTION"
    original_source_code = "${local.lambda_src_path}"
    built_output_path    = "${local.building_path}/${local.lambda_code_filename}"
  }
  depends_on = [
    null_resource.build_lambda_function
  ]
}

resource "null_resource" "build_lambda_function" {
  triggers = {
    build_number = "${timestamp()}" # TODO: calculate hash of lambda function. Mo will have a look at this part
  }

  provisioner "local-exec" {
    command = "npm run build-prod"
  }
}

resource "aws_iam_role" "iam_for_lambda" {
  name = "iam_for_lambda"

  managed_policy_arns = ["arn:aws:iam::aws:policy/service-role/DeptSellingApiGatewayAuthorizerExecutorRole"]

  assume_role_policy = <<EOF
    {
    "Version": "2012-10-17",
    "Statement": [
        {
        "Action": "sts:AssumeRole",
        "Principal": {
            "Service": "lambda.amazonaws.com"
        },
        "Effect": "Allow",
        "Sid": ""
        }
    ]
    }
    EOF



}
