# 🚀 Quick Deployment Checklist

## Before Deploying

### Backend (.env file for Render)
- [ ] DATABASE_URL is set ✓ (already in .env)
- [ ] JWT_SECRET is set ✓ (already in .env)
- [ ] package.json has `"start": "node server.js"` ✓
- [ ] No hardcoded ports in production config

### Frontend 
- [ ] config.js has correct API URL pattern
- [ ] api.js loads config.js BEFORE making requests
- [ ] All HTML files load config.js in `<head>`

---

## Step-by-Step Deployment

### 1️⃣ Deploy Backend to Render

**Render Setup:**
```
Service Name: lala-backend
Environment: Node
Build Command: npm install
Start Command: npm start
Region: (your choice)
```

**Environment Variables on Render:**
```
DATABASE_URL=postgresql://neondb_owner:npg_Uo10QHuMdmAi@ep-rapid-mountain-aq0it7q0-pooler.c-8.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require
JWT_SECRET=lala_secret_key_2026_zambia
NODE_ENV=production
```

**After Deployment:**
- ✅ Render gives you URL: `https://lala-backend-xxxxxx.onrender.com`
- ✅ Test it: `curl https://lala-backend-xxxxxx.onrender.com/`

---

### 2️⃣ Update Frontend API URL

Edit `lala-frontend/config.js` and replace:
```javascript
window.API_URL = 'https://lala-backend-xxxxx.onrender.com/api'; // ← Use your Render URL
```

---

### 3️⃣ Deploy Frontend to Vercel

**Vercel Setup:**
```
Project: lala-frontend
Framework: Other
Output Directory: .
```

**No environment variables needed** (since we hardcoded the Render URL in config.js)

**After Deployment:**
- ✅ Vercel gives you URL: `https://lala-frontend-xxxxxx.vercel.app`
- ✅ Visit URL and test API calls

---

## Testing the Deployment

### Test Backend Health
```bash
curl https://lala-backend-xxxxxx.onrender.com/
# Should return: "Lala Backend API is running..."
```

### Test Frontend → Backend Connection
1. Visit `https://lala-frontend-xxxxxx.vercel.app`
2. Open DevTools (F12) → Network tab
3. Try requesting an OTP
4. Should see POST request to your Render backend
5. Check Console for: `🔗 Connected to API: https://lala-backend-xxxxxx.onrender.com/api`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Frontend shows blank page | Check browser console for errors |
| Can't reach backend from frontend | Check Render is running, verify URL in config.js |
| CORS errors | Ensure `cors()` is enabled in Express (already is ✓) |
| Database connection fails | Verify DATABASE_URL in Render environment |
| Render app won't start | Check logs: `npm start` command runs correctly |

---

## Important Notes

- **Render**: Backend goes here. Free tier auto-sleeps after 15 min inactivity.
- **Vercel**: Frontend goes here. Free tier has faster deployments.
- **Neon**: Already configured ✓. Both services connect via DATABASE_URL.
- **CORS**: Already enabled in Express ✓. No changes needed.

---

## Custom Domains (Optional)

### Add Custom Domain to Render Backend
1. Render Dashboard → Settings → Custom Domain
2. Add: `api.yourdomain.com`
3. Update DNS with CNAME record

### Add Custom Domain to Vercel Frontend
1. Vercel Dashboard → Settings → Domains
2. Add: `yourdomain.com`
3. Update DNS with CNAME record

Then update `config.js`:
```javascript
window.API_URL = 'https://api.yourdomain.com/api';
```

---

## Production Checklist

- [ ] Backend deployed to Render and auto-syncing with Neon
- [ ] Frontend deployed to Vercel with correct API URL
- [ ] SSL/HTTPS working on both platforms
- [ ] Tested OTP request/verify flow end-to-end
- [ ] Checked error logs in both services
- [ ] Database connection is stable
- [ ] Frontend can reach backend without CORS issues

**You're done! 🎉**
