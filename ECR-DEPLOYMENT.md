# AWS ECR Deployment Guide

## Overview
Build the Docker image locally, push to AWS ECR, then pull and run on EC2 without needing source code on the server.

## Prerequisites
- AWS CLI installed and configured locally
- Docker Desktop running on Windows
- AWS account with ECR access
- EC2 instance with Docker installed

## Step 1: Update Configuration Files

### 1.1 Update `.env.production`
Replace `your-ec2-ip-or-domain.com` with your actual EC2 IP/domain:
```
VITE_API_BASE_URL=http://3.108.45.123:8088/api/delivery
VITE_OAUTH_REDIRECT_URI=http://3.108.45.123/dashboard
VITE_OAUTH_LOGOUT_REDIRECT=http://3.108.45.123/track
```

### 1.2 Update `push-to-ecr.ps1`
Edit the script and set:
```powershell
$AWS_ACCOUNT_ID = "123456789012"  # Your AWS account ID
$AWS_REGION = "ap-south-1"        # Your AWS region
```

## Step 2: Build and Push to ECR (Local Machine)

### Option A: Using Bash
```bash
# Navigate to project directory
cd C:\Users\hanuman\Documents\Hanuman\tracking-hub

# Run the push script
.\push-to-ecr.sh
```

### Option B: Manual Commands (PowerShell)
```powershell
# Set variables
$AWS_ACCOUNT_ID = "your-account-id"
$AWS_REGION = "ap-south-1"
$ECR_REPO = "tracking-hub-frontend"

# Create ECR repository
aws ecr create-repository --repository-name $ECR_REPO --region $AWS_REGION

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

# Build image
docker build -t ${ECR_REPO}:latest .

# Tag for ECR
docker tag ${ECR_REPO}:latest "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/${ECR_REPO}:latest"

# Push to ECR
docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/${ECR_REPO}:latest"
```

## Step 3: Deploy on EC2

### 3.1 Copy docker-compose.yml to EC2
```powershell
# From local machine
scp -i your-key.pem docker-compose.yml ec2-user@your-ec2-ip:/home/ec2-user/
```

### 3.2 SSH to EC2 and Deploy
```bash
# SSH to EC2
ssh -i your-key.pem ec2-user@your-ec2-ip

# Set environment variables
export AWS_ACCOUNT_ID=your-account-id
export AWS_REGION=ap-south-1

# Login to ECR from EC2
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Pull and run the container
docker-compose pull
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f frontend
```

## Step 4: Configure EC2 IAM Role (Important!)

Your EC2 instance needs permission to pull from ECR:

### Option A: Attach IAM Role (Recommended)
1. Go to EC2 Console → Instances
2. Select your instance → Actions → Security → Modify IAM role
3. Create/attach a role with this policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage"
      ],
      "Resource": "*"
    }
  ]
}
```

### Option B: Use AWS Credentials
If you can't use IAM role, configure AWS CLI on EC2:
```bash
aws configure
# Enter: Access Key ID, Secret Access Key, Region
```

## Step 5: Verify Deployment

```bash
# Check if container is running
docker ps

# Check logs
docker logs tracking-hub-frontend

# Test health endpoint
curl http://localhost/health

# Access from browser
http://your-ec2-ip/
```

## Updating the Application

When you make changes to your frontend:

### On Local Machine:
```powershell
# 1. Update code
# 2. Rebuild and push
.\push-to-ecr.ps1
```

### On EC2:
```bash
# Pull latest image
docker-compose pull

# Restart container
docker-compose up -d

# Or force recreate
docker-compose up -d --force-recreate frontend
```

## Troubleshooting

### ECR Login Fails
```bash
# Check AWS credentials
aws sts get-caller-identity

# Verify region
echo $AWS_REGION
```

### Image Pull Fails on EC2
```bash
# Check IAM role/permissions
aws ecr describe-repositories --region ap-south-1

# Manual pull test
docker pull $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/tracking-hub-frontend:latest
```

### Container Won't Start
```bash
# Check logs
docker logs tracking-hub-frontend

# Check if port is available
sudo netstat -tlnp | grep :80
```

### Environment Variables Not Working
- Remember: Vite bakes env vars at **build time**
- Update `.env.production` locally
- Rebuild and push: `.\push-to-ecr.ps1`
- Pull on EC2: `docker-compose pull && docker-compose up -d`

## Benefits of ECR Approach

✅ No source code on EC2 (more secure)  
✅ Faster deployments (just pull image)  
✅ Version control with image tags  
✅ Can deploy to multiple EC2 instances easily  
✅ Smaller EC2 disk usage  

## Security Notes

1. **Don't commit** `.env.production` with real secrets to Git
2. Use **IAM roles** instead of AWS credentials when possible
3. Consider using **AWS Secrets Manager** for sensitive values
4. Enable **ECR image scanning** for vulnerabilities
5. Use **specific image tags** instead of `:latest` in production

## Cost Considerations

- ECR storage: ~$0.10/GB per month
- ECR data transfer: Free within same region
- Typical image size: ~50MB
- Monthly cost: < $0.01 for this use case
