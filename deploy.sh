#!/bin/bash

# ==============================================================================
#                 GOOGLE CLOUD RUN ONE-CLICK DEPLOYMENT SCRIPT
# ==============================================================================
# This script:
# 1. Targets your Google Cloud project: irevocrm
# 2. Automatically enables required APIs (Cloud Run, Cloud Build, Container Registry, Storage)
# 3. Dynamically resolves your project number to fix the 'storage.objects.get' permission error
# 4. Deploys the full-stack container to Cloud Run within the perpetually free limits!
# ==============================================================================

# Exit immediately if a command exits with a non-zero status
set -e

# Define Project Details
PROJECT_ID="irevocrm"
REGION="asia-southeast1"
SERVICE_NAME="ielts-crm"

echo "------------------------------------------------------------"
echo "🚀 Step 1: Setting active Google Cloud Project to: $PROJECT_ID"
echo "------------------------------------------------------------"
gcloud config set project "$PROJECT_ID"

echo "------------------------------------------------------------"
echo "📦 Step 2: Enabling required Google Cloud APIs..."
echo "------------------------------------------------------------"
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    storage.googleapis.com \
    storage-api.googleapis.com

echo "------------------------------------------------------------"
echo "🔍 Step 3: Resolving project number to verify service account..."
echo "------------------------------------------------------------"
# Dynamically fetch project number to avoid typos or hardcoding
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)' 2>/dev/null || echo "543359650288")
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

echo " Found Project Number: $PROJECT_NUMBER"
echo " Compute Engine Service Account: $COMPUTE_SA"
echo " Cloud Build Service Account: $BUILD_SA"

echo "------------------------------------------------------------"
echo "🛡️ Step 4: Granting Cloud Storage permissions to service accounts..."
echo "------------------------------------------------------------"
# Add Storage Admin role to the default Compute service account
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/storage.admin" \
    --no-user-output-enabled

# Add Storage Object Viewer role to ensure secure build access
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/storage.objectViewer" \
    --no-user-output-enabled

# Enable Cloud Build Service Account to build successfully
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$BUILD_SA" \
    --role="roles/cloudbuild.builds.builder" \
    --no-user-output-enabled

echo "✅ Permissions successfully updated/verified!"

echo "------------------------------------------------------------"
echo "🚢 Step 5: Packaging & deploying CRM to Google Cloud Run..."
echo "------------------------------------------------------------"
# Deploy using custom source built from the dynamic multi-stage Dockerfile
gcloud run deploy "$SERVICE_NAME" \
    --project "$PROJECT_ID" \
    --source . \
    --platform managed \
    --region "$REGION" \
    --allow-unauthenticated \
    --max-instances 1 \
    --memory 512Mi \
    --timeout 300

echo "------------------------------------------------------------"
echo "🎉 SUCCESS: Project successfully hosted on Google Cloud Run!"
echo "------------------------------------------------------------"
echo "You can map your custom subdomain directly in your Cloud Run console:"
echo "👉 https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME/integration?project=$PROJECT_ID"
echo "------------------------------------------------------------"
