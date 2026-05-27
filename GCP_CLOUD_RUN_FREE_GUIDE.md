# Google Cloud Run Deployment & Free Tier Guide

This guide details how to resolve the Cloud Storage permission error (`403 storage.objects.get denied`), host your full-stack React + Express CRM on **Google Cloud Run** entirely for **$0 / month** using Google Cloud's generous Free Tier, and configure your custom subdomain.

---

## 1. Google Cloud Perpetual Free Tier Limits

Google Cloud Run offers a perpetual, highly generous Free Tier every single month. Your project will remain completely free of charge as long as your monthly usage stays within these boundaries:

*   **First 2,000,000 (2 Million) Requests:** 100% Free
*   **vCPU Allocation:** First 360,000 vCPU-seconds 100% Free
*   **Memory Allocation:** First 180,000 GiB-seconds 100% Free
*   **Egress Network Traffic:** First 100 GB of outgoing traffic (within North America) 100% Free

Because your IELTS CRM application responds instantly and consumes minimal resources, typical day-to-day operations will easily fall **far below** these limits, resulting in a **$0.00** monthly bill.

---

## 2. Resolving the `gcloud.run.deploy` Permission Error

The error message you received:
```text
permission 'storage.objects.get' denied on resource... (or it may not exist)., forbidden
```
This occurs because Cloud Build uses the default **Compute Engine Service Account** to fetch build assets from Google Cloud Storage, but the service account does not currently have permissions to read objects from the staging storage bucket.

### How to Fix It:
Run the following commands in your local machine's terminal (or Google Cloud Shell) where you are authenticated with `gcloud` to restore permissions:

```bash
# Replace [YOUR_PROJECT_ID] with your actual Google Cloud Project ID

# 1. Grant the Storage Admin role to the default Compute Engine service account
gcloud projects add-iam-policy-binding [YOUR_PROJECT_ID] \
    --member="serviceAccount:543359650288-compute@developer.gserviceaccount.com" \
    --role="roles/storage.admin"

# 2. Grant the Storage Object Viewer role to ensure full build access
gcloud projects add-iam-policy-binding [YOUR_PROJECT_ID] \
    --member="serviceAccount:543359650288-compute@developer.gserviceaccount.com" \
    --role="roles/storage.objectViewer"
```

*Note: If you run into build issues again, verify that the **Cloud Storage API**, **Cloud Build API**, **Artifact Registry API**, and **Cloud Run Admin API** are all fully enabled in your GCP project console.*

---

## 3. Step-by-Step Deployment to Google Cloud Run

To safely deploy your bundled full-stack code using the `Dockerfile` already crafted for you, execute this simple command in your project directory:

```bash
gcloud run deploy ielts-crm \
    --source . \
    --platform managed \
    --region asia-southeast1 \
    --allow-unauthenticated \
    --max-instances 1 \
    --memory 512Mi
```

### Free-Tier Scaling Safeguards Applied Here:
*   `--max-instances 1`: Prevents Google Cloud from scaling up multiple parallel containers in response to brief spiky traffic, keeping your compute usage well within the Free Tier.
*   `--memory 512Mi`: Configures the container to execute smoothly without requesting expensive resource sizes.
*   `--allow-unauthenticated`: Permits public traffic to visit your React frontend and public web forms.

---

## 4. Configuring Your Custom Subdomain (Free)

Google Cloud provides **domestic, fully managed free SSL certificates** for any custom domains or subdomains mapped to Cloud Run.

### Method A: Direct Cloud Run Mapping (Easiest)
1. Go to the **Google Cloud Console**.
2. Navigate to **Cloud Run** -> click on your service `ielts-crm`.
3. Select the **Integrations** or **Manage Custom Domains** tab (or search for *Cloud Run Domain Mappings* in the console).
4. Click **Add Mapping**.
5. Select your verified custom domain or type in your custom subdomain (e.g., `crm.yourdomain.com`).
6. Cloud Run will provide a set of **DNS Records** (one `CNAME` or multiple `A`/`AAAA` records).
7. Copy these records and add them as your DNS configuration in your domain registrar (e.g., Namecheap, Cloudflare, GoDaddy).
8. Google will automatically provision and renew a free Let's Encrypt SSL certificate for your subdomain within a few hours.

### Method B: Firebase Hosting Proxy (Highly Recommended for CDNs)
Since you are already using Firebase Client-SDK, you can map your subdomain to Firebase Hosting completely free with full global CDN caching:
1. Initialize Firebase Hosting in your local workspace:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init hosting
   ```
2. When asked, choose your existing project, and set the public directory to `dist`.
3. Open your `firebase.json` and add a redirect rule to route all API and web requests directly to your Cloud Run service:
   ```json
   {
     "hosting": {
       "public": "dist",
       "ignore": [
         "firebase.json",
         "**/.*",
         "**/node_modules/**"
       ],
       "rewrites": [
         {
           "source": "**",
           "run": {
             "serviceId": "ielts-crm",
             "region": "asia-southeast1"
           }
         }
       ]
     }
   }
   ```
4. Deploy the configuration:
   ```bash
   firebase deploy --only hosting
   ```
5. Go to the **Firebase Console** -> **Hosting** -> click **Add Custom Domain** and follow the instructions to configure your subdomain. Firebase handles global fast delivery and SSL completely for free.
