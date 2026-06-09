# Lala Deployment Guide

## **Render Deployment (Backend)**

### **Step 1: Push to GitHub**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

### **Step 2: Create Render Service**
1. Go to [render.com](https://render.com)
2. Sign up/login
3. Click **New +** → **Web Service**
4. Connect your GitHub repository
5. Configure:
   - **Name**: lala-backend
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Region**: Choose closest to users

### **Step 3: Add Environment Variables**
In Render dashboard, go to **Environment** and add:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://neondb_owner:npg_Uo10QHuMdmAi@ep-rapid-mountain-aq0it7q0-pooler.c-8.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require` |
| `JWT_SECRET` | `lala_secret_key_2026_zambia` |
| `NODE_ENV` | `production` |
| `PORT` | `5000` |

### **Step 4: Deploy**
- Click **Deploy**
- Wait for build to complete
- You'll get a URL like: `https://lala-backend-xxxxx.onrender.com`

---

## **Vercel Deployment (Frontend)**

### **Step 1: Create vercel.json**
Create a file `lala-frontend/vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".",
  "env": {
    "VITE_API_URL": "@vite_api_url"
  }
}
```

### **Step 2: Push Frontend to GitHub**
```bash
cd lala-frontend
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

### **Step 3: Deploy on Vercel**
1. Go to [vercel.com](https://vercel.com)
2. Sign up/login
3. Click **Add New...** → **Project**
4. Import your GitHub repo (lala-frontend)
5. Configure:
   - **Framework Preset**: Other (for static HTML)
   - **Output Directory**: Leave blank

### **Step 4: Add Environment Variables**
In Vercel, go to **Settings** → **Environment Variables**:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://lala-backend-xxxxx.onrender.com` |

### **Step 5: Deploy**
- Click **Deploy**
- Vercel generates URL like: `https://lala-frontend-xxxxx.vercel.app`

---

## **Connect Frontend to Backend**

Update `lala-frontend/api.js`:

```javascript
const API_URL = process.env.VITE_API_URL || 'http://localhost:5000/api';

export const requestOTP = async (phone) => {
  const response = await fetch(`${API_URL}/auth/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone })
  });
  return response.json();
};

export const verifyOTP = async (phone, otp) => {
  const response = await fetch(`${API_URL}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp })
  });
  return response.json();
};

// ... other API functions
```

---

## **Environment Variables Summary**

### **Backend (Render)**
- `DATABASE_URL` - Neon connection string
- `JWT_SECRET` - Your JWT signing key
- `NODE_ENV` - Set to `production`

### **Frontend (Vercel)**
- `VITE_API_URL` - Your Render backend URL

---

## **Testing Deployment**

1. **Test Backend**:
   ```bash
   curl https://lala-backend-xxxxx.onrender.com/
   # Should return: "Lala Backend API is running..."
   ```

2. **Test Frontend**:
   - Visit `https://lala-frontend-xxxxx.vercel.app`
   - Open DevTools → Network tab
   - Try requesting OTP
   - Should see API calls to Render backend

---

## **Custom Domains (Optional)**

### **Render Custom Domain**
1. Go to Render service settings
2. Add custom domain (e.g., `api.yourdomain.com`)
3. Add DNS records as instructed

### **Vercel Custom Domain**
1. Go to Vercel project settings
2. Add domain (e.g., `yourdomain.com`)
3. Update DNS records

---

## **Troubleshooting**

### **Backend won't start**
- Check logs in Render dashboard
- Verify DATABASE_URL is correct
- Ensure all dependencies installed

### **Frontend can't reach backend**
- Check `VITE_API_URL` in Vercel env vars
- Verify Render service is running
- Check CORS configuration in Express

### **Database connection fails**
- Verify Neon connection string
- Check IP allowlist on Neon
- Ensure SSL certificates are valid
